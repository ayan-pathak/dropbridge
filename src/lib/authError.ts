// Firebase reports auth failures as "Firebase: Error (auth/some-code)." --
// accurate, and useless to the person staring at it. These are the codes a
// Dropbridge sign-in can actually hit, each with the move that unsticks it.
const MESSAGES: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'This email already has a Dropbridge account. Sign in with your password below.',
  'auth/unauthorized-domain':
    'Sign-in is not allowed from this domain. Add it under Authentication → Settings → Authorized domains in the Firebase console.',
  'auth/operation-not-allowed':
    'That sign-in method is switched off for this Firebase project. Turn it on under Authentication → Sign-in method.',
  'auth/web-storage-unsupported':
    'This browser is blocking the storage sign-in needs. Allow cookies for this site, or use your password.',
  'auth/network-request-failed':
    'Could not reach Firebase. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute, then try again.',
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Pick a password of at least 8 characters.',
};

function codeOf(err: unknown): string {
  return (err as { code?: string }).code ?? '';
}

/** Closing the popup, or opening a second one, is a decision -- not a failure. */
export function isDismissal(err: unknown): boolean {
  const code = codeOf(err);
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/**
 * True when the popup never opened at all. Locked-down browsers and embedded
 * webviews block popups outright; redirect is the flow that still works there.
 */
export function needsRedirect(err: unknown): boolean {
  const code = codeOf(err);
  return (
    code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'
  );
}

export function describeAuthError(err: unknown): string {
  return (
    MESSAGES[codeOf(err)] ??
    (err instanceof Error ? err.message.replace(/^Firebase:\s*/, '') : String(err))
  );
}
