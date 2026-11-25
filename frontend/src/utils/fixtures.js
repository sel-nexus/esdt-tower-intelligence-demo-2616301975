/** Validate and load versioned synthetic fixtures before any decision is derived. */
import baseline from '../fixtures/baseline.v1.json';
import rules from '../fixtures/rules.v1.json';

const severity = ['Critical', 'High', 'Medium', 'Low'];
const conditions = ['good', 'fair', 'poor'];
const states = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');

/** Identify plain record inputs rather than arrays or scalar values. */
export const isRecord = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** Identify nonblank fixture labels. */
const text = value => typeof value === 'string' && value.trim().length > 0;
/** Identify nonnegative whole values that retain precision. */
const uint = value => Number.isSafeInteger(value) && value >= 0;
/** Identify a nonnegative finite capacity. */
const nonnegative = value => Number.isFinite(value) && value >= 0;
/** Identify a finite positive bound. */
const positive = value => Number.isFinite(value) && value > 0;
/** Validate a percentage or points value. */
const points = value => uint(value) && value <= 100;
/** Match booleans without coercion. */
const boolean = value => typeof value === 'boolean';
/** Read one UTC calendar day and reject normalization of impossible dates. */
export function isCalendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Compare record shape against a closed set of keys. */
function hasKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Create a validator for a closed vocabulary. */
const oneOf = choices => value => choices.includes(value);
/** Create a coordinate validator that accepts inclusive bounds. */
const coordinate = limit => value => Number.isFinite(value) && Math.abs(value) <= limit;

/** Check record identities for uniqueness before joining them. */
function unique(records, key) {
  return records.every(isRecord) && new Set(records.map(record => record[key])).size === records.length;
}

/** Validate history records including the nested source reference. */
function history(value, evidence) {
  return Array.isArray(value) && value.every(item => hasKeys(item, ['date', 'summary', 'condition', 'evidenceId'])
    && isCalendarDay(item.date) && text(item.summary) && conditions.includes(item.condition) && evidence.has(item.evidenceId));
}

/** Validate future fit and estimate references independently. */
function upgrades(value, evidence) {
  return Array.isArray(value) && unique(value, 'kind') && value.every(item => hasKeys(item, ['kind', 'afterCapacity', 'evidenceId', 'futureFitEvidenceId', 'feasibility'])
    && ['power', 'cabinet'].includes(item.kind) && nonnegative(item.afterCapacity)
    && evidence.has(item.evidenceId) && evidence.has(item.futureFitEvidenceId)
    && ['confirmed', 'infeasible', 'unverified'].includes(item.feasibility));
}

/** Validate the nested synthetic lease list. */
function tenants(value) {
  return Array.isArray(value) && unique(value, 'label') && value.every(item => hasKeys(item, ['label', 'technology', 'leaseStatus'])
    && text(item.label) && text(item.technology) && ['active', 'inactive', 'pending'].includes(item.leaseStatus));
}

const paths = {
  latitude: coordinate(90), longitude: coordinate(180), heightFt: positive, commissionedYear: uint, tenants,
  'mounting.occupied': uint, 'mounting.free': uint,
  'structure.status': oneOf(['pass', 'warning', 'failed']), 'structure.headroomPct': Number.isFinite,
  'space.groundFreeSqFt': nonnegative, 'space.cabinetFreeUnits': uint, 'space.requiredCabinetUnits': uint,
  'power.loadKw': nonnegative, 'power.headroomKw': Number.isFinite, 'power.requiredKw': nonnegative,
  'power.resilience': oneOf(conditions), 'connectivity.fiber': boolean, 'connectivity.requiredFiber': boolean,
  'condition.equipment': oneOf(conditions), 'condition.corrosion': oneOf(['none', 'minor', 'severe']),
  'condition.criticalSafety': boolean, 'condition.battery': oneOf(conditions), 'condition.generator': oneOf(conditions),
  'histories.inspection': history, 'histories.maintenance': history,
  'commercial.revenue': uint, 'commercial.operatingCost': uint, 'commercial.energyCost': uint,
  'commercial.upgradeCost': uint, 'commercial.annualUpside': Number.isSafeInteger, upgrades, permits: text,
};

/** Read an allowlisted site attribute, including its provenance envelope. */
export function readAttribute(site, path) {
  if (!Object.hasOwn(paths, path)) return undefined;
  const [group, field] = path.split('.');
  return field ? site?.[group]?.[field] : site?.[group];
}

/** Validate the value and source together, including explicit missing reasons. */
function validAttribute(attr, check, evidence) {
  return hasKeys(attr, ['value', 'evidenceId', 'missingReason']) && evidence.has(attr.evidenceId)
    && (attr.value === null
      ? ['not-provided', 'simulated-missing', 'invalid'].includes(attr.missingReason)
      : attr.missingReason === null && check(attr.value, evidence));
}

/** Check exact weight axes and require the intended total. */
function weights(record, keys) {
  return hasKeys(record, keys) && keys.every(key => points(record[key])) && keys.reduce((sum, key) => sum + record[key], 0) === 100;
}

/** Check descending score thresholds with inclusive outer bounds. */
function bands(record, keys) {
  return hasKeys(record, keys) && keys.every((key, index) => points(record[key]) && (!index || record[key] < record[keys[index - 1]]));
}

/** Validate versioned rule settings, mappings, weights and bounds. */
export function validateRuleConfig(config) {
  return hasKeys(config, Object.keys(rules)) && config.ruleConfigVersion === 1 && isCalendarDay(config.baselineReferenceDate)
    && ['inspectionValidityDays', 'inspectionDueWindowDays', 'staleDays'].every(key => uint(config[key]) && config[key] > 0)
    && ['minConfidence', 'expiredHealthPenalty', 'expiredConfidencePenalty'].every(key => points(config[key]))
    && ['highOperatingCostCents', 'highEnergyCostCents'].every(key => uint(config[key]))
    && uint(config.upsideCapCents) && config.upsideCapCents > 0 && positive(config.paybackCapYears) && nonnegative(config.powerToleranceKw)
    && weights(config.healthWeights, ['structure', 'equipment', 'power', 'maintenance', 'dataQuality'])
    && weights(config.readinessWeights, ['structure', 'mounting', 'space', 'power', 'connectivity'])
    && weights(config.opportunityWeights, ['readiness', 'upside', 'payback', 'confidence'])
    && bands(config.healthBands, ['good', 'attention']) && bands(config.readinessBands, ['yes', 'upgrade', 'information'])
    && bands(config.conditionScores, conditions)
    && Array.isArray(config.severityOrder) && config.severityOrder.length === severity.length && severity.every(label => config.severityOrder.includes(label))
    && hasKeys(config.governance, ['status', 'owner', 'rationale', 'verification', 'units', 'example']) && config.governance.status === 'provisional'
    && ['owner', 'rationale', 'verification', 'units'].every(key => text(config.governance[key]))
    && hasKeys(config.governance.example, ['status', 'comparisonKw', 'shortfallKw', 'defaultKw']) && config.governance.example.status === 'provisional'
    && ['comparisonKw', 'shortfallKw', 'defaultKw'].every(key => nonnegative(config.governance.example[key]))
    && config.governance.example.comparisonKw < config.governance.example.shortfallKw
    && config.governance.example.shortfallKw < config.governance.example.defaultKw;
}

/** Freeze a JSON tree while preserving structural sharing for already immutable records. */
export function freezeRecord(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

/** Return safe failure details without publishing a partial bundle. */
const invalid = detail => ({ ok: false, code: 'INVALID_FIXTURE', detail });

const identityFields = ['siteId', 'name', 'portfolio', 'market', 'city', 'state', 'type', 'lifecycleStatus'];
const groups = {};
for (const path of Object.keys(paths)) {
  const [group, field] = path.split('.');
  (groups[group] ??= []);
  if (field) groups[group].push(field);
}

/** Validate schema, nested values, uniqueness and all joined references.
 *
 * Args:
 *   raw: Bundle with the rules file composed into its config field.
 * Returns:
 *   A read-only canonical bundle on success, or a safe validation error.
 */
export function validateBundle(raw) {
  const collections = { sites: 'siteId', evidence: 'evidenceId', scenarios: 'scenarioId', findings: 'findingId', alerts: 'alertId' };
  if (!hasKeys(raw, ['schemaVersion', 'fixtureVersion', 'referenceDate', 'config', ...Object.keys(collections)])
    || raw.schemaVersion !== 1 || !text(raw.fixtureVersion) || !validateRuleConfig(raw.config)
    || raw.referenceDate !== raw.config.baselineReferenceDate) return invalid('Unsupported fixture version, reference date, or rule settings.');

  for (const [collection, id] of Object.entries(collections)) {
    if (!Array.isArray(raw[collection]) || !unique(raw[collection], id)) return invalid(`Missing or duplicate records in ${collection}.`);
  }

  const evidence = new Set();
  for (const item of raw.evidence) {
    if (!hasKeys(item, ['evidenceId', 'domain', 'sourceSystem', 'asOf', 'updatedAt', 'confidence', 'completeness', 'synthetic'])
      || !text(item.evidenceId) || !['ESDT-Aligned', 'Tower Owner'].includes(item.domain) || !text(item.sourceSystem)
      || !(item.asOf === null || isCalendarDay(item.asOf)) || !(item.updatedAt === null || isCalendarDay(item.updatedAt))
      || (item.asOf !== null && item.updatedAt !== null && item.updatedAt < item.asOf)
      || !(item.confidence === null || points(item.confidence)) || !['complete', 'partial', 'missing'].includes(item.completeness)
      || item.synthetic !== true) return invalid('Invalid evidence provenance.');
    evidence.add(item.evidenceId);
  }

  for (const site of raw.sites) {
    if (!hasKeys(site, [...identityFields, ...Object.keys(groups)]) || !text(site.siteId) || !/^[A-Z0-9]+-[A-Z0-9]+$/.test(site.siteId)
      || !['name', 'portfolio', 'market', 'city'].every(key => text(site[key])) || !states.includes(site.state)
      || !['lattice', 'monopole', 'guyed', 'rooftop'].includes(site.type) || !['active', 'inactive'].includes(site.lifecycleStatus)
      || !Object.entries(groups).every(([key, keys]) => !keys.length || hasKeys(site[key], keys))) return invalid('Invalid site identity or attribute groups.');
    for (const [path, check] of Object.entries(paths)) {
      if (!validAttribute(readAttribute(site, path), check, evidence)) return invalid(`Invalid attribute or evidence reference at ${site.siteId} / ${path}.`);
    }
  }

  const siteIds = new Set(raw.sites.map(site => site.siteId));
  const baselineScenario = raw.scenarios.find(item => item.scenarioId === 'baseline');
  if (!baselineScenario || baselineScenario.referenceDate !== raw.referenceDate || baselineScenario.patches?.length !== 0) return invalid('Missing or modified baseline scenario.');
  for (const scenario of raw.scenarios) {
    if (!hasKeys(scenario, ['scenarioId', 'label', 'referenceDate', 'patches', 'notice'])
      || !text(scenario.scenarioId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.scenarioId)
      || !isCalendarDay(scenario.referenceDate) || !text(scenario.label) || !text(scenario.notice) || !Array.isArray(scenario.patches)) return invalid('Invalid scenario definition.');
    const targets = new Set();
    for (const patch of scenario.patches) {
      if (!hasKeys(patch, ['siteId', 'path', 'attribute']) || !siteIds.has(patch.siteId) || !Object.hasOwn(paths, patch.path)
        || !validAttribute(patch.attribute, paths[patch.path], evidence)) return invalid('Invalid scenario patch target or replacement.');
      const target = `${patch.siteId}:${patch.path}`;
      if (targets.has(target)) return invalid('Duplicate scenario patch target.');
      targets.add(target);
    }
  }

  const findingSites = new Map();
  for (const finding of raw.findings) {
    if (!hasKeys(finding, ['findingId', 'siteId', 'severity', 'kind', 'evidenceIds', 'text', 'impact', 'nextStep'])
      || !text(finding.findingId) || !siteIds.has(finding.siteId) || !severity.includes(finding.severity)
      || !['corrosion', 'inspection', 'remediation', 'energy', 'missing-info', 'power-upgrade', 'cabinet-upgrade', 'add-tenant'].includes(finding.kind)
      || !Array.isArray(finding.evidenceIds) || !finding.evidenceIds.length || !finding.evidenceIds.every(id => evidence.has(id))
      || !['text', 'impact', 'nextStep'].every(key => text(finding[key]))) return invalid('Invalid finding record or reference.');
    findingSites.set(finding.findingId, finding.siteId);
  }
  if (!raw.alerts.every(alert => hasKeys(alert, ['alertId', 'findingId', 'siteId', 'defaultStatus'])
    && text(alert.alertId) && siteIds.has(alert.siteId) && findingSites.get(alert.findingId) === alert.siteId && alert.defaultStatus === 'Open')) return invalid('Invalid alert or mismatched finding.');

  return { ok: true, value: freezeRecord(structuredClone(raw)) };
}

/** Load and validate independent fixture and rules assets together. */
export function loadBaseline() {
  return validateBundle({ ...baseline, config: rules });
}
