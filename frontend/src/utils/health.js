/** Derive health and provenance from a committed synthetic assessment snapshot. */
import { freezeRecord, readAttribute } from './fixtures.js';

const dayMs = 86_400_000;
export const structureScores = Object.freeze({ pass: 100, warning: 75, failed: 40 });
const corrosionScores = { none: 100, minor: 75, severe: 40 };
const scoreInputs = {
  'structure.status': 'structure',
  'condition.equipment': 'equipment',
  'condition.corrosion': 'equipment',
  'power.resilience': 'power',
  'condition.battery': 'power',
  'condition.generator': 'power',
  'histories.maintenance': 'maintenance',
  'histories.inspection': 'inspection',
};
const contextInputs = [
  'latitude', 'longitude', 'heightFt', 'commissionedYear', 'tenants', 'mounting.occupied', 'mounting.free',
  'structure.headroomPct', 'space.groundFreeSqFt', 'space.cabinetFreeUnits', 'power.loadKw', 'power.headroomKw',
  'connectivity.fiber', 'condition.criticalSafety', 'commercial.energyCost', 'commercial.operatingCost', 'permits',
];

/** Resolve an attribute-shaped input against the frozen reference date.
 *
 * @param {object} snapshot Committed source index, date and effective thresholds.
 * @param {object | undefined} attr Source envelope, including value and evidence ID.
 * @param {string} attribute Consumer-facing attribute or contextual key.
 * @param {'required' | 'optional'} materiality Whether the input affects the decision.
 * @returns {object} Known value, provenance, and independently computed evidence flags.
 */
export function resolveEvidence(snapshot, attr, attribute, materiality = 'optional') {
  const evidenceId = attr?.evidenceId ?? null;
  const record = snapshot.evidenceById.get(evidenceId);
  const value = record ? attr.value ?? null : null;
  const age = record?.asOf ? (Date.parse(snapshot.referenceDate) - Date.parse(record.asOf)) / dayMs : null;
  const confidence = record?.confidence ?? null;
  const completeness = record?.completeness ?? 'missing';
  const missingReason = value === null ? attr?.missingReason ?? 'not-provided' : null;
  const freshness = value === null || age === null ? 'Missing' : age < 0 ? 'Future-dated' : age > snapshot.config.staleDays ? 'Stale' : 'Current';
  const flags = [
    freshness !== 'Current' && freshness,
    confidence === null ? 'Confidence unavailable' : confidence < snapshot.config.minConfidence && 'Low Confidence',
    completeness !== 'complete' && (completeness === 'partial' ? 'Incomplete' : 'Missing'),
  ].filter(Boolean);
  return {
    evidenceId, attribute, materiality, value, missingReason, freshness, confidence, completeness,
    flags: [...new Set(flags)], usable: flags.length === 0,
    domain: record?.domain ?? null, sourceSystem: record?.sourceSystem ?? null,
    asOf: record?.asOf ?? null, updatedAt: record?.updatedAt ?? null, synthetic: record?.synthetic ?? false,
  };
}

/** Pick known history in reverse chronological order without modifying the fixture. */
export function sortHistory(history) {
  return [...(history ?? [])].sort((a, b) => b.date.localeCompare(a.date));
}

/** Apply the frozen UTC clock to expiry and the inclusive due window. */
export function inspectionTiming(date, referenceDate, config) {
  if (!date) return { latestDate: null, expiryDate: null, due: null, expired: null };
  const expiry = Date.parse(date) + config.inspectionValidityDays * dayMs;
  const reference = Date.parse(referenceDate);
  return {
    latestDate: date,
    expiryDate: new Date(expiry).toISOString().slice(0, 10),
    due: expiry <= reference + config.inspectionDueWindowDays * dayMs,
    expired: reference > expiry,
  };
}

/** Classify a rounded health score with inclusive cutoffs and a separate Unknown band. */
export function healthBand(score, bands) {
  return score === null ? 'Unknown' : score >= bands.good ? 'Good' : score >= bands.attention ? 'Needs Attention' : 'Critical';
}

/** Keep a whole component unknown when any of its primitive inputs is unavailable. */
function mean(...values) {
  return values.some(value => value == null) ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Limit a score or confidence after applying the inspection penalty. */
const clampPoints = value => Math.min(100, Math.max(0, value));

/** Compare stable identifiers without depending on host locale. */
const compareKey = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Generate currently applicable findings, retaining fixture IDs and prose where appropriate. */
function deriveFindings(snapshot, site, facts, inspection) {
  const { config } = snapshot;
  const results = [];
  const { siteId } = site;
  /** Add one condition with its triggering sources and latest known observation for sorting. */
  function add(kind, severity, inputs, text, impact, nextStep, useFixture = true) {
    const fixture = snapshot.findings.find(item => item.siteId === siteId && item.kind === kind);
    const evidenceIds = [...new Set(inputs.map(input => input.evidenceId).filter(Boolean))];
    const sources = evidenceIds.map(id => snapshot.evidenceById.get(id)).filter(Boolean);
    const observationDate = sources.map(source => source.asOf).filter(Boolean).sort(compareKey).at(-1) ?? null;
    const prose = useFixture && fixture && evidenceIds.length === fixture.evidenceIds.length
      && evidenceIds.every(id => fixture.evidenceIds.includes(id)) ? fixture : { text, impact, nextStep, severity };
    results.push({
      findingId: fixture?.findingId ?? `${siteId}:${kind}`, siteId, kind, evidenceIds, sources, observationDate,
      severity: prose.severity, text: prose.text, impact: prose.impact, nextStep: prose.nextStep,
      ...(kind === 'inspection' ? { dueDate: inspection.expiryDate } : {}),
    });
  }

  const corrosion = facts['condition.corrosion'];
  const safety = facts['condition.criticalSafety'];
  const structure = facts['structure.status'];
  if (corrosion.usable && corrosion.value === 'severe') {
    add('corrosion', 'Critical', [corrosion], 'Severe corrosion observed.', 'Structural safety is not confirmed.', 'Arrange certified inspection and remediation.');
  } else if ((safety.usable && safety.value === true) || (structure.usable && structure.value === 'failed')) {
    add('remediation', 'Critical', [safety, structure].filter(input => input.usable && (input.value === true || input.value === 'failed')),
      'A critical safety or structural issue is recorded.', 'The tower needs a qualified review.', 'Arrange certified inspection and remediation.');
  }
  if (inspection.due) {
    add('inspection', 'High', [facts['histories.inspection']], inspection.expired ? 'Inspection has expired.' : 'Inspection is due soon.',
      inspection.expired ? 'The existing inspection cannot support new loading.' : 'The inspection validity window is closing.', 'Schedule a new inspection.', inspection.expired);
  }
  const energy = facts['commercial.energyCost'];
  const operating = facts['commercial.operatingCost'];
  const highCosts = [energy, operating].filter((input, index) => input.usable && input.value > (index ? config.highOperatingCostCents : config.highEnergyCostCents));
  if (highCosts.length) {
    const text = highCosts.length === 2 ? 'Energy and operating costs exceed the provisional thresholds.'
      : highCosts[0] === energy ? 'Energy cost exceeds the provisional threshold.' : 'Operating cost exceeds the provisional threshold.';
    add('energy', 'Medium', highCosts, text, 'High spend reduces annual operating margin.', 'Review metering and operating costs with the owner.', highCosts.length === 1 && highCosts[0] === energy);
  }
  const gaps = Object.keys(scoreInputs).map(path => facts[path]).filter(input => !input.usable);
  if (gaps.length) {
    const inspectionGap = gaps.length === 1 && gaps[0] === facts['histories.inspection'];
    add('missing-info', 'High', gaps,
      `Health evidence needs review: ${gaps.map(input => input.attribute).join(', ')}.`,
      'The available evidence limits confidence in the assessment.', 'Collect current, complete records for the affected inputs.',
      inspectionGap && gaps[0].flags.includes('Stale') && gaps[0].completeness === 'partial');
  }
  return results.sort((a, b) => config.severityOrder.indexOf(a.severity) - config.severityOrder.indexOf(b.severity)
    || compareKey(b.observationDate ?? '', a.observationDate ?? '') || compareKey(a.findingId, b.findingId));
}

/** Calculate one assessment with unrounded components and traceable evidence.
 * @param {object} snapshot Committed fixture decision snapshot.
 * @param {object} site Site record from that snapshot.
 * @returns {object} Frozen health assessment, inspection timing, evidence and findings.
 */
export function assessHealth(snapshot, site) {
  const { config, scenarioId, settingsVersion, snapshotRevision, referenceDate } = snapshot;
  const facts = {};
  for (const path of [...Object.keys(scoreInputs), ...contextInputs]) {
    const attr = readAttribute(site, path);
    const component = scoreInputs[path] ?? null;
    const latest = path.startsWith('histories.') ? sortHistory(attr?.value)[0] : null;
    const input = path.startsWith('histories.') ? {
      ...attr, evidenceId: latest?.evidenceId ?? attr?.evidenceId, value: latest ?? null,
    } : attr;
    facts[path] = { ...resolveEvidence(snapshot, input, path, component ? 'required' : 'optional'), component };
  }

  const required = Object.keys(scoreInputs).map(path => facts[path]);
  const [status, equipment, corrosion, resilience, battery, generator, maintenance, inspectionInput] = required.map(input => input.value);
  const conditions = config.conditionScores;
  const inspection = inspectionTiming(inspectionInput?.date, referenceDate, config);
  const components = {
    structure: structureScores[status] ?? null,
    equipment: mean(conditions[equipment], corrosionScores[corrosion]),
    power: mean(conditions[resilience], conditions[battery], conditions[generator]),
    maintenance: conditions[maintenance?.condition] ?? null,
    dataQuality: Math.round(100 * required.filter(input => input.usable).length / required.length),
  };
  const penalty = inspection.expired ? config.expiredHealthPenalty : 0;
  const score = inspection.latestDate === null || Object.values(components).includes(null) ? null : Math.round(clampPoints(
    Object.entries(components).reduce((sum, [axis, value]) => sum + value * config.healthWeights[axis], 0) / 100 - penalty,
  ));
  const confidence = required.some(input => input.value === null || input.confidence === null) ? null : clampPoints(
    Math.min(...required.map(input => input.confidence)) - (inspection.expired ? config.expiredConfidencePenalty : 0),
  );
  return freezeRecord({
    ref: { scenarioId, settingsVersion, snapshotRevision, siteId: site.siteId },
    assessedAt: `${referenceDate}T00:00:00Z`, inspection,
    health: { components, score, band: healthBand(score, config.healthBands), penalty, confidence },
    findings: deriveFindings(snapshot, site, facts, inspection), evidence: Object.values(facts),
    disclaimer: 'Indicative assessment only',
  });
}

/** Index assessment records once per decision snapshot; workflow is not an input. */
export function deriveAssessments(snapshot) {
  return new Map(snapshot ? [...snapshot.sitesById].map(([siteId, site]) => [siteId, assessHealth(snapshot, site)]) : []);
}
