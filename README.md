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
                 Storage

Firestore holds opaque metadata.  Supabase holds ciphertext.
The key never leaves your devices.
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

1. **Authentication → Sign-in method →** enable **Email/Password**
2. **Firestore Database → Create database →** *Production mode*
3. **Project settings → General → Your apps → Add app → Web**, and copy the
   config values.

Firebase Storage is deliberately unused — it requires the Blaze plan, and
Supabase's free tier covers this app's needs without a billing account.

### 1b. Supabase storage

1. Create a project at [supabase.com](https://supabase.com) — no card required.
2. **Storage → New bucket** → name it `files`, leave it **private**.
3. **Authentication → Sign In / Providers → Third-Party Auth** → add **Firebase**
   and enter your Firebase project ID.
4. **SQL Editor** → paste `supabase-policies.sql` → Run.
5. **Project Settings → API** → copy the URL and anon key into `.env`.

The policies pin `aud` to your Firebase project ID for a reason: **Firebase
signs every project's JWTs with the same global key set**, so without that check
a token from any unrelated Firebase project would authorise against your bucket.

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

### 3. Local

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

### 4. Icons

The manifest needs two PNGs that aren't in the repo. Open `tools/make-icons.html`
in a browser, click the button, and save both files into `public/icons/`.

### 5. Deploy

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

**Firestore TTL** handles the metadata: Cloud console → Firestore →
Time-to-live → add a policy on collection group `files`, field `expiresAt`.

**Supabase Storage has no lifecycle rules**, so nothing currently reaps the
objects themselves — a known gap. Options, in order of preference:

- A client-side sweep on app open, deleting anything past `expiresAt` using the
  user's own credentials. No server, works today.
- `pg_cron` plus an Edge Function, if you want it to happen whether or not the
  app is opened.

Until one of those exists, expired files disappear from the list but their
encrypted bytes remain in the bucket, consuming quota.

---

## Using it

**First device.** Sign up (do this on your phone — verification goes to your
inbox), then choose **Start a new vault**.

**Second device.** Sign in with the same email and password — no inbox access
needed, which is the point on a work laptop. Choose **Pair with another device**,
then on the phone tap **Add a device** and scan the QR.

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
- **Metadata still leaks shape:** file sizes, counts, timestamps, and IP
  addresses are visible to the server even though contents and names are not.
- **The JS bundle is ~900 KB** (mostly the Firebase SDK). Code-splitting Auth
  away from Firestore and Storage would help if first load ever matters.
- **An Android home-screen widget is not possible from a PWA.** Android has no
  such API — the `widgets` manifest field targets the Windows 11 Widgets Board.
  A real widget means wrapping this in a TWA and writing a native
  `AppWidgetProvider` in Kotlin.

## Stack

Vite · React 19 · TypeScript · Firebase (Auth, Firestore, Cloud Storage) ·
Web Crypto · vite-plugin-pwa
