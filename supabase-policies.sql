-- Dropbridge storage authorisation.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- CRITICAL: Firebase Auth signs every project's JWTs with the SAME global key
-- set, so a token minted by an unrelated Firebase project verifies fine here.
-- The `aud` check below is what scopes access to *your* Firebase project.
-- Remove it and your bucket is readable by any Firebase user anywhere.

-- Firebase JWTs carry no `role` claim, so requests execute as `anon` rather
-- than `authenticated`. Policies therefore target both roles and rely on the
-- claim checks rather than on the Postgres role.

create policy "dropbridge: read own objects"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'files'
  and (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

create policy "dropbridge: write own objects"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'files'
  and (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

create policy "dropbridge: delete own objects"
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'files'
  and (auth.jwt() ->> 'aud') = 'dropbridge-cafe3'
  and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
);

-- Deliberately no UPDATE policy: uploads use upsert:false and files are
-- immutable once written. Replacing bytes under an existing IV would break
-- AES-GCM's guarantees, so the database should refuse it outright.
