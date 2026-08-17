import { createClient } from '@supabase/supabase-js';

import { auth } from './firebase';

/**
 * Supabase holds the file bytes; Firebase holds identity and metadata.
 *
 * Authorization is bridged by Supabase's third-party auth: we hand it the
 * Firebase ID token and RLS policies read the claims directly. There is no
 * Supabase session to manage, hence persistSession/autoRefreshToken off —
 * Firebase owns the login lifecycle and this client just borrows the token.
 */

function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    throw new Error(`Missing ${name}. See README "Supabase storage" for setup.`);
  }
  return value;
}

export const supabase = createClient(
  required('VITE_SUPABASE_URL'),
  required('VITE_SUPABASE_ANON_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Called before every request, so a rotated Firebase token is picked up
    // without the client caching a stale one.
    accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
  },
);

export const FILES_BUCKET = 'files';
