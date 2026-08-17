# Dropbridge

An encrypted drop box between your laptop and your phone. Drag a file onto a
floating window on the desktop; it appears on the phone seconds later. Nothing
readable ever reaches the server — not the file bytes, not even the filenames.

Built because the usual answers don't work on a locked-down work laptop: no
personal email, no admin rights, no USB, and cloud storage that syncs your whole
life is the wrong tool for "get this PDF onto my phone."

---

## How it works

```
Phone PWA                            Desktop web app
    │                                       │
    ├──────────► Firebase ◄─────────────────┤
    │            Auth · Firestore           │
    │                                       │
    └──────────► Supabase ◄─────────────────┘
                 Storage · Postgres (notes)

Firestore holds opaque metadata.  Supabase holds ciphertext,
both the file bytes and the notes.  The key never leaves
your devices.
```

Supabase authorises against the *Firebase* ID token via its third-party auth
integration, so there is one login and no second account to manage.

- **AES-GCM 256** encryption in the browser before upload. Firebase stores
  ciphertext and an opaque blob of encrypted metadata.
- **The vault key lives only in IndexedDB** on paired devices. It is never sent
  to the server, so a breach of the backend yields nothing readable.
- **Pairing moves the key over a QR code** using ECDH P-256 + HKDF. The public
  key crosses a gap of air between two screens you own, which is what prevents
  a malicious server from putting itself in the middle.
- **Files auto-expire.** The default is 7 days unless you mark one "Keep".

### The trade you are making

Losing every paired device loses the data. There is no recovery, because there
is no escrow — that is the point. Dropbridge is a relay, not an archive.

---

## Setup

### 1. Firebase project

Use a **dedicated project**. Deploying rules replaces the *entire* ruleset for a
database or bucket, so pointing this at a project that runs something else will
break that app.

In the [Firebase console](https://console.firebase.google.com):

1. **Authentication → Sign-in method →** enable **Google** *and*
   **Email/Password**. Both, not either: Google is the fast path, and the
   password is the way in on a laptop that blocks personal Google accounts in
   the browser.
   - Under **Authentication → Settings → Authorized domains**, confirm your
     Hosting domain is listed. Sign-in fails with `auth/unauthorized-domain`
     from anywhere that is not.
2. **Firestore Database → Create database →** *Production mode*
3. **Project settings → General → Your apps → Add app → Web**, and copy the
   config values.

Firebase Storage is deliberately unused — it requires the Blaze plan, and
Supabase's free tier covers this app's needs without a billing account.

### 1b. Supabase (storage and notes)

1. Create a project at [supabase.com](https://supabase.com) — no card required.
2. **Storage → New bucket** → name it `files`, leave it **private**.
3. **Authentication → Sign In / Providers → Third-Party Auth** → add **Firebase**
   and enter your Firebase project ID.
4. **SQL Editor** → run `supabase-policies.sql`, then run
   `supabase/migrations/20260817000000_create_notes_table.sql`. The first
   authorises the bucket; the second creates the notes table, its policies, and
   adds it to the `supabase_realtime` publication — realtime is what makes a
   note appear on the other device.
5. **Project Settings → API** → copy the URL and anon key into `.env`.

The policies pin `aud` to your Firebase project ID for a reason: **Firebase
signs every project's JWTs with the same global key set**, so without that check
a token from any unrelated Firebase project would authorise against your data.

They also read `auth.jwt() ->> 'sub'` rather than `auth.uid()`, and target
`anon` as well as `authenticated`. Firebase tokens carry no `role` claim, so
requests arrive as `anon`; and `auth.uid()` casts to `uuid`, which a 28-char
Firebase uid is not — it fails with `invalid input syntax for type uuid`.

Free tier is 1 GB of storage and 5 GB egress per month. Projects also **pause
after 7 days of inactivity** and need a manual restore — invisible for daily
use, annoying after a holiday.

### 2. Guard the bill

Blaze has no hard spending cap — budgets *alert*, they do not stop. Do both of
these before you deploy:

- **Cloud console → Billing → Budgets & alerts** → budget at $1
- **Firebase console → App Check** → register the web app with reCAPTCHA v3,
  then put the site key in `.env`. This is what stops anyone who finds your
  (inherently public) web API key from spending your money.

### 4. Local

```bash
cp .env.example .env
```

Fill in the six `VITE_FIREBASE_*` values, then:

```bash
npm install
```

```bash
npm run dev
```

### 5. Icons

The manifest needs two PNGs that aren't in the repo. Open `tools/make-icons.html`
in a browser, click the button, and save both files into `public/icons/`.

### 6. Deploy

```bash
npx firebase login
```

```bash
npx firebase use --add
```

```bash
npm run deploy
```

Firebase Hosting serves it over HTTPS on a real certificate, which is what makes
the PWA installable — a self-signed cert on a LAN address will not work, because
service workers refuse to register outside a secure context.

### 6. Auto-delete

A file has two possible lifetimes, whichever comes first:

- **Undelivered:** `VITE_RETENTION_DAYS`, default 7 days.
- **Delivered:** `VITE_DELETE_AFTER_DOWNLOAD_MINUTES`, default 30 minutes,
  starting the moment a *different* device downloads it. Re-downloading on the
  device that uploaded it doesn't count — that isn't delivery. Files marked
  **Keep** are exempt from both.

Notes need no setup at all: Postgres has no TTL policy, so the app sweeps its
own expired rows on load and filters the rest out of the query.

A deadline can only ever move closer, never further out, so a later download by
a third device can't extend the life of something already on its way out.

**Enforcement is client-side.** The app sweeps on open and every 60 seconds
while running. There is no server in this architecture, so "30 minutes" is a
floor, not a ceiling: if no device opens the app for two days, deletion happens
two days later. The bytes stay encrypted throughout, so the exposure is quota
and retention, not confidentiality.

Add **Firestore TTL** as a backstop for the metadata: Cloud console → Firestore
→ Time-to-live → policy on collection group `files`, field `expiresAt`. Note it
only reaps Firestore documents, not the Supabase objects, and Google's TTL
sweep runs within ~24h of expiry rather than promptly.

If you later want deletion that happens whether or not the app is open,
Supabase's `pg_cron` plus an Edge Function can do it on the free tier.

---

## Using it

**First device.** Sign up on your phone — **Continue with Google**, or an email
and password if you would rather not (verification goes to your inbox). Then
choose **Start a new vault**.

**Set a password too.** Whichever way you signed up, add a password to the
account before you go near the laptop. Managed machines routinely block signing
a personal Google account into the browser, and the password is what gets you in
when they do — that is the whole reason both methods exist here.

**Second device.** Sign in as the same account — no inbox access needed, which is
the point on a work laptop. Choose **Pair with another device**, then on the
phone tap **Add a device** and scan the QR.

If the laptop blocks popups, Google sign-in falls back to a full-page redirect on
its own. Should the redirect itself fail, the reason now comes back to the
sign-in screen rather than dropping you there with no explanation.

**Notes.** The board above the file list is a shared clipboard. Paste a link,
press Enter, and it is on your other device within a second — Supabase Realtime
pushes it. The text is encrypted under the same vault key the files use, so
Postgres holds ciphertext and two timestamps. **Copy** puts it back on the
system clipboard, which is the whole point when the alternative is emailing
yourself a URL. Links are clickable; anything that is not `http(s)` stays inert
text. Notes expire on the same clock as files, and the search box filters both.

**Floating drop target.** On desktop Chrome or Edge, hit **Pop out**. That's a
Document Picture-in-Picture window: a real always-on-top OS window rendering the
drop zone. Drag files onto it from anywhere.

**From the phone.** Once installed to the home screen, Dropbridge appears in the
Android share sheet, so you can push files back without opening it first.

---

## Notes and limits

- **Files are encrypted whole, in memory**, so very large files are a bad idea
  regardless of what storage allows. The Supabase bucket also defaults to a
  **50 MB per-file limit** (Storage → bucket → Settings). Raising either needs
  chunked encryption first.
- **Notes are capped at 8,000 characters**, enforced in the client and again as
  a Postgres check constraint on the ciphertext. It is a relay for links and
  snippets, not a place to keep documents.
- **Metadata still leaks shape:** file sizes, counts, timestamps, and IP
  addresses are visible to the server even though contents and names are not.
- **The JS bundle is ~1.1 MB** (mostly the Firebase SDK). Code-splitting Auth
  away from Firestore and Storage would help if first load ever matters.
- **An Android home-screen widget is not possible from a PWA.** Android has no
  such API — the `widgets` manifest field targets the Windows 11 Widgets Board.
  A real widget means wrapping this in a TWA and writing a native
  `AppWidgetProvider` in Kotlin.

## Stack

Vite · React 19 · TypeScript · Firebase (Hosting, Auth, Firestore) ·
Supabase (Postgres, Realtime) · Web Crypto · vite-plugin-pwa
