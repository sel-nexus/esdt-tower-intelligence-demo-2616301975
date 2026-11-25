/** Present the business answer first and keep technical and commercial context distinct. */
import PropTypes from 'prop-types';
import { EvidencePanel } from './EvidencePanel.jsx';
import { formatIllustrativeUsd } from '../utils/economics.js';

const section = 'rounded-lg border border-border bg-surface p-5 sm:p-7';
const details = 'min-h-11 cursor-pointer py-2 font-semibold focus-visible:outline-ring';
const labels = { structure: 'Structure', mounting: 'Mounting', space: 'Cabinet space', power: 'Power', connectivity: 'Connectivity' };
const moneyLabels = {
  revenue: 'Annual revenue', operatingCost: 'Annual operating cost', energyCost: 'Annual energy cost (included in operating cost)',
  upgradeCost: 'Upgrade investment', annualUpside: 'Annual revenue upside',
};
const ruleExplanations = {
  HARD_BLOCKER: 'A confirmed blocker takes precedence over the score and any other evidence gaps.',
  MATERIAL_GAP: 'Current evidence is insufficient to determine fit.',
  UPGRADE_FIT: 'Current capacity falls short, but the documented upgrade meets the modeled demand.',
  UNVERIFIED_POWER: 'There is not enough evidence that a power upgrade can meet demand.',
  CURRENT_FIT: 'Current evidence supports fit and the score meets the configured threshold.',
  UPGRADE_UNESTABLISHED: 'The score alone does not establish a feasible upgrade.',
  BAND_INFORMATION: 'The available evidence and score do not establish fit.',
  BAND_NO: 'The readiness score falls below the configured threshold for further consideration.',
};

/** Lay out label/value pairs without requiring horizontal scrolling. */
function Measures({ rows }) {
  return (
    <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-foreground-muted">{label}</dt>
          <dd className="mt-1 font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

Measures.propTypes = { rows: PropTypes.arrayOf(PropTypes.array.isRequired).isRequired };

/** Render the committed growth assessment without evaluating rules in the view. */
export function GrowthPanel({ readiness, commercial }) {
  const { effectiveThresholds: thresholds, effectiveInputs: inputs } = readiness;
  const hasRequiredGaps = readiness.gaps.some(gap => gap.materiality === 'required');

  return (
    <>
      <section className={section} aria-labelledby="growth-fit">
        <div className="decision-grid decision-lead">
          <div>
            <h2 id="growth-fit" className="decision-label">Colocation readiness</h2>
            <p className="mt-2 text-sm text-foreground-muted">Can this tower support an additional tenant?</p>
            <p className="decision-answer mt-1" role="status">{readiness.answer}</p>
            <p className="mt-2 max-w-prose text-sm">{ruleExplanations[readiness.decidingRule]}</p>
            <p className="mt-3 text-sm text-foreground-muted">Technical readiness score: <strong>{readiness.score === null ? 'Unknown' : `${readiness.score}/100`}</strong></p>
          </div>
          <div className="decision-note">
            <p className="decision-label">{readiness.disclaimer}</p>
            <h3 className="mt-2 font-semibold">Required before implementation</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {readiness.requiredValidation.map(item => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-sm text-foreground-muted">Provisional demo assumptions · Product signoff pending</p>
          </div>
        </div>
        <p className="mt-5 max-w-prose"><strong>Next step:</strong> {readiness.recommendation}</p>
        <div className="decision-grid mt-5 border-t border-border pt-4">
          <div>
            <h3 className="font-semibold">Fit constraints</h3>
            {readiness.constraints.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {readiness.constraints.map(text => <li key={text}>{text}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm">None identified in current evidence.</p>}
          </div>
          <div>
            <h3 className="font-semibold">Fit evidence gaps</h3>
            {readiness.gaps.length ? (
              <>
                {hasRequiredGaps && <p className="mt-2 text-sm">Collect current, complete records for the required inputs below before reassessing fit.</p>}
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {readiness.gaps.map(gap => (
                    <li key={gap.attribute}>{gap.label}: {gap.flags.join(' · ')}{gap.materiality === 'optional' ? ' (context only)' : ' (required for fit)'}</li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-2 text-sm">None identified.</p>}
          </div>
        </div>
        <p className="mt-4 text-sm">Permits and consent: {readiness.permits ?? 'Unknown; confirm requirements before work.'}</p>
        <details className="mt-4 border-t border-border pt-2">
          <summary className={details}>Deciding rule and score breakdown</summary>
          <p className="mt-2 text-sm">Deciding rule: <code>{readiness.decidingRule}</code></p>
          <Measures rows={[
            ...Object.entries(readiness.components).map(([key, points]) => [
              `${labels[key]} · ${thresholds.weights[key]}% weight`, points === null ? 'Unknown' : `${Number(points.toFixed(2))}/100`,
            ]),
            ['Structure status', inputs['structure.status'] ?? 'Unknown'],
            ['Structural headroom', inputs['structure.headroomPct'] === null ? 'Unknown' : `${inputs['structure.headroomPct']}%`],
            ['Free mounts', inputs['mounting.free'] ?? 'Unknown'],
            ['Fiber availability', inputs['connectivity.fiber'] === null ? 'Unknown' : inputs['connectivity.fiber'] ? 'Available' : 'Not available'],
            ['Fiber requirement', inputs['connectivity.requiredFiber'] === null ? 'Unknown' : inputs['connectivity.requiredFiber'] ? 'Required' : 'Not required'],
            ['Power headroom', inputs['power.headroomKw'] === null ? 'Unknown' : `${inputs['power.headroomKw']} kW`],
            ['Required power', inputs['power.requiredKw'] === null ? 'Unknown' : `${inputs['power.requiredKw']} kW`],
            ['Free cabinet units', inputs['space.cabinetFreeUnits'] ?? 'Unknown'],
            ['Required cabinet units', inputs['space.requiredCabinetUnits'] ?? 'Unknown'],
            ['Free ground space', inputs['space.groundFreeSqFt'] === null ? 'Unknown' : `${inputs['space.groundFreeSqFt']} sq ft`],
            ...Object.entries(inputs.afterCapacities).map(([kind, value]) => [
              kind === 'power' ? 'Estimated power headroom after upgrade' : 'Estimated free cabinet units after upgrade',
              kind === 'power' ? `${value} kW` : value,
            ]),
            ['Power shortfall tolerance', `${thresholds.powerToleranceKw} kW`],
            ['Score cutoffs (yes / upgrade / information)', `${thresholds.yes} / ${thresholds.upgrade} / ${thresholds.information}`],
            ['Minimum source confidence / maximum age', `${thresholds.minConfidence}% / ${thresholds.staleDays} days`],
            ['Readiness confidence', readiness.confidence === null ? 'Unknown' : `${readiness.confidence}%`],
          ]} />
        </details>
      </section>
      <CommercialSnapshot commercial={commercial} title="Indicative economics" />
      <EvidencePanel evidence={[
        ...readiness.evidence,
        ...commercial.evidence.filter(row => !readiness.evidence.some(item => item.attribute === row.attribute)),
      ]} />
    </>
  );
}

GrowthPanel.propTypes = { readiness: PropTypes.object.isRequired, commercial: PropTypes.object.isRequired };

/** Present the Tower Owner's illustrative economics separately from technical fit. */
export function CommercialSnapshot({ commercial, title }) {
  const utilization = commercial.utilization === null ? 'Unknown'
    : `${commercial.occupiedMounts}/${commercial.totalMounts} (${Math.round(100 * commercial.utilization)}%)`;
  const payback = commercial.paybackStatus === 'known' ? `${commercial.paybackYears.toFixed(2)} years`
    : commercial.paybackStatus === 'unknown' ? 'Unknown' : 'Not applicable';
  const money = Object.entries(moneyLabels).map(([key, label]) => [label, formatIllustrativeUsd(commercial[key])]);
  return (
    <section className={section} aria-labelledby="assessment-economics">
      <p className="decision-label">Tower Owner data</p>
      <h2 id="assessment-economics" className="mt-1 text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-prose text-sm text-foreground-muted">Illustrative USD, not an approved business case. Simple payback divides upgrade investment by positive annual revenue upside and excludes financing and other costs.</p>
      <Measures rows={[
        ...money.slice(3), ['Simple payback', payback], ...money.slice(0, 3),
        ['Active tenants', commercial.activeTenants ?? 'Unknown'], ['Mount utilization', utilization],
      ]} />
      {commercial.paybackReason && <p className="mt-3 text-sm text-foreground-muted">Payback: {commercial.paybackReason}</p>}
      <details className="mt-4 border-t border-border pt-2">
        <summary className={details}>Raw illustrative amounts (USD cents)</summary>
        <Measures rows={Object.entries(moneyLabels).map(([key, label]) => [label, commercial[key] ?? 'Unknown'])} />
      </details>
    </section>
  );
}

CommercialSnapshot.propTypes = { commercial: PropTypes.object.isRequired, title: PropTypes.string.isRequired };
