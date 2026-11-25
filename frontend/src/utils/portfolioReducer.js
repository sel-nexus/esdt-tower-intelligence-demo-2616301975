/** Commit portfolio control intents as atomic, tab-local state transitions. */
import { transitionAlert } from './alerts.js';
import { CATEGORIES, rankActions, transitionAction } from './actions.js';
import { appendEvent, createAudit, noteError } from './diagnostics.js';
import { computeEconomics } from './economics.js';
import { captureExport, renderText, sameAssessmentRef } from './export.js';
import { freezeRecord, isRecord, readAttribute } from './fixtures.js';
import { deriveAssessments } from './health.js';
import { assessReadiness } from './readiness.js';
import { buildSnapshot, createBaselineControls, MASK_ATTRIBUTES, maskKey, validateSettingsPatch } from './scenario.js';

/** Create empty discovery intent independent of any browser session state. */
const blankDiscovery = () => ({ query: '', filters: {}, signal: null, selectedSiteId: null });
/** Create empty scenario-keyed workflow stores. */
const blankWorkflow = () => ({ alerts: {}, actions: {}, categories: {} });

const controlEvents = { switch: 'SCENARIO_CHANGED', mask: 'EVIDENCE_MASK_CHANGED', settings: 'SETTINGS_CHANGED', reset: 'PORTFOLIO_RESET' };

/** Refuse mutations to the published assessment index. */
function rejectIndexEdit() {
  throw new TypeError('Assessment indexes are read-only.');
}

/** Build one assessment index per decision revision, not per workflow intent. */
function buildAssessmentIndex(snapshot) {
  const index = deriveAssessments(snapshot);
  for (const [siteId, assessment] of index) {
    const site = snapshot.sitesById.get(siteId);
    const readiness = assessReadiness(snapshot, site, assessment.findings);
    const commercial = computeEconomics(site, snapshot);
    index.set(siteId, freezeRecord({
      ...assessment, readiness, commercial,
      evidence: [...assessment.evidence, ...[...readiness.evidence, ...commercial.evidence].filter(
        row => !assessment.evidence.some(healthRow => healthRow.attribute === row.attribute),
      )],
      gaps: [...readiness.gaps, ...commercial.gaps.filter(
        gap => !readiness.gaps.some(row => row.attribute === gap.attribute),
      )],
      constraints: readiness.constraints, recommendation: readiness.recommendation, requiredValidation: readiness.requiredValidation,
    }));
  }
  return Object.freeze(Object.defineProperties(index, {
    set: { value: rejectIndexEdit }, delete: { value: rejectIndexEdit }, clear: { value: rejectIndexEdit },
  }));
}

/** Create state from fixture validation, keeping invalid data out of consumers. */
export function createPortfolioState(result) {
  const controls = createBaselineControls();
  const snapshot = result.ok ? buildSnapshot(result.value, controls) : result;
  return {
    base: snapshot.ok ? result.value : null,
    snapshot: snapshot.ok ? snapshot.value : null,
    fixtureError: snapshot.ok ? null : snapshot.detail ?? snapshot.code,
    controls,
    discovery: blankDiscovery(),
    workflow: blankWorkflow(),
    workflowRevision: 0,
    assessments: buildAssessmentIndex(snapshot.ok ? snapshot.value : null),
    audit: snapshot.ok ? createAudit() : noteError(createAudit(), 'INVALID_FIXTURE'),
    preview: null,
    lastCommandId: 0,
    lastCommandKind: null,
    result: null,
  };
}

/** Report a rejected command without disturbing committed state. */
const reject = (state, code) => ({ ...state, audit: noteError(state.audit, code), result: { ok: false, code } });

/** Commit only safe projections of successful operations with controller-supplied time. */
function auditEvent(state, command, type, fields = {}) {
  return { ...state, audit: appendEvent(state.audit, {
    type, timestamp: command.timestamp, scenarioId: state.snapshot.scenarioId,
    snapshotRevision: state.snapshot.snapshotRevision, ...fields,
  }) };
}

/** Apply one independent action intent using active IDs and committed workflow. */
function applyAction(state, command) {
  const { snapshot, workflow, assessments } = state;
  if (command.snapshotRevision !== snapshot.snapshotRevision) return reject(state, 'STALE_VIEW');
  const action = rankActions(snapshot, assessments, workflow).find(item => item.actionId === command.actionId);
  if (!action) return reject(state, 'ITEM_NOT_FOUND');
  const fields = { siteId: action.siteId, itemId: action.actionId };
  if (command.kind === 'recordFollowUp') {
    return auditEvent({ ...state, result: { ok: true } }, command, 'FOLLOW_UP_RECOMMENDED', fields);
  }
  const statusEdit = command.kind === 'setAction';
  const from = statusEdit ? action.status : action.category;
  const to = statusEdit ? command.to : command.category;
  if (statusEdit) {
    const transition = transitionAction(from, to);
    if (!transition.ok) return reject(state, transition.code);
  } else if (!CATEGORIES.includes(to)) return reject(state, 'INVALID_CATEGORY');
  if (from === to) return { ...state, result: { ok: true, code: 'NO_CHANGE' } };
  const key = statusEdit ? 'actions' : 'categories';
  const scenario = snapshot.scenarioId;
  const edited = { ...workflow, [key]: { ...workflow[key], [scenario]: { ...workflow[key][scenario], [action.actionId]: to } } };
  const updated = { ...state, workflow: edited, workflowRevision: state.workflowRevision + 1,
    result: statusEdit ? { ok: true, from, to } : { ok: true, category: to } };
  const event = statusEdit ? 'ACTION_STATUS_CHANGED' : 'ACTION_CATEGORY_CHANGED';
  return auditEvent(updated, command, event, { ...fields, from, to });
}

/** Apply one control command or retain the prior decision snapshot.
 *
 * Args:
 *   state: Current state including the committed snapshot and fixture.
 *   command: A control or alert intent with a tab-local command ID.
 * Returns:
 *   State with the command result, or the identical state for a stale ID.
 */
export function reduce(state, command) {
  if (!isRecord(command) || !Number.isSafeInteger(command.commandId) || command.commandId <= state.lastCommandId) return state;
  const committed = { ...state, lastCommandId: command.commandId, lastCommandKind: command.kind };
  if (!state.snapshot) return reject(committed, 'INVALID_FIXTURE');

  if (['setAction', 'categorize', 'recordFollowUp'].includes(command.kind)) return applyAction(committed, command);

  if (command.kind === 'assessmentDelivered') {
    const assessment = state.assessments.get(command.ref?.siteId);
    if (!assessment) return reject(committed, 'SITE_NOT_FOUND');
    if (!sameAssessmentRef(command.ref, assessment.ref)) return reject(committed, 'STALE_VIEW');
    return auditEvent({ ...committed, result: { ok: true } }, command, 'ASSESSMENT_EXECUTED', { siteId: assessment.ref.siteId });
  }

  if (command.kind === 'exportAssessment') {
    const captured = captureExport(command.ref, state.assessments);
    if (!captured.ok) return reject(committed, captured.code);
    const preview = Object.freeze({ id: command.commandId, record: captured.record, text: renderText(captured.record) });
    return auditEvent({ ...committed, preview, result: { ok: true } }, command, 'ASSESSMENT_EXPORTED',
      { siteId: captured.record.towerId, mode: 'preview' });
  }

  if (command.kind === 'downloadExport') {
    if (!state.preview || state.preview.id !== command.previewId) return reject(committed, 'STALE_VIEW');
    if (command.initiated !== true) return reject(committed, 'EXPORT_FAILED');
    const { siteId, scenarioId, snapshotRevision } = state.preview.record.ref;
    return auditEvent({ ...committed, result: { ok: true } }, command, 'ASSESSMENT_EXPORTED',
      { siteId, scenarioId, snapshotRevision, mode: 'download' });
  }

  if (command.kind === 'setAlert') {
    if (command.snapshotRevision !== undefined && command.snapshotRevision !== state.snapshot.snapshotRevision) return reject(committed, 'STALE_VIEW');
    const next = transitionAlert(state.snapshot, state.workflow.alerts, command.alertId, command.to);
    if (!next.ok) return reject(committed, next.code);
    if (next.code) return { ...committed, result: { ok: true, code: next.code } };
    return auditEvent({
      ...committed,
      workflow: { ...state.workflow, alerts: next.edits },
      workflowRevision: state.workflowRevision + 1,
      result: { ok: true, from: next.from, to: next.to },
    }, command, 'ALERT_STATUS_CHANGED', { siteId: next.alert.siteId, itemId: next.alert.alertId, from: next.from, to: next.to });
  }

  let controls = state.controls;
  switch (command.kind) {
    case 'switch':
      controls = { ...controls, scenarioId: command.scenarioId };
      break;
    case 'mask': {
      const site = state.snapshot.sitesById.get(command.siteId);
      if (!site) return reject(committed, 'SITE_NOT_FOUND');
      if (!Object.hasOwn(MASK_ATTRIBUTES, command.attribute) || typeof command.enabled !== 'boolean') return reject(committed, 'INVALID_MASK');
      const key = maskKey(command.siteId, command.attribute);
      const masks = new Set(controls.masks);
      if (!command.enabled) masks.delete(key);
      else if (readAttribute(site, command.attribute).value !== null) masks.add(key);
      controls = { ...controls, masks };
      break;
    }
    case 'settings': {
      if (command.settingsVersion !== undefined && command.settingsVersion !== state.snapshot.settingsVersion) return reject(committed, 'STALE_VIEW');
      if (!validateSettingsPatch(command.patch)) return reject(committed, 'INVALID_SETTINGS');
      const settingsPatch = { ...controls.settingsPatch, ...command.patch };
      if (settingsPatch.powerToleranceKw === state.base.config.powerToleranceKw) delete settingsPatch.powerToleranceKw;
      controls = { ...controls, settingsPatch };
      break;
    }
    case 'reset':
      controls = createBaselineControls();
      break;
    default:
      return reject(committed, 'INVALID_CONTROL');
  }

  const next = buildSnapshot(state.base, controls, state.snapshot);
  if (!next.ok) return reject(committed, next.code);
  const reset = command.kind === 'reset';
  const hasWorkflow = reset && Object.values(state.workflow).some(items => Object.keys(items).length > 0);
  const discovery = state.discovery;
  const dirtyDiscovery = reset && (discovery.query || discovery.signal || discovery.selectedSiteId || Object.keys(discovery.filters).length);
  const result = { ok: true, snapshotRevision: next.value.snapshotRevision, settingsVersion: next.value.settingsVersion };
  if (next.code === 'NO_CHANGE' && !dirtyDiscovery && !hasWorkflow && (!reset || controls.masks.size === state.controls.masks.size)) {
    result.code = 'NO_CHANGE';
  }
  const updated = {
    ...committed,
    snapshot: next.value,
    assessments: next.value === state.snapshot ? state.assessments : buildAssessmentIndex(next.value),
    controls,
    discovery: reset ? blankDiscovery() : discovery,
    workflow: reset ? blankWorkflow() : state.workflow,
    workflowRevision: state.workflowRevision + Number(hasWorkflow),
    result,
  };
  if (result.code === 'NO_CHANGE') return updated;
  return auditEvent(updated, command, controlEvents[command.kind], {
    ...(command.kind === 'switch' || reset ? { previousScenarioId: state.snapshot.scenarioId } : {}),
    ...(command.kind === 'mask' ? { siteId: command.siteId } : {}),
  });
}
