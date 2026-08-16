import { useState } from 'react';

import { deleteFile, downloadFile, setKeep, type StoredFile } from '../lib/files';
import { expiryLabel, formatBytes, formatRelative } from '../lib/format';

export default function FileList({
  uid,
  vaultKey,
  files,
}: {
  uid: string;
  vaultKey: CryptoKey;
  files: StoredFile[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (files.length === 0) {
    return (
      <p className="sub" style={{ textAlign: 'center', padding: '2rem 0' }}>
        Nothing here yet.
      </p>
    );
  }

  return (
    <>
      {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      <div className="tiles">
        {files.map((file) => (
          <div className="tile" key={file.id} data-locked={file.undecryptable ?? false}>
            <div className="tile-name" title={file.meta.name}>
              {file.meta.name}
            </div>

            <div className="micro">
              {file.undecryptable
                ? 'Encrypted with a different key'
                : `${formatBytes(file.meta.size)} · ${formatRelative(file.createdAt)}`}
            </div>
            <div className="micro">
              {expiryLabel(file.expiresAt, file.keep, file.downloadedAt)}
            </div>

            <div className="tile-actions">
              <button
                className="btn btn-ghost btn-sm"
                disabled={busyId === file.id || file.undecryptable}
                onClick={() => void run(file.id, () => downloadFile(uid, vaultKey, file))}
              >
                {busyId === file.id ? '…' : 'Download'}
              </button>
              {!file.undecryptable && (
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busyId === file.id}
                  onClick={() => void run(file.id, () => setKeep(uid, file.id, !file.keep))}
                  title={file.keep ? 'Let it expire again' : 'Exempt from auto-delete'}
                >
                  {file.keep ? 'Unkeep' : 'Keep'}
                </button>
              )}
              <button
                className="btn btn-quiet btn-sm"
                disabled={busyId === file.id}
                onClick={() => void run(file.id, () => deleteFile(uid, file.id))}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
