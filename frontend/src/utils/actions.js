/** Derive deterministic action queues and validate simulated workflow changes. */
import { freezeRecord } from './fixtures.js';

export const QUEUES = Object.freeze([
  'Critical Sites', 'Inspection Due', 'High Operating Cost', 'Growth Opportunities', 'Upgrade Required',
  'Missing Information', 'Power Upgrades',
]);
export const CATEGORIES = Object.freeze(['Grow', 'Improve', 'Protect']);
export const STATUSES = Object.freeze(['Open', 'In Progress', 'Completed']);
const upgrades = ['power-upgrade', 'cabinet-upgrade'];

/** Compare stable identifiers without locale-dependent collation. */
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
/** Break equal ranks consistently even for two actions at the same site. */
const byId = (a, b) => compare(a.siteId, b.siteId) || compare(a.actionId, b.actionId);
/** Keep undated work behind dated work at the same urgency. */
const byDue = (a, b) => compare(a.dueDate ?? '\uffff', b.dueDate ?? '\uffff');
/** Keep unranked opportunities after every comparable candidate. */
const byOpportunity = (a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity) || byId(a, b);
/** Identify additions and specifically evidenced upgrades as opportunity actions. */
const isOpportunity = action => action.kind === 'add-tenant' || upgrades.includes(action.kind);
/** Keep utilities within the common scoring scale. */
const clamp = value => Math.max(0, Math.min(100, value));

/** Return raw weighted rank, preserving unknown and zero-investment cases. */
function opportunityRank({ readiness, commercial }, config) {
  const { score, confidence } = readiness;
  const { annualUpside, upgradeCost, paybackYears, paybackStatus } = commercial;
  const years = paybackStatus === 'known' ? paybackYears : upgradeCost === 0 && annualUpside > 0 ? 0 : null;
  if (![score, annualUpside, confidence, years].every(Number.isFinite) || years < 0) return null;
  const { opportunityWeights: w, upsideCapCents, paybackCapYears } = config;
  return (w.readiness * score + w.upside * clamp(100 * annualUpside / upsideCapCents)
    + w.payback * clamp(100 * (1 - years / paybackCapYears)) + w.confidence * confidence) / 100;
}

/** Derive action identities solely from current assessed signals; overlay scenario workflow afterward. */
export function rankActions(snapshot, index, workflow = {}) {
  if (!snapshot) return Object.freeze([]);
  const rows = [];
  const { config, scenarioId } = snapshot;
  for (const [siteId, assessment] of index) {
    const { health, readiness, findings } = assessment;
    const critical = health.band === 'Critical';
    const siteRows = new Map();
    /** Register one stable site-and-kind row with its most relevant source finding. */
    function add(kind, { finding = null, severity = finding?.severity ?? 'Medium', nextStep = finding?.nextStep ?? assessment.recommendation } = {}) {
      if (siteRows.has(kind)) return;
      const actionId = `${siteId}:${kind}`;
      siteRows.set(kind, {
        actionId, siteId, kind, critical, findingId: finding?.findingId ?? null, severity,
        dueDate: finding?.dueDate ?? null, nextStep,
        status: workflow.actions?.[scenarioId]?.[actionId] ?? 'Open',
        category: workflow.categories?.[scenarioId]?.[actionId] ?? null,
        priority: null,
      });
    }
    for (const finding of findings) {
      const kind = finding.kind === 'corrosion' ? 'remediation' : finding.kind;
      if (['remediation', 'inspection', 'energy', 'missing-info'].includes(kind)) add(kind, { finding });
    }
    if (critical && !siteRows.has('remediation')) add('remediation', { severity: 'Critical', nextStep: 'Arrange a qualified review of the conditions driving the critical health score.' });
    if (readiness.gaps.some(gap => gap.materiality === 'required')) {
      const attributes = readiness.gaps.filter(gap => gap.materiality === 'required').map(gap => gap.attribute);
      add('missing-info', { severity: 'High', nextStep: `Collect current evidence for ${[...new Set(attributes)].join(', ')}.` });
    }
    if (readiness.answer === 'Yes') add('add-tenant');
    if (readiness.answer === 'Yes after an upgrade') {
      for (const remedy of readiness.remedies) if (upgrades.includes(`${remedy}-upgrade`)) add(`${remedy}-upgrade`);
    }
    for (const row of siteRows.values()) rows.push(isOpportunity(row) ? { ...row, priority: opportunityRank(assessment, config) } : row);
  }
  return freezeRecord(rows.sort((a, b) => config.severityOrder.indexOf(a.severity) - config.severityOrder.indexOf(b.severity)
    || byDue(a, b) || byId(a, b)));
}

/** Project one named queue without reordering the shared operational index. */
export function selectQueue(actions, view) {
  switch (view) {
    case 'Critical Sites': return actions.filter(action => action.critical);
    case 'Inspection Due': return actions.filter(action => action.kind === 'inspection');
    case 'High Operating Cost': return actions.filter(action => action.kind === 'energy');
    case 'Missing Information': return actions.filter(action => action.kind === 'missing-info');
    case 'Power Upgrades': return actions.filter(action => action.kind === 'power-upgrade');
    case 'Growth Opportunities': return actions.filter(isOpportunity).sort(byOpportunity);
    case 'Upgrade Required': return actions.filter(action => upgrades.includes(action.kind)).sort(byOpportunity);
    default: return [];
  }
}

/** Select the same operational recommendation displayed in the queues. */
export function nextOperationalAction(actions, siteId) {
  return actions.find(action => action.siteId === siteId && !isOpportunity(action));
}

/** Require sequential progress; repeated states are successful no-ops. */
export function transitionAction(from, to) {
  const current = STATUSES.indexOf(from);
  if (current === -1 || !STATUSES.includes(to)) return { ok: false, code: 'INVALID_TRANSITION' };
  if (from === to) return { ok: true, code: 'NO_CHANGE' };
  if (STATUSES.indexOf(to) !== current + 1) return { ok: false, code: 'INVALID_TRANSITION' };
  return { ok: true, from, to };
}
