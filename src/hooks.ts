import { useCallback, useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from './lib/firebase';
import { describeAuthError } from './lib/authError';
import { generateVaultKey } from './lib/crypto';
import { clearVaultKey, loadVaultKey, saveVaultKey } from './lib/keystore';
import { watchFiles, type StoredFile } from './lib/files';
import { watchNotes, type StoredNote } from './lib/notes';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // A redirect sign-in finishes on the *next* page load, and getRedirectResult
    // is the only place it reports having failed. Until it settles,
    // onAuthStateChanged says null -- publishing that would flash the sign-in
    // screen over a sign-in that is still landing, and drop the error entirely.
    let redirectSettled = false;
    let sawAuthState = false;
    let current: User | null = null;

    function publish() {
      if (!live || !redirectSettled || !sawAuthState) return;
      setUser(current);
      setLoading(false);
    }

    const stop = onAuthStateChanged(auth, (next) => {
      current = next;
      sawAuthState = true;
      publish();
    });

    void getRedirectResult(auth)
      .catch((err: unknown) => {
        if (live) setAuthError(describeAuthError(err));
      })
      .finally(() => {
        redirectSettled = true;
        publish();
      });

    return () => {
      live = false;
      stop();
    };
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return { user, loading, authError, clearAuthError };
}

export type VaultStatus = 'loading' | 'missing' | 'ready';

export function useVaultKey() {
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [status, setStatus] = useState<VaultStatus>('loading');

  useEffect(() => {
    void loadVaultKey().then((key) => {
      setVaultKey(key);
      setStatus(key ? 'ready' : 'missing');
    });
  }, []);

  const adoptKey = useCallback(async (key: CryptoKey) => {
    await saveVaultKey(key);
    setVaultKey(key);
    setStatus('ready');
  }, []);

  const createVault = useCallback(async () => {
    await adoptKey(await generateVaultKey());
  }, [adoptKey]);

  const forgetVault = useCallback(async () => {
    await clearVaultKey();
    setVaultKey(null);
    setStatus('missing');
  }, []);

  return { vaultKey, status, createVault, adoptKey, forgetVault };
}

export function useFiles(uid: string | null, vaultKey: CryptoKey | null) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !vaultKey) {
      setFiles([]);
      return;
    }
    setError(null);
    return watchFiles(uid, vaultKey, setFiles, (err) => setError(err.message));
  }, [uid, vaultKey]);

  return { files, error };
}

export function useNotes(uid: string | null, vaultKey: CryptoKey | null) {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !vaultKey) {
      setNotes([]);
      return;
    }
    setError(null);
    return watchNotes(uid, vaultKey, setNotes, (err) => setError(err.message));
  }, [uid, vaultKey]);

  return { notes, error };
}
