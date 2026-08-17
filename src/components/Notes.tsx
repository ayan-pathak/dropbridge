import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { addNote, deleteNote, NOTE_MAX_CHARS, type StoredNote } from '../lib/notes';
import { formatRelative } from '../lib/format';

/**
 * Only http(s) becomes clickable. A pasted `javascript:` or `data:` URL stays
 * inert text — this is other devices' input rendered on this one.
 */
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  // String.split with a capturing group interleaves matches at odd indices.
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function Notes({
  uid,
  vaultKey,
  notes,
}: {
  uid: string;
  vaultKey: CryptoKey;
  notes: StoredNote[];
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addNote(uid, vaultKey, draft);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line. Pasting a link and hitting
    // Enter is the whole interaction this exists for.
    if (event.key === 'Enter' && !event.shiftKey) void save(event);
  }

  async function copy(note: StoredNote) {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopiedId(note.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === note.id ? null : current)),
        1500,
      );
    } catch {
      setError('The browser blocked the clipboard. Select the text and copy it manually.');
    }
  }

  async function remove(note: StoredNote) {
    setError(null);
    try {
      await deleteNote(uid, note.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <form onSubmit={save} className="stack" style={{ marginBottom: '1rem' }}>
        <textarea
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste a link or a note, then press Enter"
          aria-label="New note"
          rows={2}
          maxLength={NOTE_MAX_CHARS}
        />
        <div className="spread">
          <span className="micro">
            {draft.trim() ? `${draft.trim().length.toLocaleString()} characters` : 'Shift+Enter for a new line'}
          </span>
          <button className="btn btn-ghost btn-sm" type="submit" disabled={busy || !draft.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      {notes.length === 0 ? (
        <p className="sub" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          Nothing pinned yet.
        </p>
      ) : (
        <div className="notes">
          {notes.map((note) => (
            <article className="note" key={note.id} data-locked={note.undecryptable ?? false}>
              <div className="note-body">
                {note.undecryptable ? (
                  <span className="micro">Encrypted with a different key</span>
                ) : (
                  <Linkified text={note.text} />
                )}
              </div>

              <footer className="note-foot">
                <span className="micro">{formatRelative(note.createdAt)}</span>
                <div className="row">
                  {!note.undecryptable && (
                    <button className="btn btn-ghost btn-sm" onClick={() => void copy(note)}>
                      {copiedId === note.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <button className="btn btn-quiet btn-sm" onClick={() => void remove(note)}>
                    Delete
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
