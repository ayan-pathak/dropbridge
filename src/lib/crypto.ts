/**
 * All plaintext dies here. Everything above this module deals in ciphertext,
 * and Firebase never sees anything else — not file bytes, not filenames.
 */

const IV_BYTES = 12;
const KEY_PARAMS: AesKeyGenParams = { name: 'AES-GCM', length: 256 };

/**
 * Since TS 5.7 a bare `Uint8Array` may be backed by a SharedArrayBuffer, which
 * WebCrypto's BufferSource rejects. Pinning the backing store keeps every
 * call site honest instead of scattering casts through the crypto paths.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toB64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  // Chunked so a large file's ciphertext doesn't blow the argument limit.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromB64(input: string): Bytes {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomIv(): Bytes {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

/** Generates the vault key. Extractable, because pairing has to wrap it. */
export function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(KEY_PARAMS, true, ['encrypt', 'decrypt']);
}

export function encrypt(
  key: CryptoKey,
  iv: Bytes,
  data: BufferSource,
): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
}

export function decrypt(
  key: CryptoKey,
  iv: Bytes,
  data: BufferSource,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
}

export async function encryptJson(
  key: CryptoKey,
  value: unknown,
): Promise<{ iv: string; data: string }> {
  const iv = randomIv();
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const data = await encrypt(key, iv, encoded);
  return { iv: toB64(iv), data: toB64(data) };
}

export async function decryptJson<T>(
  key: CryptoKey,
  iv: string,
  data: string,
): Promise<T> {
  const plain = await decrypt(key, fromB64(iv), fromB64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
