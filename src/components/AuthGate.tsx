import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';

import { auth } from '../lib/firebase';
import Scatter from './Scatter';

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5.1-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10.1l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.6c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4 29.9 2 24 2 15.4 2 8.1 6.7 4.5 13.9l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}

export default function AuthGate() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function report(err: unknown) {
    const code = (err as { code?: string }).code ?? '';
    // Closing the popup is a decision, not a failure. Saying nothing is correct.
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    setError(
      err instanceof Error ? err.message.replace(/^Firebase:\s*/, '') : String(err),
    );
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      // Locked-down browsers and embedded webviews block popups outright;
      // redirect is the flow that still works there.
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      report(err);
    } finally {
      setBusy(false);
    }
  }

  async function withPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Scatter />
      <div className="center-stage">
        <span className="pill">Encrypted before it leaves the device</span>

        <h1 className="display">
          Your desk
          <br />
          on your phone
        </h1>

        <p className="sub" style={{ maxWidth: '28rem' }}>
          Drop a file on one screen. Pick it up on the other. Nothing readable ever
          touches the server.
        </p>

        <div className="stack" style={{ width: 'min(22rem, 100%)', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={() => void withGoogle()} disabled={busy}>
            <GoogleMark />
            Continue with Google
          </button>

          <div className="or-rule">
            <span>or</span>
          </div>

          <form onSubmit={withPassword} className="stack">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
            />
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
            <button className="btn btn-ghost" type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in with password'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </div>

        <button
          className="btn btn-quiet btn-sm"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
        >
          {mode === 'signin' ? 'No account yet?' : 'Already have an account?'}
        </button>

        <p className="micro" style={{ maxWidth: '26rem' }}>
          Keep a password on the account even if you use Google. Work laptops often
          block signing a personal Google account into the browser, and the password
          is the way in when they do.
        </p>
      </div>
    </>
  );
}
