/** Summarize active portfolio exposure and surface the next reviews. */
import PropTypes from 'prop-types';
import { useId } from 'react';
import { ScenarioControls } from '../components/ScenarioControls.jsx';
import { focus, TowerLink } from '../components/GlobalBar.jsx';
import { usePortfolio } from '../components/PortfolioProvider.jsx';
import { FACET_LABELS, facetOptions, HEALTH_BANDS, READINESS_BANDS } from '../utils/discover.js';
import { formatIllustrativeUsd } from '../utils/economics.js';

const primaryKeys = ['towers', 'tenants', 'average', 'revenue', 'healthy', 'critical', 'opportunities', 'alerts'];
const link = `discovery-link underline underline-offset-4 ${focus}`;
const metricNotes = {
  average: 'Active tenants per active tower',
  healthy: 'Good sites as a share of active towers',
  opportunities: 'High-opportunity cohort: Yes or Yes after an upgrade',
};
const quickFacets = { type: 'Tower type', geography: 'State', health: 'Assessment status' };
const healthTones = { Good: 'good', 'Needs Attention': 'attention', Critical: 'critical', Unknown: 'unknown' };

/** Format a metric without losing the distinction between zero and unavailable. */
function display(key, value) {
  if (value === null) return 'Unavailable';
  if (key === 'revenue') return formatIllustrativeUsd(value);
  if (key === 'average') return value.toFixed(2);
  if (key === 'healthy') return `${Number(value.toFixed(1))}%`;
  return value;
}

/** Activate the exact contributor cohort represented by a current metric. */
function SignalTile({ tile, label, share, tone }) {
  const { send } = usePortfolio();
  const key = tile.ref.key;
  const coverageId = useId();
  /** Apply the tile signal and let the existing hash router deliver the map. */
  function drill() {
    send({ kind: 'signal', ref: tile.ref });
    window.location.hash = '#/map';
  }
  if (share !== undefined) {
    return (
      <button type="button" onClick={drill} aria-label={label} title={`${tile.value} ${tile.value === 1 ? 'tower' : 'towers'} · ${Number(share.toFixed(1))}% of scope`}
        className={`group grid min-h-11 w-full grid-cols-[minmax(0,1fr)_minmax(2rem,1fr)_2rem] items-center gap-2 rounded px-1 text-left text-sm hover:bg-surface-raised ${focus}`}>
        <span className="group-hover:underline">{tile.label}</span>
        <span aria-hidden="true" className="discovery-track">
          <span data-tone={tone} style={{ width: `${share}%` }} />
        </span>
        <strong className="text-right tabular-nums">{tile.value}</strong>
      </button>
    );
  }
  return (
    <button type="button" onClick={drill} disabled={tile.siteIds === null} aria-label={label} aria-describedby={coverageId}
      className={`discovery-metric group flex h-full w-full min-w-0 flex-col items-start rounded-md border border-border bg-surface p-3 text-left disabled:cursor-not-allowed sm:p-5 ${focus}`}>
      <span className="text-sm font-semibold">{tile.label}</span>
      <strong className="discovery-number mb-2 mt-1 break-words font-semibold tracking-tight tabular-nums">{display(key, tile.value)}</strong>
      <span id={coverageId} className="mt-auto grid gap-1 text-xs text-foreground-muted">
        {metricNotes[key] && <span>{metricNotes[key]}</span>}
        {tile.coverage ? `${tile.coverage.known}/${tile.coverage.total} towers with known inputs` : `${tile.siteIds?.length ?? 0} contributing towers`}
      </span>
      {tile.siteIds !== null && <span aria-hidden="true" className="discovery-link mt-2 text-xs font-semibold group-hover:underline">View towers →</span>}
    </button>
  );
}

SignalTile.propTypes = {
  tile: PropTypes.shape({ label: PropTypes.string.isRequired, value: PropTypes.number, siteIds: PropTypes.arrayOf(PropTypes.string),
    coverage: PropTypes.shape({ known: PropTypes.number.isRequired, total: PropTypes.number.isRequired }),
    ref: PropTypes.shape({ key: PropTypes.string.isRequired }).isRequired }).isRequired,
  label: PropTypes.string.isRequired, share: PropTypes.number, tone: PropTypes.string,
};

/** Show shared search, facets, and the reset that leaves the scenario unchanged. */
export function DiscoveryCriteria() {
  const { state, send } = usePortfolio();
  const { query, filters, signal } = state.discovery;
  const active = Object.entries(filters).filter(([, values]) => values.length);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ul aria-label="Active discovery criteria" className="flex min-w-0 flex-wrap gap-2 text-sm text-foreground-muted">
        {query.trim() && <li className="discovery-criterion">Search: {query.trim()}</li>}
        {active.map(([key, values]) => <li key={key} className="discovery-criterion">{FACET_LABELS[key]}: {values.join(', ')}</li>)}
        {!query.trim() && !active.length && <li>No search or facet filters applied.</li>}
      </ul>
      <button type="button" className={`ml-auto min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-semibold enabled:hover:bg-surface-raised disabled:text-foreground-muted ${focus}`}
        disabled={!query && !active.length && !signal} onClick={() => send({ kind: 'clearDiscovery' })}>Clear search and filters</button>
    </div>
  );
}

/** Offer quick choices without discarding multiple choices made on the map until edited. */
function QuickFilters() {
  const { snapshot, state, send } = usePortfolio();
  const options = facetOptions(snapshot);
  return (
    <fieldset className="mb-4 grid min-w-0 gap-3 sm:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold">Quick filters</legend>
      {Object.entries(quickFacets).map(([key, label]) => {
        const selected = state.discovery.filters[key] ?? [];
        return (
          <label key={key} className="grid min-w-0 gap-1 text-sm text-foreground-muted">
            {label}
            <select value={selected.length > 1 ? '__multiple' : selected[0] ?? ''}
              onChange={event => send({ kind: 'setFacet', key, value: event.target.value })}
              className={`min-h-11 w-full rounded-md border border-border bg-surface px-2 text-foreground ${focus}`}>
              <option value="">Any</option>
              {selected.length > 1 && <option value="__multiple" disabled>Multiple selected</option>}
              {options[key].map(option => <option key={option}>{option}</option>)}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
}

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
          <h1 tabIndex={-1} className="discovery-title mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio scenario</h1>
          <p className="mt-2 max-w-prose text-foreground-muted">See where to protect the portfolio and where to investigate growth.</p>
        </div>
        <a href="#/map" className={`discovery-action inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-white ${focus}`}>Explore towers →</a>
      </div>
      {!snapshot ? <FixtureRecovery /> : (
        <>
          <section aria-label="Active scenario summary" className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Active portfolio</h2>
              <p className="text-sm font-medium tabular-nums text-foreground-muted">{snapshot.scenarioLabel} · {snapshot.referenceDate} (UTC)</p>
            </div>
            <div className="mb-4 rounded-md border border-border bg-surface p-3 sm:p-4">
              <QuickFilters />
              <DiscoveryCriteria />
              <p aria-live="polite" className="mt-3 border-t border-border pt-3 text-sm text-foreground-muted">
                <strong className="text-foreground">{kpis.towers.value} {kpis.towers.value === 1 ? 'active tower' : 'active towers'} in scope.</strong>{' '}
                {kpis.towers.value ? 'Metrics, distributions, and shortlists follow these criteria.' : 'Clear search and filters to broaden the scope.'}
              </p>
            </div>
            <div className="discovery-metrics">
              {primaryKeys.map(key => <SignalTile key={key} tile={kpis[key]} label={`${kpis[key].label}: ${display(key, kpis[key].value)}`} />)}
            </div>
            <div className="mt-7 grid gap-6 lg:grid-cols-2">
              {distributions.map(([group, title, bands]) => (
                <figure key={group} aria-label={title} className="min-w-0 rounded-md border border-border bg-surface p-4 sm:p-5">
                  <figcaption className="mb-2">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-xs text-foreground-muted">Tower count by {group === 'health' ? 'health status' : 'colocation decision'}. Bar lengths show share of scope.</p>
                  </figcaption>
                  <ul>
                    {bands.map(band => {
                      const tile = kpis[`${group}:${band}`];
                      return (
                        <li key={band}>
                          <SignalTile tile={tile} label={`${title}: ${band}, ${tile.value}`}
                            share={kpis.towers.value ? 100 * tile.value / kpis.towers.value : 0}
                            tone={group === 'health' ? healthTones[band] : band === 'Unknown' ? 'unknown' : undefined} />
                        </li>
                      );
                    })}
                  </ul>
                </figure>
              ))}
            </div>
          </section>
          <section aria-labelledby="shortlist-title" className="my-10 border-t border-border pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shortlist-title" className="text-xl font-semibold tracking-tight">Priority shortlists</h2>
              <a href="#/actions" className={`text-sm ${link}`}>View action queues →</a>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">Up to five in-scope towers per queue, in the shared priority order.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[...shortlists.filter(({ view }) => view === 'Critical Sites' || view === 'Growth Opportunities'),
                ...shortlists.filter(({ view }) => view !== 'Critical Sites' && view !== 'Growth Opportunities')].map(({ view, incomplete, entries }) => (
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
