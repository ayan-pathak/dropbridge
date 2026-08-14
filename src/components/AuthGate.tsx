import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { auth } from '../lib/firebase';
import Scatter from './Scatter';

export default function AuthGate() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
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
      setError(err instanceof Error ? err.message.replace(/^Firebase:\s*/, '') : String(err));
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

      <form onSubmit={submit} className="stack" style={{ width: 'min(22rem, 100%)', marginTop: '1rem' }}>
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
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <button
        className="btn btn-quiet btn-sm"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
      >
        {mode === 'signin' ? 'No account yet?' : 'Already have an account?'}
      </button>

      {mode === 'signup' && (
        <p className="micro" style={{ maxWidth: '24rem' }}>
          Sign up on your phone — verification goes to your inbox. On a locked-down
          laptop you only ever need the password, never the email.
        </p>
      )}
      </div>
    </>
  );
}
