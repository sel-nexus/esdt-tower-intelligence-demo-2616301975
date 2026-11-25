/** Apply workshop overlays and masks in a fixed order without rewriting fixture records. */
import { freezeRecord, isRecord, readAttribute, validateRuleConfig } from './fixtures.js';

export const MASK_ATTRIBUTES = Object.freeze({
  'structure.status': 'Structural status',
  'structure.headroomPct': 'Structural headroom (%)',
  'mounting.free': 'Free mounting positions',
  'space.cabinetFreeUnits': 'Free cabinet units',
  'space.requiredCabinetUnits': 'Required cabinet units',
  'power.headroomKw': 'Power headroom (kW)',
  'power.requiredKw': 'Required power (kW)',
  'power.resilience': 'Power resilience',
  'connectivity.fiber': 'Fiber availability',
  'connectivity.requiredFiber': 'Fiber requirement',
  'condition.equipment': 'Equipment condition',
  'condition.corrosion': 'Corrosion',
  'condition.criticalSafety': 'Critical safety',
  'condition.battery': 'Battery condition',
  'condition.generator': 'Generator condition',
  'histories.inspection': 'Inspection history',
  'histories.maintenance': 'Maintenance history',
});

/** Construct fresh controls for the original workshop scenario. */
export function createBaselineControls() {
  return { scenarioId: 'baseline', masks: new Set(), settingsPatch: {} };
}

/** Construct the stable identity of a masked attribute. */
export const maskKey = (siteId, attribute) => `${siteId}:${attribute}`;

/** Return a new site and copy only the affected attribute group. */
function replaceAttribute(site, path, attribute) {
  const [group, field] = path.split('.');
  return field ? { ...site, [group]: { ...site[group], [field]: attribute } } : { ...site, [group]: attribute };
}

/** Publish a read-only Map that retains native iteration and lookup. */
class SnapshotMap extends Map {
  /** Load stable records before disallowing edits. */
  constructor(entries) {
    super();
    for (const [key, value] of entries) super.set(key, value);
    Object.freeze(this);
  }

  /** Refuse replacement or insertion in a committed snapshot. */
  set() { throw new TypeError('Snapshot indexes are read-only.'); }

  /** Refuse deletion in a committed snapshot. */
  delete() { throw new TypeError('Snapshot indexes are read-only.'); }

  /** Refuse clearing a committed snapshot index. */
  clear() { throw new TypeError('Snapshot indexes are read-only.'); }
}

/** Reject unrecognized settings without reading them as rules. */
export function validateSettingsPatch(patch) {
  return isRecord(patch) && Object.entries(patch).every(([key, value]) => key === 'powerToleranceKw' && Number.isFinite(value) && value >= 0);
}

/** Build a coherent snapshot from a validated fixture.
 *
 * Args:
 *   base: Validated, immutable baseline bundle.
 *   controls: Selected scenario, mask keys and staged settings that were applied.
 *   previous: Prior snapshot, if any, for revision tracking and no-op detection.
 * Returns:
 *   A successful snapshot result or an error code without a partial commit.
 */
export function buildSnapshot(base, controls, previous = null) {
  const scenario = base.scenarios.find(item => item.scenarioId === controls?.scenarioId);
  if (!scenario) return { ok: false, code: 'INVALID_SCENARIO' };
  if (!validateSettingsPatch(controls.settingsPatch)) return { ok: false, code: 'INVALID_SETTINGS' };
  const config = { ...base.config, ...controls.settingsPatch };
  if (!validateRuleConfig(config)) return { ok: false, code: 'INVALID_SETTINGS' };
  if (!(controls.masks instanceof Set)) return { ok: false, code: 'INVALID_MASK' };

  const sites = new Map(base.sites.map(site => [site.siteId, site]));
  for (const patch of scenario.patches) {
    sites.set(patch.siteId, replaceAttribute(sites.get(patch.siteId), patch.path, patch.attribute));
  }
  for (const key of controls.masks) {
    if (typeof key !== 'string') return { ok: false, code: 'INVALID_MASK' };
    const [siteId, path, extra] = key.split(':');
    if (extra !== undefined || !Object.hasOwn(MASK_ATTRIBUTES, path)) return { ok: false, code: 'INVALID_MASK' };
    const site = sites.get(siteId);
    if (!site) return { ok: false, code: 'SITE_NOT_FOUND' };
    const attr = readAttribute(site, path);
    if (attr.value !== null) {
      sites.set(siteId, replaceAttribute(site, path, { ...attr, value: null, missingReason: 'simulated-missing' }));
    }
  }

  const configChanged = !previous || config.powerToleranceKw !== previous.config.powerToleranceKw;
  if (!configChanged && previous.scenarioId === scenario.scenarioId && [...sites].every(([id, site]) => {
    const prior = previous.sitesById.get(id);
    return prior === site || JSON.stringify(prior) === JSON.stringify(site);
  })) return { ok: true, code: 'NO_CHANGE', value: previous };

  return { ok: true, value: freezeRecord({
    fixtureVersion: base.fixtureVersion,
    scenarioId: scenario.scenarioId,
    scenarioLabel: scenario.label,
    scenarioNotice: scenario.notice,
    referenceDate: scenario.referenceDate,
    settingsVersion: previous ? previous.settingsVersion + Number(configChanged) : 1,
    snapshotRevision: (previous?.snapshotRevision ?? 0) + 1,
    config: configChanged ? freezeRecord(config) : previous.config,
    sitesById: new SnapshotMap([...sites].map(([id, site]) => [id, freezeRecord(site)])),
    evidenceById: previous?.evidenceById ?? new SnapshotMap(base.evidence.map(item => [item.evidenceId, item])),
    findings: base.findings,
    alerts: base.alerts,
  }) };
}

/** Derive facilitator summary totals over active sites without treating unknown as zero. */
export function summarizeBaseline(snapshot) {
  const sites = [...snapshot.sitesById.values()].filter(site => site.lifecycleStatus === 'active');
  let tenants = 0;
  let revenueCents = 0;
  for (const site of sites) {
    if (site.tenants.value === null) tenants = null;
    else if (tenants !== null) tenants += site.tenants.value.filter(lease => lease.leaseStatus === 'active').length;
    if (site.commercial.revenue.value === null) revenueCents = null;
    else if (revenueCents !== null) revenueCents += site.commercial.revenue.value;
  }
  return { sites: sites.length, tenants, revenueCents };
}
