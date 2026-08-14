import { useCallback, useRef, useState, type DragEvent } from 'react';

import { uploadFile } from '../lib/files';

interface Upload {
  id: string;
  name: string;
  progress: number;
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
        setUploads((current) => [...current, { id, name: file.name, progress: 0 }]);
        try {
          await uploadFile(uid, vaultKey, file, (progress) =>
            setUploads((current) =>
              current.map((item) => (item.id === id ? { ...item, progress } : item)),
            ),
          );
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
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
                  <span className="micro" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  <span className="micro">{Math.round(item.progress * 100)}%</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${Math.max(item.progress * 100, 4)}%` }} />
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
