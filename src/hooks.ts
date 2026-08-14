import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from './lib/firebase';
import { generateVaultKey } from './lib/crypto';
import { clearVaultKey, loadVaultKey, saveVaultKey } from './lib/keystore';
import { watchFiles, type StoredFile } from './lib/files';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setLoading(false);
      }),
    [],
  );

  return { user, loading };
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
