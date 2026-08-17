import { createClient } from '@supabase/supabase-js';

import { auth } from './firebase';

function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it from your Supabase project settings.`,
    );
  }
  return value;
}

/**
 * Firebase owns identity; Supabase owns data. The bridge is Supabase's
 * third-party auth: every request carries the Firebase ID token, and RLS reads
 * the user out of it. No second login, no second session to keep in sync.
 *
 * Note the policies key off `auth.jwt() ->> 'sub'`, never `auth.uid()` —
 * auth.uid() casts to ::uuid and a 28-char Firebase uid is not one.
 */
export const supabase = createClient(
  required('VITE_SUPABASE_URL'),
  required('VITE_SUPABASE_PUBLISHABLE_KEY'),
  {
    accessToken: async () => (await auth.currentUser?.getIdToken(false)) ?? null,
  },
);
