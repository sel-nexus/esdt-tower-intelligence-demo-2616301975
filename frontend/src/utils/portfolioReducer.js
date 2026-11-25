/** Commit portfolio control intents as atomic, tab-local state transitions. */
import { isRecord, readAttribute } from './fixtures.js';
import { buildSnapshot, createBaselineControls, MASK_ATTRIBUTES, maskKey, validateSettingsPatch } from './scenario.js';

/** Create empty discovery intent independent of any browser session state. */
const blankDiscovery = () => ({ query: '', filters: {}, signal: null, selectedSiteId: null });
/** Create empty scenario-keyed workflow stores. */
const blankWorkflow = () => ({ alerts: {}, actions: {}, categories: {} });

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
    lastCommandId: 0,
    result: null,
  };
}

/** Report a rejected command without disturbing committed state. */
const reject = (state, code) => ({ ...state, result: { ok: false, code } });

/** Apply one control command or retain the prior decision snapshot.
 *
 * Args:
 *   state: Current state including the committed snapshot and fixture.
 *   command: A switch, mask, settings or reset intent with a tab-local command ID.
 * Returns:
 *   State with the command result, or the identical state for a stale ID.
 */
export function reduce(state, command) {
  if (!isRecord(command) || !Number.isSafeInteger(command.commandId) || command.commandId <= state.lastCommandId) return state;
  const committed = { ...state, lastCommandId: command.commandId };
  if (!state.snapshot) return reject(committed, 'INVALID_FIXTURE');

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
  return {
    ...committed,
    snapshot: next.value,
    controls,
    discovery: reset ? blankDiscovery() : discovery,
    workflow: reset ? blankWorkflow() : state.workflow,
    workflowRevision: state.workflowRevision + Number(hasWorkflow),
    result,
  };
}
