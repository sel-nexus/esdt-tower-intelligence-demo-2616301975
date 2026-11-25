/** Present the assessment selector and the selected tower's overview or growth view. */
import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import { AssessmentExport } from '../components/AssessmentExport.jsx';
import { EvidencePanel } from '../components/EvidencePanel.jsx';
import { CommercialSnapshot, GrowthPanel } from '../components/GrowthPanel.jsx';
import { usePortfolio } from '../components/PortfolioProvider.jsx';
import { nextOperationalAction } from '../utils/actions.js';
import { sortHistory } from '../utils/health.js';

const heading = 'decision-title text-3xl font-semibold tracking-tight sm:text-4xl';
const link = 'inline-flex min-h-11 items-center font-semibold text-primary-700 underline underline-offset-4 focus-visible:outline-ring';
const section = 'rounded-lg border border-border bg-surface p-5 sm:p-7';
const componentLabels = { structure: 'Structure', equipment: 'Equipment', power: 'Power', maintenance: 'Maintenance', dataQuality: 'Data quality' };
const bandStyles = { Good: 'text-primary-700', 'Needs Attention': 'text-foreground', Critical: 'text-error', Unknown: 'text-foreground-muted' };

/** Build the canonical link from a known site ID. */
export const overviewHref = siteId => `#/assessments/${encodeURIComponent(siteId)}/overview`;

/** Keep unknown inputs distinct from legitimate zero and false values. */
function measure(value, unit = '') {
  return value == null ? 'Unknown' : `${value}${unit}`;
}

/** Present the tower's physical and occupancy context independently of the score. */
function TowerProfile({ site }) {
  const occupied = site.mounting.occupied.value;
  const free = site.mounting.free.value;
  const utilization = occupied != null && free != null && occupied + free > 0
    ? `${occupied}/${occupied + free} (${Math.round(100 * occupied / (occupied + free))}%)` : 'Unknown';
  const fiber = site.connectivity.fiber.value;
  const rows = [
    ['Portfolio', site.portfolio], ['Market', site.market], ['Location', `${site.city}, ${site.state}, US`],
    ['Coordinates', site.latitude.value == null || site.longitude.value == null ? 'Unknown' : `${site.latitude.value}, ${site.longitude.value}`],
    ['Tower type', site.type], ['Lifecycle status', site.lifecycleStatus], ['Height', measure(site.heightFt.value, ' ft')],
    ['Commissioned', measure(site.commissionedYear.value)],
    ['Active tenants', measure(site.tenants.value?.filter(tenant => tenant.leaseStatus === 'active').length)],
    ['Mount utilization', utilization], ['Occupied mounts', measure(occupied)], ['Free mounts', measure(free)],
    ['Structural status', measure(site.structure.status.value)], ['Structural headroom', measure(site.structure.headroomPct.value, '%')],
    ['Free ground space', measure(site.space.groundFreeSqFt.value, ' sq ft')], ['Free cabinet units', measure(site.space.cabinetFreeUnits.value)],
    ['Power load', measure(site.power.loadKw.value, ' kW')], ['Power headroom', measure(site.power.headroomKw.value, ' kW')],
    ['Fiber', fiber == null ? 'Unknown' : fiber ? 'Available' : 'Not available'],
  ];
  return (
    <section className={section} aria-labelledby="tower-profile">
      <h2 id="tower-profile" className="text-xl font-semibold">Tower profile</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-foreground-muted">{label}</dt>
            <dd className="mt-1 font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

TowerProfile.propTypes = { site: PropTypes.object.isRequired };

/** List the newest history entries first, distinguishing an empty log from missing evidence. */
function History({ title, entries }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {entries?.length ? (
        <ul className="mt-2 space-y-3 text-sm">
          {sortHistory(entries).map(entry => (
            <li key={`${entry.date}:${entry.evidenceId}:${entry.summary}`}>
              <time dateTime={entry.date} className="font-medium tabular-nums">{entry.date}</time>
              <p>{entry.summary} · {entry.condition}</p>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-foreground-muted">{entries == null ? 'History unavailable.' : 'No entries recorded.'}</p>}
    </div>
  );
}

History.propTypes = { title: PropTypes.string.isRequired, entries: PropTypes.arrayOf(PropTypes.object) };

/** Keep the sequential simulation controls anchored to a stable, live alert label. */
function AlertRow({ alert, finding, revision, send }) {
  const statusRef = useRef(null);
  const next = alert.status === 'Open' ? 'Acknowledged' : alert.status === 'Acknowledged' ? 'Closed' : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium">{finding.text}</p>
        <p ref={statusRef} tabIndex={-1} role="status" className="text-sm text-foreground-muted">Alert status: {alert.status}</p>
      </div>
      {next && (
        <button
          type="button"
          aria-label={`${next === 'Closed' ? 'Close' : 'Acknowledge'} alert: ${finding.text}`}
          className="min-h-11 rounded-md border border-border px-4 text-sm font-semibold hover:bg-background focus-visible:outline-ring"
          onClick={() => {
            if (next === 'Closed') statusRef.current?.focus();
            send({ kind: 'setAlert', alertId: alert.alertId, to: next, snapshotRevision: revision });
          }}
        >
          {next === 'Closed' ? 'Close alert' : 'Acknowledge alert'}
        </button>
      )}
    </li>
  );
}

AlertRow.propTypes = { alert: PropTypes.object.isRequired, finding: PropTypes.object.isRequired, revision: PropTypes.number.isRequired, send: PropTypes.func.isRequired };

/** Show the frozen assessment or recover to the selector when a site no longer resolves. */
export default function AssessmentPage({ siteId, tab = 'overview' }) {
  const { state, snapshot, assessments, alerts, actions, send } = usePortfolio();
  const site = snapshot?.sitesById.get(siteId);
  const assessment = assessments.get(siteId);
  const delivered = useRef(null);
  const currentRef = assessment?.ref;
  useEffect(() => {
    if (!currentRef || delivered.current === currentRef) return;
    delivered.current = currentRef;
    send({ kind: 'assessmentDelivered', ref: currentRef });
  }, [currentRef, send]);
  if (!snapshot || !assessment) {
    return (
      <>
        <h1 className={heading} tabIndex={-1}>Assessments</h1>
        {!snapshot ? (
          <p role="alert" className="mt-4 text-error">Synthetic fixture unavailable. {state.fixtureError}</p>
        ) : (
          <>
            {siteId && <p role="status" className="mt-3">Tower not found in the active scenario. Select another tower below.</p>}
            <p className="mt-3 text-foreground-muted">Select a tower to review its health, evidence and growth potential.</p>
            {snapshot.sitesById.size ? (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...snapshot.sitesById.values()].map(item => (
                  <li key={item.siteId}>
                    <a href={overviewHref(item.siteId)} className="block rounded-md border border-border bg-surface p-4 hover:bg-surface-raised focus-visible:outline-ring">
                      <span className="block font-semibold text-primary-700">{item.siteId} · {item.name}</span>
                      <span className="mt-1 block text-sm text-foreground-muted">{item.market} · {assessments.get(item.siteId).health.band}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4">No towers in the active scenario.</p>}
          </>
        )}
      </>
    );
  }

  const { health, inspection, findings, evidence, commercial, disclaimer, ref } = assessment;
  const healthEvidenceNeedsReview = findings.some(finding => finding.kind === 'missing-info');
  const siteAlerts = alerts.filter(alert => alert.siteId === siteId);
  const nextAction = nextOperationalAction(actions, siteId);
  return (
    <div className="space-y-6">
      <header>
        <a href="#/assessments" className={link}>All assessments</a>
        <h1 className={heading} tabIndex={-1}>{site.siteId} · {site.name}</h1>
        <p className="mt-2 text-sm text-foreground-muted">{site.city}, {site.state} · {snapshot.scenarioLabel} · {snapshot.referenceDate} (UTC)</p>
        <nav aria-label="Assessment views" className="decision-tabs mt-4 flex flex-wrap gap-x-3 border-b border-border">
          <a href={overviewHref(siteId)} className={link} aria-current={tab === 'overview' ? 'page' : undefined}>Overview</a>
          <a href={`#/assessments/${encodeURIComponent(siteId)}/growth`} className={link} aria-current={tab === 'growth' ? 'page' : undefined}>Growth</a>
        </nav>
      </header>
      {tab === 'growth' ? <GrowthPanel readiness={assessment.readiness} commercial={assessment.commercial} /> : <>
      <section className={section} aria-labelledby="tower-health">
        <div className="decision-grid decision-lead">
          <div>
            <h2 id="tower-health" className="decision-label">Tower health</h2>
            <p className="decision-answer mt-2 tabular-nums">
              <span className={bandStyles[health.band]}>{health.band}</span>{health.score === null ? '' : ` · ${health.score}/100`}
            </p>
            <p className="mt-3 text-sm">
              Latest inspection: {inspection.latestDate ?? 'Unknown'}
              {inspection.expiryDate && ` · ${inspection.expired ? 'Expired' : inspection.due ? 'Due soon' : 'Within validity window'} · Expiry: ${inspection.expiryDate}`}
            </p>
            {healthEvidenceNeedsReview && <p className="mt-2 text-sm">Required health evidence needs review. Check the findings and source records before relying on this assessment.</p>}
          </div>
          <div className="decision-note">
            <p className="decision-label">{disclaimer}</p>
            <h3 className="mt-2 font-semibold">Recommended next step</h3>
            <p className="mt-1 text-sm">{nextAction?.nextStep ?? assessment.recommendation}</p>
            <p className="mt-2 text-sm text-foreground-muted">Workshop recommendation only. No work order is issued.</p>
          </div>
        </div>
        <details className="mt-4 border-t border-border pt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold focus-visible:outline-ring">Health score breakdown</summary>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(health.components).map(([key, value]) => (
              <div key={key}>
                <dt className="text-foreground-muted">{componentLabels[key]} · {snapshot.config.healthWeights[key]}% weight</dt>
                <dd className="font-medium tabular-nums">{measure(value == null ? null : Number(value.toFixed(2)), '/100')}</dd>
              </div>
            ))}
            <div>
              <dt className="text-foreground-muted">Inspection expiry penalty</dt>
              <dd>{health.penalty} points</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Assessment confidence</dt>
              <dd>{measure(health.confidence, '%')}</dd>
            </div>
          </dl>
        </details>
      </section>
      <EvidencePanel evidence={[
        ...evidence,
        ...commercial.evidence.filter(row => !evidence.some(item => item.attribute === row.attribute)),
      ]} />
      <section className={section} aria-labelledby="tower-findings">
        <h2 id="tower-findings" className="text-xl font-semibold">Findings</h2>
        {findings.length ? (
          <ul className="mt-3 divide-y divide-border">
            {findings.map(finding => (
              <li key={finding.findingId} className="space-y-1 py-3 text-sm">
                <h3 className="font-semibold">{finding.severity} · {finding.text}</h3>
                <p>Impact: {finding.impact}</p>
                <p>Next step: {finding.nextStep}</p>
                <p className="text-foreground-muted">Source: {finding.sources.map(source => `${source.sourceSystem} (${source.asOf ?? 'observation date unknown'})`).join('; ') || 'Unavailable'}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm">No health findings for this tower.</p>}
      </section>
      <section className={section} aria-labelledby="tower-alerts">
        <h2 id="tower-alerts" className="text-xl font-semibold">Alerts</h2>
        <p className="mt-2 text-sm text-foreground-muted">Simulated · No operational request. Updating an alert does not advance its action or change the health score.</p>
        {state.lastCommandKind === 'setAlert' && state.result?.ok === false && (
          <p role="alert" className="mt-3 text-sm text-error">Alert status was not updated. Review the current alert before retrying.</p>
        )}
        {siteAlerts.length ? (
          <ul className="mt-3 divide-y divide-border">
            {siteAlerts.map(alert => (
              <AlertRow key={alert.alertId} alert={alert} finding={findings.find(item => item.findingId === alert.findingId) ?? alert.fixtureFinding} revision={ref.snapshotRevision} send={send} />
            ))}
          </ul>
        ) : <p className="mt-3 text-sm">No registered alerts for this tower.</p>}
      </section>
      <TowerProfile site={site} />
      <CommercialSnapshot commercial={commercial} title="Commercial snapshot" />
      <section className={section} aria-labelledby="tower-history">
        <h2 id="tower-history" className="text-xl font-semibold">Inspection and maintenance history</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <History title="Inspections" entries={site.histories.inspection.value} />
          <History title="Maintenance" entries={site.histories.maintenance.value} />
        </div>
      </section>
      </>}
      <AssessmentExport key={siteId} assessmentRef={ref} />
    </div>
  );
}

AssessmentPage.propTypes = { siteId: PropTypes.string, tab: PropTypes.oneOf(['overview', 'growth']) };
