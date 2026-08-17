/**
 * Grants a Firebase user the `role: 'authenticated'` custom claim.
 *
 * Supabase maps a JWT to the `authenticated` Postgres role using its `role`
 * claim. Firebase does not set one, so without this every request arrives as
 * `anon` and RLS rejects it — notes silently fail to load or save.
 *
 * The browser cannot set custom claims; only the Admin SDK can. Run once per
 * user, from a machine you trust with a service account key.
 *
 *   Firebase console -> Project settings -> Service accounts
 *     -> Generate new private key   (this file is a credential: do not commit it)
 *
 *   npx --yes -p firebase-admin node tools/set-auth-claim.mjs <key.json> <email>
 *
 * The new claim reaches the client when the ID token next refreshes — within
 * the hour, or immediately if you sign out and back in.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [keyPath, email] = process.argv.slice(2);

if (!keyPath || !email) {
  console.error('Usage: node tools/set-auth-claim.mjs <service-account.json> <email>');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });

const auth = getAuth();
const user = await auth.getUserByEmail(email);

// Merge rather than replace: blowing away claims someone else set is the kind
// of thing you only notice much later.
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role: 'authenticated' });

console.log(`Set role=authenticated on ${email}`);
console.log(`uid: ${user.uid}`);
console.log('Sign out and back in to pick it up immediately.');
