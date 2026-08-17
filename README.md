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
    └──────────► Firebase (GCP) ◄───────────┘
                 Auth · Firestore · Cloud Storage

Firestore holds opaque metadata.  Storage holds ciphertext.
The key never leaves your devices.
```

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
3. **Storage → Get started** — requires the **Blaze** plan. Any project created
   after 30 Oct 2024 must have a linked billing account to provision a bucket at
   all; since 3 Feb 2026 that applies to maintaining one too. Free-tier
   allowances still apply, so real-world cost here is ~$0.
4. **Project settings → General → Your apps → Add app → Web**, and copy the
   config values.

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

### 6. Auto-delete (do this, or files live forever)

Two independent reapers, because Firestore and Storage expire separately:

- **Firestore TTL:** Cloud console → Firestore → Time-to-live → add a policy on
  collection group `files`, field `expiresAt`, and a **second** policy on
  collection group `notes`, same field. TTL policies are per collection group,
  so the one on `files` does nothing for notes — miss it and notes never expire.
- **Storage lifecycle:** Cloud console → Cloud Storage → your bucket →
  Lifecycle → add rule: *delete object, age 8 days*.

Keep the storage rule slightly **longer** than `VITE_RETENTION_DAYS`, so blobs
never vanish out from under metadata that still lists them.

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

**Notes.** The panel above the file list is a shared clipboard. Paste a link,
press Enter, and it is on your other device — encrypted the same way files are,
so the server holds ciphertext and two timestamps. **Copy** puts it back on the
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

- **Files are encrypted whole, in memory.** The 200 MB cap in `storage.rules` is
  a real client constraint, not just a billing guard. Raising it needs chunked
  encryption first.
- **Notes are capped at 8,000 characters**, enforced in the client and again in
  `firestore.rules` against the ciphertext length. It is a relay for links and
  snippets, not a place to keep documents.
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
