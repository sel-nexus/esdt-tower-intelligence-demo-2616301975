/** Project and transition scenario-local simulation alerts independently of scoring. */
const statuses = ['Open', 'Acknowledged', 'Closed'];

/** Resolve the effective status of a registered alert in the selected scenario. */
export function alertStatus(snapshot, edits, alert) {
  const scenario = edits?.[snapshot.scenarioId];
  return scenario && Object.hasOwn(scenario, alert.alertId) ? scenario[alert.alertId] : alert.defaultStatus;
}

/** Keep all registered alerts visible even after closure or changes to the finding. */
export function listAlerts(snapshot, edits, siteId) {
  if (!snapshot) return [];
  const findings = new Map(snapshot.findings.map(finding => [finding.findingId, finding]));
  return snapshot.alerts.filter(alert => siteId === undefined || alert.siteId === siteId).map(alert => ({
    ...alert, status: alertStatus(snapshot, edits, alert), fixtureFinding: findings.get(alert.findingId),
  }));
}

/** Validate one alert transition and return scenario-local edits without mutating inputs.
 * @param {object} snapshot Active snapshot defining valid alert identities.
 * @param {object} edits Status overrides grouped by scenario then alert ID.
 * @param {string} alertId Registered stable alert ID.
 * @param {string} to Requested effective status.
 * @returns {object} Transition, no-change result or rejection with the original edits.
 */
export function transitionAlert(snapshot, edits, alertId, to) {
  const alert = snapshot.alerts.find(item => item.alertId === alertId);
  if (!alert) return { ok: false, code: 'ITEM_NOT_FOUND', edits };
  const from = alertStatus(snapshot, edits, alert);
  if (from === to) return { ok: true, code: 'NO_CHANGE', edits };
  if (statuses.indexOf(to) <= statuses.indexOf(from)) return { ok: false, code: 'INVALID_TRANSITION', edits };
  return {
    ok: true, from, to, alert,
    edits: { ...edits, [snapshot.scenarioId]: { ...edits?.[snapshot.scenarioId], [alertId]: to } },
  };
}
