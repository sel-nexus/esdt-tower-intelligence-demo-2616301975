/** Remember a workshop perspective in this browser, not an identity or permission. */
export const SESSION_KEY = 'esdt.demo.session.v1';

export const PERSONAS = Object.freeze({
  portfolio: { name: 'Portfolio Manager', route: '#/portfolio', start: 'Portfolio overview',
    description: 'Review portfolio KPIs and find sites that need attention.' },
  asset: { name: 'Asset Manager', route: '#/assessments', start: 'Assessment picker',
    description: 'Review tower condition, inspection history and supporting evidence.' },
  commercial: { name: 'Colocation / Commercial Manager', route: '#/actions/growth', start: 'Growth Opportunities',
    description: 'Compare colocation candidates, upgrade needs and indicative payback.' },
  operations: { name: 'Operations Manager', route: '#/actions/critical', start: 'Critical Sites',
    description: 'Triage critical sites, inspections and maintenance follow-ups.' },
  facilitator: { name: 'Demonstration Facilitator', route: '#/portfolio', start: 'Portfolio & scenario controls',
    description: 'Replay scenarios, adjust thresholds and show how decisions change.' },
});

/** Accept only registered persona IDs, not arbitrary browser or form values. */
function isPersona(id) {
  return typeof id === 'string' && Object.hasOwn(PERSONAS, id);
}

/**
 * Restore only a valid workshop marker, without writing storage.
 * Args:
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   Session state or a safe fail-closed recovery code.
 */
export function resumeSession(storage) {
  let raw;
  try {
    raw = (storage ?? window.localStorage).getItem(SESSION_KEY);
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
  if (raw === null) return { ok: true };
  try {
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object' && Object.keys(saved).length === 2) {
      // Keep older entered sessions and their deep links working without a startup write.
      if (saved.v === 1 && saved.signedIn === true) return { ok: true, persona: 'portfolio' };
      if (saved.v === 2 && isPersona(saved.persona)) return { ok: true, persona: saved.persona };
    }
  } catch {
    return { ok: false, code: 'STORE_VERSION_INVALID' };
  }
  return { ok: false, code: 'STORE_VERSION_INVALID' };
}

/**
 * Commit a selected role only after saving the browser marker.
 * Args:
 *   persona: Selected workshop role identifier.
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   The selected role or a recoverable error code.
 */
export function selectPersona(persona, storage) {
  if (!isPersona(persona)) return { ok: false, code: 'UNKNOWN_PERSONA' };
  try {
    (storage ?? window.localStorage).setItem(SESSION_KEY, JSON.stringify({ v: 2, persona }));
    return { ok: true, persona };
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
}

/**
 * Remove only the workshop marker, without touching retained samples.
 * Args:
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   An exited session or a pending-clear result without confirming deletion.
 */
export function exitSession(storage) {
  try {
    (storage ?? window.localStorage).removeItem(SESSION_KEY);
    return { ok: true };
  } catch {
    return { ok: false, code: 'SESSION_CLEAR_FAILED', phase: 'pending-clear' };
  }
}
