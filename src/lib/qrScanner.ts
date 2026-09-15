/**
 * QR scanning that works on the phones people actually own.
 *
 * BarcodeDetector is a Chromium API — Android Chrome has it, Safari does not
 * and has no plans to. Relying on it alone meant iOS never even asked for the
 * camera. So it stays as the fast path, with jsQR decoding frames off a canvas
 * everywhere else.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type DetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Decoding a downscaled frame is far cheaper and just as reliable at arm's length. */
const DECODE_WIDTH = 480;

/** ~10fps. Faster burns battery without finding the code any sooner. */
const FRAME_INTERVAL_MS = 100;

export interface QrScanHandle {
  stop(): void;
}

function nativeDetector(): ((video: HTMLVideoElement) => Promise<string | null>) | null {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Detector) return null;

  const detector = new Detector({ formats: ['qr_code'] });
  return async (video) => {
    try {
      const [hit] = await detector.detect(video);
      return hit?.rawValue ?? null;
    } catch {
      // A dropped frame is not worth aborting the scan over.
      return null;
    }
  };
}

/**
 * Loaded on demand. Pairing happens once per device, and Android Chrome never
 * needs this at all, so ~45 KB gzipped has no business in the entry bundle.
 */
async function canvasDetector(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return async (video) => {
    const { videoWidth, videoHeight } = video;
    // Dimensions are 0 until the first frame has actually decoded.
    if (!context || !videoWidth || !videoHeight) return null;

    const scale = Math.min(1, DECODE_WIDTH / videoWidth);
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    // The only code this ever scans is one Dropbridge drew: dark on white.
    // Skipping the inverted pass halves the work per frame.
    return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

/** Turns a getUserMedia rejection into something worth showing a person. */
export function describeCameraError(err: unknown): string {
  const name = (err as { name?: string }).name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow it for this site in your browser settings, or enter the code by hand.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      return 'The camera is busy in another app. Close it and try again.';
    default:
      return 'Could not start the camera on this device.';
  }
}

export async function startQrScan(
  video: HTMLVideoElement,
  onFound: (value: string) => void,
): Promise<QrScanHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Safari only exposes getUserMedia over HTTPS, so this is also what a
    // plain-http LAN address looks like from the phone.
    throw Object.assign(new Error('getUserMedia unavailable'), { name: 'NotFoundError' });
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    // `ideal` rather than `exact`: a laptop with only a front camera should
    // still scan rather than being refused outright.
    video: { facingMode: { ideal: 'environment' } },
  });

  let stopped = false;
  let timer = 0;

  function stop() {
    stopped = true;
    window.clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  try {
    video.srcObject = stream;
    // iOS plays video fullscreen unless told otherwise, which would cover the
    // page. React sets this too; belt and braces, because getting it wrong
    // hijacks the whole screen.
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();
  } catch (err) {
    stop();
    throw err;
  }

  const detect = nativeDetector() ?? (await canvasDetector());

  const tick = async () => {
    if (stopped) return;
    const value = await detect(video);
    if (stopped) return;
    if (value) {
      stop();
      onFound(value);
      return;
    }
    timer = window.setTimeout(() => void tick(), FRAME_INTERVAL_MS);
  };
  void tick();

  return { stop };
}
