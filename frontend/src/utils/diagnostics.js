/** Retain bounded, allowlisted local workshop diagnostics without collecting user text. */
const slots = Object.freeze({ SCENARIO_CHANGED: 'scenario', PORTFOLIO_RESET: 'scenario', ALERT_STATUS_CHANGED: 'alert', ASSESSMENT_EXPORTED: 'export' });
const eventTypes = new Set([...Object.keys(slots), 'EVIDENCE_MASK_CHANGED', 'SETTINGS_CHANGED', 'ASSESSMENT_EXECUTED',
  'ACTION_STATUS_CHANGED', 'ACTION_CATEGORY_CHANGED', 'FOLLOW_UP_RECOMMENDED']);
const values = new Set(['Open', 'Acknowledged', 'Closed', 'In Progress', 'Completed', 'Grow', 'Improve', 'Protect']);
const safeErrors = new Set(['INVALID_FIXTURE', 'INVALID_SCENARIO', 'INVALID_MASK', 'INVALID_SETTINGS', 'INVALID_CONTROL',
  'INVALID_TRANSITION', 'INVALID_CATEGORY', 'SITE_NOT_FOUND', 'ITEM_NOT_FOUND', 'STALE_VIEW', 'EXPORT_FAILED',
  'INVALID_QUERY', 'INVALID_FILTER', 'SIGNAL_UNAVAILABLE']);
const slug = /^[a-z][a-z0-9-]{0,63}$/;
const siteKey = /^[A-Z0-9][A-Z0-9-]{0,63}$/;
const itemKey = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

/** Start an empty log on tab load, not on a scenario reset. */
export function createAudit() {
  return Object.freeze({ events: Object.freeze([]), latest: Object.freeze({ scenario: null, alert: null, export: null }), lastErrorCode: null });
}

/** Preserve the most recent recognized error independently from event success. */
export function noteError(log, code) {
  return safeErrors.has(code) ? Object.freeze({ ...log, lastErrorCode: code }) : log;
}

/** Append only a bounded projection of a committed, internal synthetic event. */
export function appendEvent(log, input) {
  if (!eventTypes.has(input.type) || typeof input.scenarioId !== 'string' || !slug.test(input.scenarioId)
    || typeof input.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.timestamp)
    || !Number.isFinite(Date.parse(input.timestamp)) || new Date(input.timestamp).toISOString() !== input.timestamp) return log;
  const event = Object.freeze({
    sequence: (log.events.at(-1)?.sequence ?? 0) + 1,
    type: input.type, timestamp: input.timestamp, scenarioId: input.scenarioId,
    ...(typeof input.siteId === 'string' && siteKey.test(input.siteId) ? { siteId: input.siteId } : {}),
    ...(typeof input.itemId === 'string' && itemKey.test(input.itemId) ? { itemId: input.itemId } : {}),
    ...(values.has(input.from) ? { from: input.from } : {}),
    ...(values.has(input.to) ? { to: input.to } : {}),
    ...(Number.isSafeInteger(input.snapshotRevision) && input.snapshotRevision > 0 ? { snapshotRevision: input.snapshotRevision } : {}),
    ...(typeof input.previousScenarioId === 'string' && slug.test(input.previousScenarioId) ? { previousScenarioId: input.previousScenarioId } : {}),
    ...(input.type === 'ASSESSMENT_EXPORTED' && ['preview', 'download'].includes(input.mode) ? { mode: input.mode } : {}),
  });
  const slot = slots[event.type];
  return Object.freeze({ ...log, events: Object.freeze([...log.events.slice(-99), event]),
    latest: slot ? Object.freeze({ ...log.latest, [slot]: event }) : log.latest });
}

/** Expose version context and synthetic summaries, never fixture inputs or view text. */
export function inspectDiagnostics(snapshot, audit) {
  return Object.freeze({ build: 'workshop-r1', scenarioId: snapshot?.scenarioId ?? null,
    fixtureVersion: snapshot?.fixtureVersion ?? null, settingsVersion: snapshot?.settingsVersion ?? null, ...audit });
}
