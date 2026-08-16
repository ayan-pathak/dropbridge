import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import { FILES_BUCKET, supabase } from './supabase';
import { getDeviceId } from './keystore';
import { decrypt, decryptJson, encrypt, encryptJson, fromB64, randomIv, toB64 } from './crypto';

const RETENTION_DAYS = Number(import.meta.env.VITE_RETENTION_DAYS ?? 7);

/**
 * Once a file has actually reached another device, it has done its job. Arming
 * a short deadline at that moment is what keeps this a relay rather than a
 * drive that slowly fills with things you already have.
 */
const DELETE_AFTER_DOWNLOAD_MINUTES = Number(
  import.meta.env.VITE_DELETE_AFTER_DOWNLOAD_MINUTES ?? 30,
);

export interface FileMeta {
  name: string;
  type: string;
  size: number;
}

export interface StoredFile {
  id: string;
  meta: FileMeta;
  contentIv: string;
  encSize: number;
  createdAt: Date | null;
  expiresAt: Date | null;
  keep: boolean;
  /** Device that uploaded it, so we can recognise a download from elsewhere. */
  uploadedBy: string | null;
  /** Set once another device has fetched it and the short fuse is lit. */
  downloadedAt: Date | null;
  /** Set when the vault key can't open this record — a pairing went wrong. */
  undecryptable?: boolean;
}

const filesCol = (uid: string) => collection(db, 'users', uid, 'files');

/**
 * First path segment must be the uid: the Supabase RLS policy authorises on
 * `storage.foldername(name)[1]`, so the layout *is* the access control.
 */
const objectPath = (uid: string, fileId: string) => `${uid}/${fileId}`;

export async function uploadFile(
  uid: string,
  vaultKey: CryptoKey,
  file: File,
): Promise<string> {
  const fileId = crypto.randomUUID();

  // Encrypt before anything touches the network. Filename and MIME type go
  // into the encrypted blob too — the Firestore doc keeps only opaque strings.
  const contentIv = randomIv();
  const ciphertext = await encrypt(vaultKey, contentIv, await file.arrayBuffer());
  const meta = await encryptJson(vaultKey, {
    name: file.name,
    type: file.type,
    size: file.size,
  } satisfies FileMeta);

  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(objectPath(uid, fileId), ciphertext, {
      contentType: 'application/octet-stream',
      upsert: false,
    });

  if (error) throw error;

  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000);

  // Metadata is written only after the blob lands, so the list never shows a
  // row whose bytes aren't there yet.
  await setDoc(doc(filesCol(uid), fileId), {
    storagePath: objectPath(uid, fileId),
    meta: meta.data,
    metaIv: meta.iv,
    contentIv: toB64(contentIv),
    encSize: ciphertext.byteLength,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    keep: false,
    uploadedBy: await getDeviceId(),
    downloadedAt: null,
  });

  return fileId;
}

export function watchFiles(
  uid: string,
  vaultKey: CryptoKey,
  onChange: (files: StoredFile[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(filesCol(uid), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      void Promise.all(
        snap.docs.map(async (d): Promise<StoredFile> => {
          const data = d.data();
          const base = {
            id: d.id,
            contentIv: (data.contentIv as string) ?? '',
            encSize: (data.encSize as number) ?? 0,
            createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            expiresAt: (data.expiresAt as Timestamp | null)?.toDate() ?? null,
            keep: Boolean(data.keep),
            uploadedBy: (data.uploadedBy as string | null) ?? null,
            downloadedAt: (data.downloadedAt as Timestamp | null)?.toDate() ?? null,
          };
          try {
            const meta = await decryptJson<FileMeta>(
              vaultKey,
              data.metaIv as string,
              data.meta as string,
            );
            return { ...base, meta };
          } catch {
            // Wrong vault key for this record. Surface it rather than hiding
            // the row, otherwise files silently vanish and look like data loss.
            return {
              ...base,
              meta: { name: 'Locked file', type: '', size: 0 },
              undecryptable: true,
            };
          }
        }),
      ).then(onChange);
    },
    (error) => onError?.(error),
  );
}

export async function downloadFile(
  uid: string,
  vaultKey: CryptoKey,
  file: StoredFile,
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .download(objectPath(uid, file.id));

  if (error) throw error;
  if (!data) throw new Error('File is missing from storage.');

  const plain = await decrypt(vaultKey, fromB64(file.contentIv), await data.arrayBuffer());
  const blob = new Blob([plain], { type: file.meta.type || 'application/octet-stream' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.meta.name;
  anchor.click();
  URL.revokeObjectURL(url);

  // Only arm the fuse after the bytes are safely decrypted on this end — a
  // failed download must never shorten the file's life.
  await armDeletion(uid, file);
}

/**
 * Lights the short fuse when a file reaches a device other than the one that
 * sent it. Re-downloading on the uploading device is not "delivery", and a
 * file the user explicitly marked Keep is exempt.
 */
async function armDeletion(uid: string, file: StoredFile): Promise<void> {
  if (file.keep) return;
  if (!file.uploadedBy) return;

  const deviceId = await getDeviceId();
  if (file.uploadedBy === deviceId) return;

  const deadline = new Date(Date.now() + DELETE_AFTER_DOWNLOAD_MINUTES * 60_000);
  // Never push an existing deadline out — a later download by a third device
  // shouldn't extend the life of something already on its way out.
  if (file.expiresAt && file.expiresAt <= deadline) return;

  await updateDoc(doc(filesCol(uid), file.id), {
    expiresAt: Timestamp.fromDate(deadline),
    downloadedAt: serverTimestamp(),
  });
}

/**
 * Deletes anything past its deadline. Runs on the client because there is no
 * server in this architecture — see the README for what that costs.
 */
export async function sweepExpired(uid: string, files: StoredFile[]): Promise<number> {
  const now = Date.now();
  const due = files.filter(
    (file) => !file.keep && file.expiresAt !== null && file.expiresAt.getTime() <= now,
  );

  for (const file of due) {
    // One failure shouldn't abandon the rest of the sweep.
    await deleteFile(uid, file.id).catch(() => undefined);
  }
  return due.length;
}

export async function deleteFile(uid: string, fileId: string): Promise<void> {
  // Blob first: an orphaned metadata row is recoverable, an orphaned object is
  // invisible and quietly consumes your storage quota.
  await supabase.storage.from(FILES_BUCKET).remove([objectPath(uid, fileId)]);
  await deleteDoc(doc(filesCol(uid), fileId));
}

export async function setKeep(uid: string, fileId: string, keep: boolean): Promise<void> {
  const expiresAt = keep
    ? Timestamp.fromDate(new Date(Date.now() + 3650 * 86_400_000))
    : Timestamp.fromDate(new Date(Date.now() + RETENTION_DAYS * 86_400_000));
  await updateDoc(doc(filesCol(uid), fileId), { keep, expiresAt });
}
