/** Pair an offline tower map with a keyboard-equivalent result list. */
import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { focus, TowerLink } from '../components/GlobalBar.jsx';
import { usePortfolio } from '../components/PortfolioProvider.jsx';
import { FACET_LABELS, facetOptions, HEALTH_BANDS } from '../utils/discover.js';
import { DiscoveryCriteria, FixtureRecovery } from './PortfolioPage.jsx';

const healthSymbols = { Good: 'G', 'Needs Attention': 'A', Critical: 'C', Unknown: '?' };
const healthTones = { Good: 'good', 'Needs Attention': 'attention', Critical: 'critical', Unknown: 'unknown' };

/** Show checkboxes so alternatives can be selected with touch or keyboard. */
function Facets({ snapshot }) {
  const { state, send } = usePortfolio();
  return (
    <details className="mt-5 rounded-md border border-border bg-surface px-4">
      <summary className={`min-h-11 cursor-pointer py-3 text-sm font-semibold ${focus}`}>
        Filters · {Object.values(state.discovery.filters).flat().length} selected
      </summary>
      <div className="grid gap-x-5 gap-y-4 border-t border-border py-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(facetOptions(snapshot)).map(([key, options]) => (
          <fieldset key={key} className="min-w-0">
            <legend className="mb-1 text-sm font-semibold">{FACET_LABELS[key]}</legend>
            <div className={`flex flex-wrap gap-x-3 ${key === 'geography' ? 'max-h-36 overflow-auto px-1' : ''}`}>
              {options.map(value => (
                <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={state.discovery.filters[key]?.includes(value) ?? false}
                    className={`size-4 accent-primary-700 ${focus}`} onChange={() => send({ kind: 'facet', key, value })} />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}

Facets.propTypes = { snapshot: PropTypes.object.isRequired };

/** Render the active discovery view, preserving rows through geometry failures. */
export default function TowerMapPage() {
  const { snapshot, discovery, state, send } = usePortfolio();
  const resultsHeading = useRef(null);
  const [focused, setFocused] = useState(null);
  const [pointed, setPointed] = useState(null);
  const highlight = focused ?? pointed ?? discovery.selectedSiteId;
  /** Associate pointer and keyboard interactions across the two tower links. */
  function pair(siteId) {
    return { onFocus: () => setFocused(siteId), onBlur: () => setFocused(null),
      onPointerEnter: () => setPointed(siteId), onPointerLeave: () => setPointed(null) };
  }
  const signal = discovery.signal;
  const rowCount = discovery.siteIds?.length ?? 0;
  const markerCount = discovery.markerIds?.length ?? 0;
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-foreground-muted">Portfolio intelligence / Discovery</p>
      <h1 tabIndex={-1} className="discovery-title mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Tower Map</h1>
      <p className="mt-2 max-w-prose text-foreground-muted">Narrow the tower list with search and filters. Open the same assessment from either view.</p>
      {!discovery.ok ? <FixtureRecovery /> : (
        <>
          <Facets snapshot={snapshot} />
          <div className="my-4 grid gap-2 rounded-md border border-border bg-surface p-3 sm:p-4">
            <p className="text-sm font-semibold">{snapshot.scenarioLabel} · {snapshot.referenceDate} (UTC)</p>
            <DiscoveryCriteria />
            {signal && (
              <div className="flex flex-wrap items-center gap-x-3 border-t border-border text-sm">
                <span><strong>Signal:</strong> {signal.label} · {signal.siteIds ? `${signal.siteIds.length} contributing towers` : 'Unavailable for this scope'}</span>
                <button type="button" className={`discovery-link min-h-11 underline underline-offset-4 ${focus}`} onClick={() => send({ kind: 'signal', ref: null })}>Clear signal</button>
              </div>
            )}
          </div>
          {state.discovery.notice && <p role="status" className="mb-3 text-sm text-foreground-muted">{state.discovery.notice}</p>}
          {state.lastCommandKind === 'signal' && state.result?.ok === false && (
            <p role="alert" className="mb-3 text-sm text-error">That signal is no longer available. Return to Portfolio to choose a current signal.</p>
          )}
          <p role="status" className="mb-3 text-sm font-medium tabular-nums">
            {rowCount ? `${rowCount} matching ${rowCount === 1 ? 'tower' : 'towers'} · ${markerCount} on map` : 'No towers match your search and filters.'}
          </p>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)]">
            <section aria-labelledby="map-heading" className="min-w-0 rounded-md border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border p-4">
                <div>
                  <h2 id="map-heading" className="font-semibold">Contiguous US</h2>
                  <p className="mt-1 text-xs text-foreground-muted">Schematic locations · not for navigation</p>
                </div>
                <button type="button" className={`discovery-link inline-flex min-h-11 items-center text-sm underline lg:hidden ${focus}`}
                  onClick={() => resultsHeading.current?.focus()}>Jump to results</button>
              </div>
              {discovery.polygon ? (
                <svg viewBox="0 0 620 360" role="group" aria-label="Tower markers" className="discovery-map block w-full bg-background">
                  <polygon points={discovery.polygon} className="fill-surface-raised stroke-border" strokeWidth="1.3" />
                  {discovery.rows.filter(row => row.point).map(row => (
                    <TowerLink key={row.siteId} siteId={row.siteId} label={`${row.siteId} · ${row.health}`} {...pair(row.siteId)}
                      className={focus}>
                      <g className="discovery-marker" data-tone={healthTones[row.health]} data-highlighted={highlight === row.siteId}
                        transform={`translate(${row.point.x} ${row.point.y})`}>
                        <circle className="discovery-marker-hit" r="16" fill="transparent" />
                        <circle className="discovery-marker-dot" r="11" />
                        <text y="0.35em" textAnchor="middle" aria-hidden="true" className="pointer-events-none select-none font-semibold">
                          {healthSymbols[row.health]}
                        </text>
                      </g>
                    </TowerLink>
                  ))}
                </svg>
              ) : <p className="p-4 text-sm">Map unavailable. Use the tower list to open an assessment.</p>}
              {discovery.polygon && (
                <ul aria-label="Health legend" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border p-4 text-xs text-foreground-muted">
                  {HEALTH_BANDS.map(band => (
                    <li key={band} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" data-tone={healthTones[band]} className="discovery-badge grid size-5 place-items-center rounded-full font-semibold">{healthSymbols[band]}</span>
                      {band}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="list-heading" className="min-w-0 rounded-md border border-border bg-surface">
              <h2 ref={resultsHeading} id="list-heading" tabIndex={-1} className="border-b border-border px-4 py-3 font-semibold">Tower results</h2>
              {rowCount > 0 ? (
                <ul aria-label="Matching towers" className="divide-y divide-border">
                  {discovery.rows.map(row => (
                    <li key={row.siteId} className="discovery-result p-4" data-highlighted={highlight === row.siteId}
                      onPointerEnter={() => setPointed(row.siteId)} onPointerLeave={() => setPointed(null)}>
                      <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <TowerLink siteId={row.siteId} onFocus={() => setFocused(row.siteId)} onBlur={() => setFocused(null)}
                          className={`discovery-link inline-flex min-h-11 items-center font-mono text-sm font-semibold underline underline-offset-4 ${focus}`}>{row.siteId}</TowerLink>
                        <span data-tone={healthTones[row.health]} className="discovery-badge rounded px-2 py-0.5 text-xs font-medium">{row.health}</span>
                      </div>
                      <p className="mt-1 text-sm text-foreground-muted">{row.city}, {row.state} · {row.market}</p>
                      <p className="mt-1 text-xs tabular-nums text-foreground-muted">Active tenants: {row.activeTenants ?? 'Unknown'} · Utilization: {row.utilization}</p>
                      <p className="mt-2 text-sm"><strong>Next:</strong> {row.nextStep}</p>
                      {!row.point && <p className="mt-1 text-xs text-foreground-muted">Map unavailable for this tower.</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="p-4 text-sm text-foreground-muted">Clear search and filters to see more towers.</p>}
            </section>
          </div>
        </>
      )}
    </>
  );
}
