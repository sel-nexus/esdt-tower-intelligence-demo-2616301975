/** Manage the browser-only workshop gate; the public marker grants no authorization. */
export const CREDENTIALS_KEY = 'esdt.demo.credentials.v1';
export const SESSION_KEY = 'esdt.demo.session.v1';
export const DEMO_CREDENTIALS = Object.freeze({ v: 1, username: 'tower-demo', password: 'synthetic-only' });

/**
 * Check an exact stored object against a known envelope.
 * Args:
 *   raw: Serialized browser value, or null for an absent key.
 *   expected: Known fields and their required values.
 * Returns:
 *   Whether the stored value has exactly the required shape and values.
 */
function matches(raw, expected) {
  try {
    const value = JSON.parse(raw);
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === Object.keys(expected).length
      && Object.entries(expected).every(([key, entry]) => value[key] === entry));
  } catch {
    return false;
  }
}

const session = Object.freeze({ v: 1, signedIn: true });

/**
 * Restore only a valid workshop marker, without writing storage.
 * Args:
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   Session state or a safe fail-closed recovery code.
 */
export function resumeSession(storage) {
  try {
    const raw = (storage ?? window.localStorage).getItem(SESSION_KEY);
    if (raw === null) return { ok: true, signedIn: false };
    if (matches(raw, session)) return { ok: true, signedIn: true };
    return { ok: false, signedIn: false, code: 'STORE_VERSION_INVALID' };
  } catch {
    return { ok: false, signedIn: false, code: 'STORAGE_UNAVAILABLE' };
  }
}

/**
 * Start the workshop only after persisting the marker for the exact public pair.
 * Args:
 *   username: Attempted fictitious username, compared without normalization.
 *   password: Attempted fictitious password, compared without normalization.
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   Session state or a safe error code; attempted values are never persisted.
 */
export function signIn(username, password, storage) {
  if (username !== DEMO_CREDENTIALS.username || password !== DEMO_CREDENTIALS.password) {
    return { ok: false, code: 'DEMO_INPUT_INVALID' };
  }
  try {
    const store = storage ?? window.localStorage;
    if (!matches(store.getItem(CREDENTIALS_KEY), DEMO_CREDENTIALS)) {
      store.setItem(CREDENTIALS_KEY, JSON.stringify(DEMO_CREDENTIALS));
    }
    store.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, signedIn: true };
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
}

/**
 * Remove only the workshop marker, without touching retained samples or credentials.
 * Args:
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   Signed-out state on success, or a pending-clear result without confirming deletion.
 */
export function signOut(storage) {
  try {
    (storage ?? window.localStorage).removeItem(SESSION_KEY);
    return { ok: true, signedIn: false };
  } catch {
    return { ok: false, code: 'SESSION_CLEAR_FAILED', phase: 'pending-clear' };
  }
}
