import { useCallback, useRef, useState, type DragEvent } from 'react';

import { uploadFile } from '../lib/files';

interface Upload {
  id: string;
  name: string;
}

/**
 * Storage errors are opaque by default — a missing bucket and a rejected RLS
 * policy both surface as terse strings. Name the actual cause so setup
 * mistakes don't read as "the app is broken".
 */
function describeUploadError(err: unknown): string {
  const message = (err as { message?: string }).message ?? String(err);

  if (/bucket not found/i.test(message)) {
    return 'The storage bucket doesn’t exist yet. Create a bucket named “files” in Supabase.';
  }
  if (/row-level security|violates|unauthorized|403/i.test(message)) {
    return 'Storage rejected the upload. Check the Supabase policies and that Firebase is registered as a third-party auth provider.';
  }
  if (/exceeded|quota|payload too large|413/i.test(message)) {
    return 'File is too large for the current storage plan.';
  }
  return message;
}

export default function DropZone({
  uid,
  vaultKey,
  compact = false,
}: {
  uid: string;
  vaultKey: CryptoKey;
  compact?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const id = crypto.randomUUID();
        setUploads((current) => [...current, { id, name: file.name }]);
        try {
          await uploadFile(uid, vaultKey, file);
          setError(null);
        } catch (err) {
          setError(describeUploadError(err));
        } finally {
          setUploads((current) => current.filter((item) => item.id !== id));
        }
      }
    },
    [uid, vaultKey],
  );

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setActive(false);
    void send(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className="dropzone"
      data-active={active}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
      style={{ padding: compact ? '1.25rem' : 'clamp(2.5rem, 9vh, 5rem) 1.5rem' }}
    >
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: '1rem' }}>
        {compact ? (
          <p className="title">Drop here</p>
        ) : (
          <>
            <h1 className="display">
              Drop anything.
              <br />
              It&rsquo;s on your phone.
            </h1>
            <p className="sub">Encrypted here, before it goes anywhere.</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void send(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
        <button
          className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-primary'}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </button>

        {uploads.length > 0 && (
          <div className="stack" style={{ width: 'min(24rem, 100%)', gap: '0.5rem' }}>
            {uploads.map((item) => (
              <div key={item.id} className="stack" style={{ gap: '0.375rem' }}>
                <div className="spread">
                  <span
                    className="micro"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {item.name}
                  </span>
                  <span className="micro">Encrypting…</span>
                </div>
                {/* Indeterminate: the storage client reports completion, not
                    byte-level progress, and a faked percentage would lie. */}
                <div className="progress" data-indeterminate="true">
                  <span />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
