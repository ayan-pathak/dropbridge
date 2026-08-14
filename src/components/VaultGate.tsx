import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { PairRequest } from './PairPanel';
import Scatter from './Scatter';

export default function VaultGate({
  uid,
  onCreate,
  onAdopt,
}: {
  uid: string;
  onCreate: () => Promise<void>;
  onAdopt: (key: CryptoKey) => Promise<void>;
}) {
  const [choice, setChoice] = useState<'ask' | 'pair'>('ask');
  const [hasExistingFiles, setHasExistingFiles] = useState(false);

  useEffect(() => {
    // If files already exist, minting a fresh vault key orphans every one of
    // them permanently. Worth knowing before you click.
    void getDocs(query(collection(db, 'users', uid, 'files'), limit(1))).then((snap) =>
      setHasExistingFiles(!snap.empty),
    );
  }, [uid]);

  if (choice === 'pair') {
    return (
      <div className="center-stage">
        <PairRequest uid={uid} onPaired={(key) => void onAdopt(key)} />
        <button className="btn btn-quiet btn-sm" onClick={() => setChoice('ask')}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="center-stage">
      <Scatter />
      <span className="pill">This device has no key yet</span>

      <h1 className="display">Open the vault</h1>

      <p className="sub" style={{ maxWidth: '30rem' }}>
        Your files are encrypted with a key that lives only on your devices. Bring
        it over from a device that already has it, or start a new vault.
      </p>

      <div className="row" style={{ marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => setChoice('pair')}>
          Pair with another device
        </button>
        <button className="btn btn-ghost" onClick={() => void onCreate()}>
          Start a new vault
        </button>
      </div>

      {hasExistingFiles && (
        <p className="micro" style={{ maxWidth: '28rem', color: 'var(--danger)' }}>
          You already have files stored. Starting a new vault will leave them
          permanently unreadable — pair instead unless that is what you want.
        </p>
      )}
    </div>
  );
}
