-- Encrypted notes: a clipboard shared across a user's paired devices.
-- The server never sees plaintext. `body` is base64 AES-GCM ciphertext produced
-- in the browser under the vault key, and `body_iv` is its nonce.
create table public.notes (
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

create index notes_user_created_idx on public.notes (user_id, created_at desc);

alter table public.notes enable row level security;

create policy "Owners read their own notes"
  on public.notes for select
  to authenticated
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "Owners insert their own notes"
  on public.notes for insert
  to authenticated
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "Owners delete their own notes"
  on public.notes for delete
  to authenticated
  using ((auth.jwt() ->> 'sub') = user_id);

-- Cross-device sync: this is what replaces Firestore's onSnapshot.
alter publication supabase_realtime add table public.notes;
