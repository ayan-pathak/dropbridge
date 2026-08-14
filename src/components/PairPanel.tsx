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
        setQr(
          await QRCode.toDataURL(JSON.stringify(offer), {
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
  const [canScan, setCanScan] = useState(true);

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
    // BarcodeDetector ships in Chrome on Android, which is where this flow
    // actually runs. Everywhere else falls back to pasting the payload.
    const Detector = (window as unknown as { BarcodeDetector?: new (o: unknown) => {
      detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
    } }).BarcodeDetector;

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCanScan(false);
      return;
    }

    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const [hit] = await detector.detect(videoRef.current);
            if (hit) {
              stopped = true;
              await approve(hit.rawValue);
              return;
            }
          } catch {
            // A dropped frame is not worth aborting the scan loop over.
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setCanScan(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // approve closes over stable props only; re-running would restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, vaultKey]);

  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h2 className="title">Add a device</h2>

      {canScan ? (
        <>
          <p className="sub">Point the camera at the QR on your other screen.</p>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: 'min(20rem, 100%)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)',
              background: '#000',
            }}
          />
        </>
      ) : (
        <>
          <p className="sub" style={{ maxWidth: '26rem' }}>
            No camera scanning here. Copy the pairing code from the other device
            and paste it below.
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
        </>
      )}

      {status && <p className="sub">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
