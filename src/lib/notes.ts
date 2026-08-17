import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
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

const notesCol = (uid: string) => collection(db, 'users', uid, 'notes');

export async function addNote(
  uid: string,
  vaultKey: CryptoKey,
  text: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to save.');
  if (trimmed.length > NOTE_MAX_CHARS) {
    throw new Error(`Notes are capped at ${NOTE_MAX_CHARS.toLocaleString()} characters.`);
  }

  const noteId = crypto.randomUUID();
  // The text itself is the only interesting thing here, so it goes into the
  // encrypted blob whole. Firestore keeps two opaque strings and two dates.
  const body = await encryptJson(vaultKey, { text: trimmed });

  await setDoc(doc(notesCol(uid), noteId), {
    body: body.data,
    bodyIv: body.iv,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + RETENTION_DAYS * 86_400_000)),
  });

  return noteId;
}

export function watchNotes(
  uid: string,
  vaultKey: CryptoKey,
  onChange: (notes: StoredNote[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(notesCol(uid), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      void Promise.all(
        snap.docs.map(async (d): Promise<StoredNote> => {
          const data = d.data();
          const base = {
            id: d.id,
            createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            expiresAt: (data.expiresAt as Timestamp | null)?.toDate() ?? null,
          };
          try {
            const { text } = await decryptJson<{ text: string }>(
              vaultKey,
              data.bodyIv as string,
              data.body as string,
            );
            return { ...base, text };
          } catch {
            // Same call as files: show the row rather than hide it, so a bad
            // pairing looks like what it is instead of like data loss.
            return { ...base, text: '', undecryptable: true };
          }
        }),
      ).then(onChange);
    },
    (error) => onError?.(error),
  );
}

export async function deleteNote(uid: string, noteId: string): Promise<void> {
  await deleteDoc(doc(notesCol(uid), noteId));
}
