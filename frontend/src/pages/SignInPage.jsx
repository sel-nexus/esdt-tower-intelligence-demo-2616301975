/** Present the fixed public workshop entry and recover from blocked sign-out. */
import PropTypes from 'prop-types';
import { useEffect, useId, useRef } from 'react';
import { focus } from '../components/GlobalBar.jsx';
import { DEMO_CREDENTIALS } from '../utils/session.js';

const field = `min-h-11 w-full rounded-md border border-border bg-surface px-3 ${focus}`;
const button = `min-h-11 rounded-md border border-border px-4 text-sm font-medium ${focus}`;
const notices = {
  DEMO_INPUT_INVALID: 'Enter the exact demo username and password shown above.',
  STORAGE_UNAVAILABLE: 'Browser storage is unavailable. Enable storage and try again.',
  STORE_VERSION_INVALID: 'The saved session could not be restored. Sign in again to replace the marker, or clear site data to remove all local workshop data.',
};

/**
 * Render the signed-out form or the pending-clear recovery, never both.
 * Args:
 *   error: Safe session or input error code.
 *   pendingClear: Whether saved marker deletion is unconfirmed.
 *   onSignIn: Submit the entered pair to the workshop gate.
 *   onRetry: Retry deleting the saved marker.
 */
export default function SignInPage({ error, pendingClear, onSignIn, onRetry }) {
  const id = useId();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [pendingClear]);
  const invalid = error === 'DEMO_INPUT_INVALID';

  /**
   * Submit without any form navigation and discard the attempted password.
   * Args:
   *   event: Native form submission wrapped by React.
   */
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    form.elements.password.value = '';
    if (onSignIn(values.get('username'), values.get('password'))) form.reset();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground sm:px-8 sm:py-20">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-medium uppercase tracking-[.14em] text-foreground-muted">ESDT · Synthetic workshop</p>
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-tight">
          {pendingClear ? 'Sign-out needs attention' : 'Sign in to Tower Intelligence'}
        </h1>
        {pendingClear ? (
          <div className="mt-5 space-y-5">
            <p role="alert">The workshop is hidden, but the saved session could not be removed. Reloading may restore it. Enable browser storage and retry. If removal stays blocked, clear site data before reloading; this also deletes retained samples.</p>
            <button type="button" className={`${button} bg-surface hover:bg-surface-raised`} onClick={onRetry}>Retry Sign Out</button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-foreground-muted">This browser-only demo gate is not authorization. Use only these fictitious credentials, not a real account.</p>
            <dl className="mt-5 space-y-1 border-y border-border py-3 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt>Demo username:</dt>
                <dd className="font-mono">{DEMO_CREDENTIALS.username}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt>Demo password:</dt>
                <dd className="font-mono">{DEMO_CREDENTIALS.password}</dd>
              </div>
            </dl>
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <div className="space-y-1">
                <label htmlFor={`${id}-username`} className="block text-sm font-medium">Username</label>
                <input id={`${id}-username`} name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required
                  aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} className={field} />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${id}-password`} className="block text-sm font-medium">Password</label>
                <input id={`${id}-password`} name="password" type="password" autoComplete="off" required
                  aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} className={field} />
              </div>
              {notices[error] && <p id={`${id}-error`} role="alert" className="text-sm">{notices[error]}</p>}
              <button type="submit" className={`${button} border-transparent bg-primary-700 text-white hover:bg-primary-800`}>Sign in</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

SignInPage.propTypes = {
  error: PropTypes.string,
  pendingClear: PropTypes.bool.isRequired,
  onSignIn: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
};
