/** Summarize active portfolio exposure and surface the next reviews. */
import PropTypes from 'prop-types';
import { useId } from 'react';
import { ScenarioControls } from '../components/ScenarioControls.jsx';
import { focus, TowerLink } from '../components/GlobalBar.jsx';
import { usePortfolio } from '../components/PortfolioProvider.jsx';
import { HEALTH_BANDS, READINESS_BANDS } from '../utils/discover.js';
import { formatIllustrativeUsd } from '../utils/economics.js';

const primaryKeys = ['towers', 'tenants', 'average', 'revenue', 'healthy', 'critical', 'opportunities', 'alerts'];
const link = `text-primary-700 underline underline-offset-4 ${focus}`;

/** Format a metric without losing the distinction between zero and unavailable. */
function display(key, value) {
  if (value === null) return 'Unknown';
  if (key === 'revenue') return formatIllustrativeUsd(value);
  if (key === 'average') return value.toFixed(2);
  if (key === 'healthy') return `${Number(value.toFixed(1))}%`;
  return value;
}

/** Activate the exact contributor cohort represented by a current metric. */
function SignalTile({ tile, compact = false, label }) {
  const { send } = usePortfolio();
  const key = tile.ref.key;
  const coverageId = useId();
  /** Apply the tile signal and let the existing hash router deliver the map. */
  function drill() {
    send({ kind: 'signal', ref: tile.ref });
    window.location.hash = '#/map';
  }
  return (
    <button type="button" onClick={drill} disabled={tile.siteIds === null} aria-label={label} aria-describedby={coverageId}
      className={`group flex h-full w-full flex-col items-start rounded-md border border-border bg-surface text-left enabled:hover:border-primary-500 disabled:cursor-not-allowed ${compact ? 'p-3' : 'p-4 sm:p-5'} ${focus}`}>
      <span className="text-sm font-medium text-foreground-muted">{tile.label}</span>
      <strong className={`my-1 font-semibold tracking-tight tabular-nums ${compact ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>{display(key, tile.value)}</strong>
      <span id={coverageId} className="mt-auto text-xs text-foreground-muted">
        {tile.coverage ? `${tile.coverage.known}/${tile.coverage.total} towers with known inputs` : `${tile.siteIds?.length ?? 0} contributing towers`}
      </span>
      {tile.siteIds !== null && <span aria-hidden="true" className="mt-2 text-xs font-semibold text-primary-700 group-hover:underline">View towers →</span>}
    </button>
  );
}

SignalTile.propTypes = {
  tile: PropTypes.shape({ label: PropTypes.string.isRequired, value: PropTypes.number, siteIds: PropTypes.arrayOf(PropTypes.string),
    coverage: PropTypes.shape({ known: PropTypes.number.isRequired, total: PropTypes.number.isRequired }),
    ref: PropTypes.shape({ key: PropTypes.string.isRequired }).isRequired }).isRequired,
  compact: PropTypes.bool, label: PropTypes.string.isRequired,
};

/** Explain a rejected fixture without offering partial portfolio results. */
export function FixtureRecovery() {
  return (
    <div role="alert" className="mt-6 max-w-prose rounded-md border border-border bg-surface p-5">
      <h2 className="font-semibold">Synthetic fixture unavailable</h2>
      <p className="mt-2 text-sm text-foreground-muted">No portfolio results were published. Reset workshop to reload the fixture, or visit Help.</p>
      <button type="button" onClick={() => window.location.reload()} className={`mt-4 min-h-11 rounded-md border border-border px-4 text-sm font-semibold ${focus}`}>Reload fixture</button>
    </div>
  );
}

/** Render active-only KPIs and the ranked shortlists before the facilitator controls. */
export default function PortfolioPage() {
  const { snapshot, kpis, shortlists, assessments } = usePortfolio();
  const distributions = [['health', 'Health distribution', HEALTH_BANDS], ['readiness', 'Readiness distribution', READINESS_BANDS]];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-foreground-muted">Portfolio intelligence / Overview</p>
          <h1 tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio scenario</h1>
          <p className="mt-2 max-w-prose text-foreground-muted">See where to protect the portfolio and where to investigate growth.</p>
        </div>
        <a href="#/map" className={`inline-flex min-h-11 items-center rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 ${focus}`}>Explore towers →</a>
      </div>
      {!snapshot ? <FixtureRecovery /> : (
        <>
          <section aria-label="Active scenario summary" className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Active portfolio</h2>
              <p className="text-sm font-medium tabular-nums text-foreground-muted">{snapshot.scenarioLabel} · {snapshot.referenceDate} (UTC)</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {primaryKeys.map(key => <SignalTile key={key} tile={kpis[key]} label={`${kpis[key].label}: ${display(key, kpis[key].value)}`} />)}
            </div>
            <div className="mt-7 grid gap-6 lg:grid-cols-2">
              {distributions.map(([group, title, bands]) => (
                <div key={group}>
                  <h3 className="mb-2 text-sm font-semibold">{title}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    {bands.map(band => <SignalTile key={band} compact tile={kpis[`${group}:${band}`]} label={`${title}: ${band}, ${kpis[`${group}:${band}`].value}`} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section aria-labelledby="shortlist-title" className="my-10 border-t border-border pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shortlist-title" className="text-xl font-semibold tracking-tight">Priority shortlists</h2>
              <a href="#/actions" className={`text-sm ${link}`}>View action queues →</a>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">Up to five active towers per queue, in the shared priority order.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {shortlists.map(({ view, incomplete, entries }) => (
                <section key={view} aria-label={`${view} shortlist`} className="min-w-0 rounded-md border border-border bg-surface p-4 sm:p-5">
                  <h3 className="font-semibold">{view}</h3>
                  {incomplete && <p className="mt-1 text-sm text-foreground-muted">Shortlist incomplete: some towers lack evidence for eligibility or rank.</p>}
                  {!entries.length ? <p className="mt-3 text-sm text-foreground-muted">No eligible ranked towers.</p> : (
                    <ol className="mt-2 divide-y divide-border">
                      {entries.map((row, rank) => (
                        <li key={row.siteId} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 py-3">
                          <span aria-hidden="true" className="pt-1 font-mono text-xs text-foreground-muted">{String(rank + 1).padStart(2, '0')}</span>
                          <div>
                            <TowerLink siteId={row.siteId} className={`inline-flex min-h-8 items-center font-mono text-sm font-semibold ${link}`}>{row.siteId}</TowerLink>
                            <p className="text-xs font-medium text-foreground-muted">{snapshot.sitesById.get(row.siteId).market} · {assessments.get(row.siteId).health.band} · {row.status}</p>
                            <p className="mt-1 text-sm leading-relaxed">{row.nextStep}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          </section>
          <ScenarioControls />
        </>
      )}
      <p className="mt-6 text-sm text-foreground-muted">Provisional demo defaults · Product signoff pending · Indicative assessment only</p>
    </>
  );
}
