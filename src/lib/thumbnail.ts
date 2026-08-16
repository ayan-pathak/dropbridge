/**
 * Previews have to be built on the uploading device, before encryption —
 * the server only ever sees ciphertext, so it can never generate one.
 *
 * The thumbnail is then encrypted like everything else and rides along in the
 * Firestore document, small enough to stay well inside the 1 MiB doc limit.
 */

const MAX_DIM = 400;
const QUALITY = 0.72;

export async function makeThumbnail(file: File): Promise<ArrayBuffer | null> {
  if (!file.type.startsWith('image/')) return null;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    );
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    // A corrupt or exotic image shouldn't block the upload of the real file.
    return null;
  }
}

/** Extension shown when there's no image to preview. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'file';
  return name.slice(dot + 1).toLowerCase().slice(0, 5);
}
