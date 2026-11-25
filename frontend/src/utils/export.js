/** Capture and serialize a single synthetic assessment for local preview and download. */
import { freezeRecord } from './fixtures.js';

const refKeys = ['scenarioId', 'settingsVersion', 'snapshotRevision', 'siteId'];
const filenamePattern = /^[A-Z0-9][A-Z0-9-]*-[a-z][a-z0-9-]*-assessment\.txt$/;

/** Compare all decision identifiers, excluding the active assessment tab. */
export function sameAssessmentRef(left, right) {
  return Boolean(left && right && refKeys.every(key => left[key] === right[key]));
}

/** Copy all display inputs before any later scenario or setting can affect them. */
export function captureExport(ref, index) {
  const assessment = index.get(ref?.siteId);
  if (!sameAssessmentRef(ref, assessment?.ref)) return { ok: false, code: 'STALE_VIEW' };
  const { scenarioId, siteId } = assessment.ref;
  const filename = `${siteId}-${scenarioId}-assessment.txt`;
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(siteId) || !/^[a-z][a-z0-9-]*$/.test(scenarioId) || !filenamePattern.test(filename)) {
    return { ok: false, code: 'EXPORT_FAILED' };
  }
  const { health, readiness, evidence, assessedAt, constraints, recommendation, requiredValidation, disclaimer } = assessment;
  const record = structuredClone({
    ref: assessment.ref, filename, towerId: siteId, assessedAt, healthScore: health.score, healthBand: health.band,
    readinessScore: readiness.score, answer: readiness.answer, rule: readiness.decidingRule, thresholds: readiness.effectiveThresholds,
    evidence: evidence.map(row => ({ id: row.evidenceId, attribute: row.attribute, value: row.value, status: row.freshness,
      source: row.sourceSystem, domain: row.domain, asOf: row.asOf, updatedAt: row.updatedAt,
      confidence: row.confidence, completeness: row.completeness, flags: row.flags })),
    gaps: evidence.filter(row => !row.usable).map(row => ({ attribute: row.attribute, reason: row.missingReason, flags: row.flags })),
    constraints, recommendation, requiredValidation, disclaimer,
  });
  return { ok: true, record: freezeRecord(record) };
}

/** Label missing values without conflating them with zero or false. */
const display = value => value == null ? 'Unknown' : typeof value === 'object' ? JSON.stringify(value) : String(value);
/** Format a labeled list with an explicit empty state. */
const list = rows => rows.length ? rows.map(row => `- ${row}`).join('\n') : '- None recorded';

/** Render the exact plain text shared by the preview and the downloadable file. */
export function renderText(record) {
  const { ref, evidence, gaps } = record;
  return [
    'ESDT Tower Intelligence — Synthetic assessment',
    `Tower: ${record.towerId}`, `Scenario: ${ref.scenarioId}`, `Assessment date (UTC): ${record.assessedAt}`,
    `Snapshot revision: ${ref.snapshotRevision} | Settings version: ${ref.settingsVersion}`,
    `Health score: ${record.healthScore == null ? 'Unknown' : `${record.healthScore}/100`} (${record.healthBand})`,
    `Readiness score: ${record.readinessScore == null ? 'Unknown' : `${record.readinessScore}/100`}`,
    `Answer: ${record.answer}`, `Deciding rule: ${record.rule}`, `Effective thresholds: ${display(record.thresholds)}`,
    '', 'Evidence (synthetic):', list(evidence.map(row =>
      `${row.attribute} [${display(row.id)}]: ${display(row.value)} | ${row.status} | ${display(row.domain)} / ${display(row.source)} | observed ${display(row.asOf)} | updated ${display(row.updatedAt)} | confidence ${row.confidence == null ? 'Unknown' : `${row.confidence}%`} | ${row.completeness}${row.flags?.length ? ` | ${row.flags.join(', ')}` : ''}`)),
    '', 'Gaps:', list(gaps.map(row => `${row.attribute}: ${[row.reason, ...row.flags].filter(Boolean).join(', ') || 'Unknown'}`)),
    '', 'Constraints:', list(record.constraints), '', `Recommendation: ${record.recommendation}`,
    '', 'Required validation:', list(record.requiredValidation), '', record.disclaimer,
  ].join('\n');
}

/** Initiate a local TXT download and release its object URL after dispatch. */
export function downloadText(text, filename, browser = globalThis) {
  if (typeof text !== 'string' || typeof filename !== 'string' || !filenamePattern.test(filename)) return { ok: false, code: 'EXPORT_FAILED' };
  let url;
  let anchor;
  try {
    url = browser.URL.createObjectURL(new browser.Blob([text], { type: 'text/plain;charset=utf-8' }));
    anchor = browser.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    browser.document.body.append(anchor);
    anchor.click();
    return { ok: true, filename };
  } catch {
    return { ok: false, code: 'EXPORT_FAILED' };
  } finally {
    anchor?.remove();
    if (url) browser.setTimeout(() => browser.URL.revokeObjectURL(url), 0);
  }
}
