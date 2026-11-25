/** Evaluate synthetic tenant fit from current evidence before considering score bands. */
import { freezeRecord, readAttribute } from './fixtures.js';
import { resolveEvidence, structureScores } from './health.js';

const axes = {
  'structure.status': ['Structure status', 'structure'],
  'structure.headroomPct': ['Structural headroom', 'structure'],
  'mounting.free': ['Free mounts', 'mounting'],
  'space.cabinetFreeUnits': ['Free cabinet units', 'space'],
  'space.requiredCabinetUnits': ['Required cabinet units', 'space'],
  'power.headroomKw': ['Power headroom', 'power'],
  'power.requiredKw': ['Required power', 'power'],
  'connectivity.requiredFiber': ['Fiber requirement', 'connectivity'],
  'connectivity.fiber': ['Fiber availability', 'connectivity'],
  'condition.criticalSafety': ['Critical safety status'],
  'space.groundFreeSqFt': ['Free ground space'],
  permits: ['Permits and consent'],
};

const answers = {
  HARD_BLOCKER: 'No', MATERIAL_GAP: 'Need More Information', UPGRADE_FIT: 'Yes after an upgrade',
  UNVERIFIED_POWER: 'Need More Information', CURRENT_FIT: 'Yes', UPGRADE_UNESTABLISHED: 'Need More Information',
  BAND_INFORMATION: 'Need More Information', BAND_NO: 'No',
};

/** Return the first applicable rule, never using a score to bypass a constraint. */
function decide({ blocked, materialGap, upgradeFit, unverifiedPower, currentFit, score }, bands) {
  if (blocked) return 'HARD_BLOCKER';
  if (materialGap) return 'MATERIAL_GAP';
  if (upgradeFit) return 'UPGRADE_FIT';
  if (unverifiedPower) return 'UNVERIFIED_POWER';
  if (currentFit && score !== null && score >= bands.yes) return 'CURRENT_FIT';
  if (score !== null && score >= bands.upgrade) return 'UPGRADE_UNESTABLISHED';
  if (score === null || score >= bands.information) return 'BAND_INFORMATION';
  return 'BAND_NO';
}

/** Normalize a component without filling missing inputs with zero. */
function capacityScore(available, required) {
  if (required === 0) return 100;
  return available === null || required === null ? null : clamp(100 * available / required);
}

/** Keep signed physical capacity separate from bounded technical points. */
const clamp = value => Math.max(0, Math.min(100, value));

/** Measure a confirmed shortfall only when both inputs can support the comparison. */
const deficit = (available, required) => available === null || required === null ? null : Math.max(0, required - available);

/** Check a specific proposal's capacity and future fit as distinct observations. */
function inspectUpgrade(snapshot, catalog, kind, required, evidence) {
  const candidate = catalog.value?.find(item => item.kind === kind);
  if (!candidate) return { potential: false, confirmed: false, infeasible: false };
  const label = `${kind === 'power' ? 'Power' : 'Cabinet'} upgrade`;
  const capacity = resolveEvidence(snapshot, { value: candidate.afterCapacity, evidenceId: candidate.evidenceId }, `upgrades.${kind}.afterCapacity`, 'required');
  const futureFit = resolveEvidence(snapshot, { value: candidate.feasibility, evidenceId: candidate.futureFitEvidenceId }, `upgrades.${kind}.futureFit`, 'required');
  evidence.push({ ...capacity, label: `${label} after-capacity` }, { ...futureFit, label: `${label} future fit` });
  const knownCapacity = catalog.usable && capacity.usable;
  const infeasible = (catalog.usable && futureFit.usable && candidate.feasibility === 'infeasible')
    || (knownCapacity && candidate.afterCapacity < required);
  const potential = knownCapacity && !infeasible;
  return {
    potential, infeasible, confirmed: potential && futureFit.usable && candidate.feasibility === 'confirmed',
    afterCapacity: knownCapacity ? candidate.afterCapacity : null,
  };
}

/** Build a next step specific to the deciding rule and the named constraints. */
function nextStep(rule, { blockers, gaps, remedies, constraints }) {
  switch (rule) {
    case 'HARD_BLOCKER': return `Do not pursue an additional tenant unless these blockers are resolved: ${blockers.join('; ')}.`;
    case 'MATERIAL_GAP': return `Collect current, complete evidence for: ${gaps.map(gap => gap.label).join(', ')}.`;
    case 'UPGRADE_FIT': return `Complete the ${remedies.map(kind => `${kind} upgrade`).join(' and ')} before adding a tenant, then validate fit.`;
    case 'UNVERIFIED_POWER': return 'Confirm a feasible power upgrade and document its after-capacity and future fit.';
    case 'CURRENT_FIT': return 'Validate the proposed additional tenant against the current site configuration.';
    case 'BAND_NO': return 'Do not pursue an additional tenant under the current readiness assumptions.';
    default: return constraints.length ? `Resolve the outstanding constraints before reconsidering fit: ${constraints.join('; ')}.`
      : 'Verify the site and tenant requirements before reconsidering fit.';
  }
}

/** Derive an immutable technical score, business answer, and traceable decision inputs.
 * @param {object} snapshot Committed date, evidence index and provisional settings.
 * @param {object} site Site from the committed snapshot.
 * @param {object[]} findings Health findings for validation context, not proof of fit.
 * @returns {object} Readiness, explanatory evidence, recommendation and required validation.
 */
export function assessReadiness(snapshot, site, findings = []) {
  const { config } = snapshot;
  const facts = Object.fromEntries(Object.entries(axes).map(([path, [label, component]]) => [path, {
    ...resolveEvidence(snapshot, readAttribute(site, path), path), label, component,
  }]));
  /** Read only a value supported by current, complete evidence. */
  const known = path => facts[path].usable ? facts[path].value : null;
  const status = known('structure.status');
  const structuralHeadroom = known('structure.headroomPct');
  const freeMounts = known('mounting.free');
  const freeCabinet = known('space.cabinetFreeUnits');
  const requiredCabinet = known('space.requiredCabinetUnits');
  const headroomKw = known('power.headroomKw');
  const requiredKw = known('power.requiredKw');
  const safety = known('condition.criticalSafety');
  const requiresFiber = known('connectivity.requiredFiber');
  const hasFiber = known('connectivity.fiber');
  const connectivity = requiresFiber === false || hasFiber === true ? 100 : requiresFiber === true && hasFiber === false ? 0 : null;
  for (const [path, fact] of Object.entries(facts)) {
    const optional = path === 'permits' || path === 'space.groundFreeSqFt'
      || (path === 'space.cabinetFreeUnits' && requiredCabinet === 0)
      || (path === 'connectivity.fiber' && requiresFiber === false)
      || (path === 'connectivity.requiredFiber' && hasFiber === true);
    fact.materiality = optional ? 'optional' : 'required';
  }

  const spaceDeficit = requiredCabinet === 0 ? 0 : deficit(freeCabinet, requiredCabinet);
  const powerDeficit = deficit(headroomKw, requiredKw);
  const { powerToleranceKw } = config;
  const components = {
    structure: status === null || structuralHeadroom === null ? null : (structureScores[status] + clamp(structuralHeadroom)) / 2,
    mounting: freeMounts === null ? null : freeMounts >= 1 ? 100 : 0,
    space: capacityScore(freeCabinet, requiredCabinet),
    power: capacityScore(headroomKw, requiredKw),
    connectivity,
  };
  const score = Object.values(components).includes(null) ? null : Math.round(
    Object.entries(components).reduce((sum, [axis, points]) => sum + config.readinessWeights[axis] * points, 0) / 100,
  );
  const evidence = Object.values(facts);
  const blockers = [];
  const constraints = [];
  if (status === 'failed') blockers.push('Confirmed structural failure');
  if (freeMounts === 0) blockers.push('No free mount');
  if (safety === true) blockers.push('Unresolved critical safety issue');
  if (powerDeficit > powerToleranceKw) blockers.push('Power shortfall exceeds the provisional tolerance');
  if (status === 'warning') constraints.push('Structural status requires review');
  if (structuralHeadroom !== null && structuralHeadroom <= 0) constraints.push('No positive structural headroom');
  if (connectivity === 0) constraints.push('Required fiber is unavailable');
  if (powerDeficit > 0) constraints.push(`Power shortfall: ${powerDeficit} kW`);
  if (spaceDeficit > 0) constraints.push(`Cabinet shortfall: ${spaceDeficit} ${spaceDeficit === 1 ? 'unit' : 'units'}`);

  const requiredRemedies = [];
  if (powerDeficit > 0 && powerDeficit <= powerToleranceKw) requiredRemedies.push(['power', requiredKw]);
  if (spaceDeficit > 0) requiredRemedies.push(['cabinet', requiredCabinet]);
  const remedies = [];
  const afterCapacities = {};
  if (requiredRemedies.length) {
    const catalog = resolveEvidence(snapshot, site.upgrades, 'upgrades', 'required');
    evidence.push({ ...catalog, value: catalog.value?.length ?? null, label: 'Upgrade options' });
    for (const [kind, demand] of requiredRemedies) {
      const result = inspectUpgrade(snapshot, catalog, kind, demand, evidence);
      if (result.afterCapacity != null) afterCapacities[kind] = result.afterCapacity;
      if (result.confirmed) remedies.push(kind);
      else if (kind === 'cabinet' && !result.potential) blockers.push('No evidenced cabinet remedy meets demand');
      else if (result.infeasible) blockers.push('Power upgrade is infeasible or does not meet demand');
      else constraints.push(`${kind === 'power' ? 'Power' : 'Cabinet'} upgrade future fit is unverified`);
    }
  }

  const gaps = evidence.filter(row => !row.usable);
  const materialGaps = gaps.filter(row => row.materiality === 'required');
  const baseFit = status === 'pass' && structuralHeadroom > 0 && freeMounts >= 1 && safety === false && connectivity === 100;
  const currentFit = baseFit && powerDeficit === 0 && spaceDeficit === 0;
  const upgradeFit = baseFit && requiredRemedies.length > 0 && remedies.length === requiredRemedies.length
    && spaceDeficit !== null && powerDeficit !== null;
  const decidingRule = decide({ blocked: blockers.length > 0, materialGap: materialGaps.length > 0, upgradeFit,
    unverifiedPower: powerDeficit > 0 && !remedies.includes('power'), currentFit, score }, config.readinessBands);
  const allConstraints = [...blockers, ...constraints];
  const requiredValidation = ['Certified structural and site validation before implementation'];
  if (findings.some(finding => finding.kind === 'inspection' && finding.dueDate < snapshot.referenceDate)) {
    requiredValidation.push('Renew the expired inspection');
  }
  return freezeRecord({
    components, score, answer: answers[decidingRule], decidingRule, currentFit,
    effectiveInputs: { ...Object.fromEntries(Object.keys(facts).map(path => [path, known(path)])), powerDeficit, spaceDeficit, afterCapacities },
    effectiveThresholds: { ...config.readinessBands, powerToleranceKw, staleDays: config.staleDays, minConfidence: config.minConfidence,
      weights: { ...config.readinessWeights } },
    confidence: materialGaps.length ? null : Math.min(...evidence.filter(row => row.materiality === 'required').map(row => row.confidence)),
    evidence, gaps, constraints: allConstraints, remedies,
    permits: known('permits'), recommendation: nextStep(decidingRule, { blockers, gaps: materialGaps, remedies, constraints: allConstraints }),
    requiredValidation, disclaimer: 'Indicative assessment only',
  });
}
