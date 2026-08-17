import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { decryptJson, encryptJson } from './crypto';

const RETENTION_DAYS = Number(import.meta.env.VITE_RETENTION_DAYS ?? 7);

/** Room for a link or a paragraph. This is a clipboard, not a document store. */
export const NOTE_MAX_CHARS = 8000;

export interface StoredNote {
  id: string;
  text: string;
  createdAt: Date | null;
  expiresAt: Date | null;
  /** Set when the vault key can't open this record — a pairing went wrong. */
  undecryptable?: boolean;
}

interface NoteRow {
  id: string;
  body: string;
  body_iv: string;
  created_at: string;
  expires_at: string;
}

const COLUMNS = 'id, body, body_iv, created_at, expires_at';

async function decode(vaultKey: CryptoKey, rows: NoteRow[]): Promise<StoredNote[]> {
  return Promise.all(
    rows.map(async (row): Promise<StoredNote> => {
      const base = {
        id: row.id,
        createdAt: row.created_at ? new Date(row.created_at) : null,
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      };
      try {
        const { text } = await decryptJson<{ text: string }>(vaultKey, row.body_iv, row.body);
        return { ...base, text };
      } catch {
        // Show the row rather than hide it, so a bad pairing looks like what it
        // is instead of like data loss. Same call the file list makes.
        return { ...base, text: '', undecryptable: true };
      }
    }),
  );
}

export async function addNote(
  uid: string,
  vaultKey: CryptoKey,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to save.');
  if (trimmed.length > NOTE_MAX_CHARS) {
    throw new Error(`Notes are capped at ${NOTE_MAX_CHARS.toLocaleString()} characters.`);
  }

  // Encrypted here, in the browser. Postgres only ever holds the ciphertext.
  const body = await encryptJson(vaultKey, { text: trimmed });

  const { error } = await supabase.from('notes').insert({
    user_id: uid,
    body: body.data,
    body_iv: body.iv,
    expires_at: new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString(),
  });

  if (error) throw new Error(error.message);
}

export function watchNotes(
  uid: string,
  vaultKey: CryptoKey,
  onChange: (notes: StoredNote[]) => void,
  onError?: (error: Error) => void,
): () => void {
  let live = true;

  async function refresh() {
    const { data, error } = await supabase
      .from('notes')
      .select(COLUMNS)
      .eq('user_id', uid)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (!live) return;
    if (error) {
      onError?.(new Error(error.message));
      return;
    }
    onChange(await decode(vaultKey, (data ?? []) as NoteRow[]));
  }

  // Postgres has no TTL policy, so expiry is swept here. RLS scopes the delete
  // to this user, and the query above hides anything the sweep hasn't caught.
  void supabase
    .from('notes')
    .delete()
    .eq('user_id', uid)
    .lt('expires_at', new Date().toISOString())
    .then(() => undefined);

  void refresh();

  let channel: RealtimeChannel | null = null;

  void (async () => {
    // supabase-js resolves the accessToken callback exactly once, when the
    // client is constructed -- which is at import time, before Firebase has
    // restored the session. The socket therefore starts with a null token,
    // RLS drops every change event, and the board only updates on reload.
    //
    // Calling setAuth() with no argument re-runs that same callback, so it
    // picks up the now-present Firebase token and stays in callback mode --
    // meaning it keeps refreshing itself on heartbeat as the token rotates.
    try {
      await supabase.realtime.setAuth();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
    if (!live) return;

    // Realtime is what makes the other device light up; it replaces Firestore's
    // onSnapshot. Refetching on any change keeps decryption in one place.
    channel = supabase
      .channel(`notes:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${uid}` },
        () => void refresh(),
      )
      .subscribe((status) => {
        // Silence here is the failure mode that cost the most time, so a socket
        // that cannot subscribe should say so rather than look merely idle.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error(`Live sync unavailable (${status}). Notes will still load on refresh.`));
        }
      });
  })();

  return () => {
    live = false;
    if (channel) void supabase.removeChannel(channel);
  };
}

export async function deleteNote(uid: string, noteId: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', noteId).eq('user_id', uid);
  if (error) throw new Error(error.message);
}
