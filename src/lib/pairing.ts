/**
 * Moving the vault key to a second device without ever handing it to the server.
 *
 * ECDH over a QR code. The new device shows its ephemeral public key as a QR;
 * the phone scans it, derives a shared secret, and writes back only the vault
 * key *wrapped* under that secret. Firebase sees two public keys and a blob it
 * cannot open — it holds neither private key.
 *
 * The QR is what makes this safe: the public key travels out-of-band across a
 * gap of air between two screens you own, so a malicious server cannot
 * substitute its own key and sit in the middle.
 */

import { fromB64, toB64, type Bytes } from './crypto';

const ECDH: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const INFO = new TextEncoder().encode('dropbridge/pairing/v1');

export interface PairingOffer {
  v: 1;
  id: string;
  pub: string;
}

export interface PairingResponse {
  responderPub: string;
  wrapped: string;
  wrapIv: string;
  salt: string;
}

async function deriveWrapKey(
  privateKey: CryptoKey,
  peerPubB64: string,
  salt: Bytes,
): Promise<CryptoKey> {
  const peerPublicKey = await crypto.subtle.importKey(
    'raw',
    fromB64(peerPubB64),
    ECDH,
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );
  // Raw ECDH output is not a uniformly random key; run it through HKDF before
  // using it, and bind it to this protocol version with `info`.
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: INFO },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Run on the device that has no key yet. Returns the QR payload to display. */
export async function createOffer(
  pairingId: string,
): Promise<{ privateKey: CryptoKey; offer: PairingOffer }> {
  const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveBits']);
  const pub = await crypto.subtle.exportKey('raw', pair.publicKey);
  return {
    privateKey: pair.privateKey,
    offer: { v: 1, id: pairingId, pub: toB64(pub) },
  };
}

/** Run on the device that already holds the vault key, after scanning the QR. */
export async function respondToOffer(
  offer: PairingOffer,
  vaultKey: CryptoKey,
): Promise<PairingResponse> {
  if (offer.v !== 1) throw new Error('Unsupported pairing QR version.');

  const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapKey = await deriveWrapKey(pair.privateKey, offer.pub, salt);
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey('raw', vaultKey, wrapKey, {
    name: 'AES-GCM',
    iv: wrapIv,
  });
  const responderPub = await crypto.subtle.exportKey('raw', pair.publicKey);

  return {
    responderPub: toB64(responderPub),
    wrapped: toB64(wrapped),
    wrapIv: toB64(wrapIv),
    salt: toB64(salt),
  };
}

/** Back on the new device: unwrap the vault key from the response. */
export async function acceptResponse(
  privateKey: CryptoKey,
  response: PairingResponse,
): Promise<CryptoKey> {
  const wrapKey = await deriveWrapKey(
    privateKey,
    response.responderPub,
    fromB64(response.salt),
  );
  return crypto.subtle.unwrapKey(
    'raw',
    fromB64(response.wrapped),
    wrapKey,
    { name: 'AES-GCM', iv: fromB64(response.wrapIv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}
