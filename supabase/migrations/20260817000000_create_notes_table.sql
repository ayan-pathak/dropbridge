-- Encrypted notes: a clipboard shared across a user's paired devices.
-- The server never sees plaintext. `body` is base64 AES-GCM ciphertext produced
-- in the browser under the vault key, and `body_iv` is its nonce.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  -- Firebase uid, NOT a Postgres uuid. auth.uid() casts ::uuid and would throw
  -- on a 28-char Firebase sub, so every policy here reads auth.jwt()->>'sub'.
  user_id text not null,
  body text not null,
  body_iv text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Opaque, and bounded so a clipboard cannot drift into a document store.
  constraint notes_body_len check (char_length(body) > 0 and char_length(body) < 20000),
  constraint notes_iv_len check (char_length(body_iv) > 0 and char_length(body_iv) <= 64)
);

create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

-- Mirrors supabase-policies.sql, and for the same reasons.
--
-- Firebase JWTs carry no `role` claim, so requests execute as `anon` rather
-- than `authenticated`; policies must target both. And Firebase signs every
-- project's JWTs with the SAME global key set, so the `aud` check is what
-- scopes access to *your* Firebase project. Drop it and anyone who creates a
-- Firebase project can mint a token with a uid of their choosing and read
-- these rows.
drop policy if exists "dropbridge: read own notes" on public.notes;
drop policy if exists "dropbridge: write own notes" on public.notes;
drop policy if exists "dropbridge: delete own notes" on public.notes;

create policy "dropbridge: read own notes"
on public.notes for select
to anon, authenticated
using (
  (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (auth.jwt() ->> 'sub') = user_id
);

create policy "dropbridge: write own notes"
on public.notes for insert
to anon, authenticated
with check (
  (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (auth.jwt() ->> 'sub') = user_id
);

create policy "dropbridge: delete own notes"
on public.notes for delete
to anon, authenticated
using (
  (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (auth.jwt() ->> 'sub') = user_id
);

-- Deliberately no UPDATE policy: a note is written once and deleted, never
-- edited in place. Rewriting ciphertext under an existing IV would break
-- AES-GCM's guarantees, so the database refuses it outright.

-- Cross-device sync: this is what replaces Firestore's onSnapshot.
-- Guarded so the whole script stays re-runnable, same as supabase-policies.sql.
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception
  when duplicate_object then null;
end $$;
