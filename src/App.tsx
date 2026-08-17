import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { signOut, type User } from 'firebase/auth';

import { auth } from './lib/firebase';
import { useAuth, useFiles, useNotes, useVaultKey } from './hooks';
import { isPipSupported, openPipWindow } from './lib/pip';
import { takeSharedFiles } from './lib/sharedInbox';
import { uploadFile } from './lib/files';

import AuthGate from './components/AuthGate';
import VaultGate from './components/VaultGate';
import DropZone from './components/DropZone';
import FileList from './components/FileList';
import Notes from './components/Notes';
import { PairApprove } from './components/PairPanel';

function Splash() {
  return (
    <div className="center-stage">
      <p className="sub">Opening…</p>
    </div>
  );
}

function Workspace({ user, vaultKey }: { user: User; vaultKey: CryptoKey }) {
  const { files, error } = useFiles(user.uid, vaultKey);
  const { notes, error: notesError } = useNotes(user.uid, vaultKey);
  const [search, setSearch] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Files arriving from the Android share sheet: the service worker parked them
  // in IndexedDB because only this context holds the key to encrypt them.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('shared')) return;
    void (async () => {
      const shared = await takeSharedFiles();
      for (const file of shared) {
        await uploadFile(user.uid, vaultKey, file).catch(() => undefined);
      }
      window.history.replaceState(null, '', window.location.pathname);
      if (shared.length) setNotice(`Sent ${shared.length} file${shared.length > 1 ? 's' : ''}.`);
    })();
  }, [user.uid, vaultKey]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return files;
    return files.filter((file) => file.meta.name.toLowerCase().includes(term));
  }, [files, search]);

  // The one search box covers both halves; a term that hides every file while
  // silently leaving the notes list full would just read as a bug.
  const visibleNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((note) => note.text.toLowerCase().includes(term));
  }, [notes, search]);

  async function popOut() {
    try {
      const win = await openPipWindow();
      win.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(win);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <header className="topbar">
        <span className="wordmark">Dropbridge</span>

        <div className="search-slot" style={{ width: 'min(22rem, 40vw)' }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your drops"
            aria-label="Search files"
          />
        </div>

        <div className="topbar-right">
          {isPipSupported() && !pipWindow && (
            <button className="btn btn-ghost btn-sm" onClick={() => void popOut()}>
              Pop out
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setPairing(true)}>
            Add a device
          </button>
          <button className="btn btn-quiet btn-sm" onClick={() => void signOut(auth)}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        <DropZone uid={user.uid} vaultKey={vaultKey} />

        {notice && (
          <p className="sub" style={{ textAlign: 'center', marginTop: '1rem' }}>
            {notice}
          </p>
        )}

        <hr className="divider" />

        <div className="spread" style={{ marginBottom: '1rem' }}>
          <h2 className="title">Notes</h2>
          <span className="micro">
            {visibleNotes.length} note{visibleNotes.length === 1 ? '' : 's'}
          </span>
        </div>

        {notesError && <p className="error">{notesError}</p>}
        <Notes uid={user.uid} vaultKey={vaultKey} notes={visibleNotes} />

        <hr className="divider" />

        <div className="spread" style={{ marginBottom: '1rem' }}>
          <h2 className="title">{search ? 'Matches' : 'Recent'}</h2>
          <span className="micro">{visible.length} file{visible.length === 1 ? '' : 's'}</span>
        </div>

        {error && <p className="error">{error}</p>}
        <FileList uid={user.uid} vaultKey={vaultKey} files={visible} />
      </main>

      {/* The always-on-top drop target, rendered into a real OS-level window. */}
      {pipWindow &&
        createPortal(
          <DropZone uid={user.uid} vaultKey={vaultKey} compact />,
          pipWindow.document.body,
        )}

      {pairing && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPairing(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(10, 10, 11, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '1.75rem',
              maxWidth: '30rem',
              width: '100%',
            }}
          >
            <PairApprove uid={user.uid} vaultKey={vaultKey} onDone={() => setPairing(false)} />
            <div style={{ display: 'grid', placeItems: 'center', marginTop: '1rem' }}>
              <button className="btn btn-quiet btn-sm" onClick={() => setPairing(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const { user, loading, authError, clearAuthError } = useAuth();
  const { vaultKey, status, createVault, adoptKey } = useVaultKey();

  if (loading || status === 'loading') return <Splash />;
  if (!user) return <AuthGate redirectError={authError} onClearError={clearAuthError} />;
  if (!vaultKey) {
    return <VaultGate uid={user.uid} onCreate={createVault} onAdopt={adoptKey} />;
  }
  return <Workspace user={user} vaultKey={vaultKey} />;
}
