import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import QRCode from 'qrcode';

import { db } from '../lib/firebase';
import {
  acceptResponse,
  createOffer,
  respondToOffer,
  type PairingOffer,
} from '../lib/pairing';
import { describeCameraError, startQrScan, type QrScanHandle } from '../lib/qrScanner';

const pairingDoc = (uid: string, id: string) => doc(db, 'users', uid, 'pairings', id);

/**
 * Shown on the device that has no vault key yet. Displays its own ephemeral
 * public key as a QR and waits for the other device to send the wrapped key back.
 */
export function PairRequest({
  uid,
  onPaired,
}: {
  uid: string;
  onPaired: (key: CryptoKey) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const pairingId = crypto.randomUUID();

    void (async () => {
      try {
        const { privateKey, offer } = await createOffer(pairingId);
        await setDoc(pairingDoc(uid, pairingId), {
          requesterPub: offer.pub,
          createdAt: serverTimestamp(),
        });

        if (cancelled) return;
        const encoded = JSON.stringify(offer);
        setPayload(encoded);
        setQr(
          await QRCode.toDataURL(encoded, {
            margin: 1,
            width: 280,
            errorCorrectionLevel: 'L',
          }),
        );

        unsubscribe = onSnapshot(pairingDoc(uid, pairingId), (snap) => {
          const data = snap.data();
          if (!data?.wrapped) return;
          void acceptResponse(privateKey, {
            responderPub: data.responderPub as string,
            wrapped: data.wrapped as string,
            wrapIv: data.wrapIv as string,
            salt: data.salt as string,
          })
            .then((key) => {
              onPaired(key);
              // The handshake is single-use; leaving it around is pure liability.
              return deleteDoc(pairingDoc(uid, pairingId));
            })
            .catch((err: Error) => setError(err.message));
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      void deleteDoc(pairingDoc(uid, pairingId)).catch(() => undefined);
    };
  }, [uid, onPaired]);

  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h2 className="title">Scan this with your paired phone</h2>
      <p className="sub" style={{ maxWidth: '26rem' }}>
        Open Dropbridge on the device that already has your files, choose{' '}
        <strong>Add a device</strong>, and point it here.
      </p>

      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-card)',
          padding: '0.875rem',
          lineHeight: 0,
          minHeight: 200,
          minWidth: 200,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {qr ? (
          <img src={qr} alt="Pairing QR code" width={280} height={280} />
        ) : (
          <span style={{ color: '#0a0a0b', fontSize: 13 }}>Generating…</span>
        )}
      </div>

      {/* The other device may not be able to scan — an iPhone with the camera
          blocked, say — and then this code is the only way through. */}
      <button
        className="btn btn-quiet btn-sm"
        disabled={!payload}
        onClick={() => {
          if (!payload) return;
          void navigator.clipboard
            .writeText(payload)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => setError('Could not reach the clipboard. Select the code below instead.'));
        }}
      >
        {copied ? 'Code copied' : "Can't scan? Copy the code"}
      </button>

      {copied && payload && (
        <textarea
          className="input"
          readOnly
          value={payload}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            borderRadius: 'var(--radius-sm)',
            minHeight: '4.5rem',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        />
      )}

      <p className="micro" style={{ maxWidth: '26rem' }}>
        The key travels between the two screens, not through the server. That gap
        of air is what stops anyone in the middle from substituting their own key.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * Shown on the device that holds the vault key. Scans the other device's QR and
 * writes back the key wrapped under a secret only those two devices can derive.
 */
export function PairApprove({
  uid,
  vaultKey,
  onDone,
}: {
  uid: string;
  vaultKey: CryptoKey;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function approve(raw: string) {
    setStatus('Wrapping key…');
    try {
      const offer = JSON.parse(raw) as PairingOffer;
      const response = await respondToOffer(offer, vaultKey);
      await setDoc(pairingDoc(uid, offer.id), response, { merge: true });
      setStatus('Paired.');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    }
  }

  useEffect(() => {
    if (mode !== 'camera') return;

    let handle: QrScanHandle | null = null;
    let cancelled = false;

    void (async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        handle = await startQrScan(video, (value) => void approve(value));
        // The panel can close while the permission prompt is still up.
        if (cancelled) handle.stop();
      } catch (err) {
        if (cancelled) return;
        setCameraError(describeCameraError(err));
        setMode('manual');
      }
    })();

    return () => {
      cancelled = true;
      handle?.stop();
    };
    // approve closes over stable props only; re-running would restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, uid, vaultKey]);

  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h2 className="title">Add a device</h2>

      {mode === 'camera' ? (
        <>
          <p className="sub">Point the camera at the QR on your other screen.</p>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: 'min(20rem, 100%)',
              aspectRatio: '1 / 1',
              objectFit: 'cover',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)',
              background: '#000',
            }}
          />
          <button className="btn btn-quiet btn-sm" onClick={() => setMode('manual')}>
            Enter the code instead
          </button>
        </>
      ) : (
        <>
          <p className="sub" style={{ maxWidth: '26rem' }}>
            {cameraError ??
              'On the other device tap "Can\'t scan? Copy the code", then paste it here.'}
          </p>
          <textarea
            className="input"
            style={{ borderRadius: 'var(--radius-sm)', minHeight: '6rem', fontFamily: 'monospace' }}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Paste pairing code"
          />
          <button
            className="btn btn-primary"
            disabled={!manual.trim()}
            onClick={() => void approve(manual.trim())}
          >
            Approve device
          </button>
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => {
              setCameraError(null);
              setMode('camera');
            }}
          >
            Try the camera
          </button>
        </>
      )}

      {status && <p className="sub">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
