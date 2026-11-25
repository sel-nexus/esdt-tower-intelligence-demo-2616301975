/** Provide workshop controls without exposing uncommitted drafts to decisions. */
import { useEffect, useId, useState } from 'react';
import { readAttribute } from '../utils/fixtures.js';
import { MASK_ATTRIBUTES, maskKey } from '../utils/scenario.js';
import { usePortfolio } from './PortfolioProvider.jsx';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const field = `mt-2 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm ${focus}`;
const button = `min-h-11 rounded-md px-4 text-sm font-semibold ${focus}`;
const defaultSiteId = 'NYC-10234';
const defaultEvidencePath = 'power.headroomKw';
const errors = {
  INVALID_SETTINGS: 'Enter a finite, non-negative tolerance in kW. The effective tolerance is unchanged.',
  INVALID_MASK: 'Choose a supported evidence field.',
  INVALID_SCENARIO: 'Choose a scenario from the list.',
  SITE_NOT_FOUND: 'Choose a tower from the current scenario.',
  STALE_VIEW: 'Settings changed. Review the effective value before applying again.',
};

/** Render the current scenario, its reversible masks, and the staged tolerance. */
export function ScenarioControls() {
  const { state, snapshot, send } = usePortfolio();
  const id = useId();
  const [siteId, setSiteId] = useState(defaultSiteId);
  const [path, setPath] = useState(defaultEvidencePath);
  const effective = snapshot?.config.powerToleranceKw;
  const [draft, setDraft] = useState(String(effective ?? ''));
  const errorCode = state.result?.ok === false ? state.result.code : null;
  const resetCommandId = state.lastCommandKind === 'reset' && state.result?.ok ? state.lastCommandId : null;

  useEffect(() => { setDraft(String(effective ?? '')); }, [effective]);

  // Observe both reset buttons, including repeated resets with an unchanged snapshot.
  useEffect(() => {
    if (resetCommandId === null) return;
    setDraft(String(effective ?? ''));
    setSiteId(defaultSiteId);
    setPath(defaultEvidencePath);
  }, [effective, resetCommandId]);

  /** Submit a finite numeric draft or let the reducer reject the transaction. */
  function apply(event) {
    event.preventDefault();
    send({ kind: 'settings', patch: { powerToleranceKw: draft.trim() ? Number(draft) : NaN }, settingsVersion: snapshot.settingsVersion });
  }

  if (!snapshot) return null;
  const selectedSite = snapshot.sitesById.get(siteId) ?? snapshot.sitesById.values().next().value;
  const attr = readAttribute(selectedSite, path);
  const masked = selectedSite ? state.controls.masks.has(maskKey(selectedSite.siteId, path)) : false;
  const example = snapshot.config.governance.example;
  const settingsError = errorCode === 'INVALID_SETTINGS' || errorCode === 'STALE_VIEW';
  const effectiveLabel = attr?.value == null ? 'Unknown' : typeof attr.value === 'object'
    ? `${attr.value.length} record${attr.value.length === 1 ? '' : 's'}` : String(attr.value);

  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 rounded-lg border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">Facilitator controls</h2>
          <p className="mt-1 text-sm text-foreground-muted">Changes stay in this tab and do not alter the fixture.</p>
        </div>
        <button type="button" onClick={() => send({ kind: 'reset' })} className={`${button} border border-border hover:bg-surface-raised`}>Reset baseline</button>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <label htmlFor={`${id}-scenario`} className="text-sm font-semibold">Scenario</label>
          <select id={`${id}-scenario`} value={snapshot.scenarioId} className={field} onChange={event => send({ kind: 'switch', scenarioId: event.target.value })}>
            {state.base.scenarios.map(item => <option key={item.scenarioId} value={item.scenarioId}>{item.label}</option>)}
          </select>
          <p className="mt-2 text-sm text-foreground-muted">{snapshot.scenarioNotice}</p>
        </div>
        <form onSubmit={apply} noValidate>
          <label htmlFor={`${id}-tolerance`} className="text-sm font-semibold">Proposed power tolerance (kW)</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input id={`${id}-tolerance`} type="number" inputMode="decimal" min="0" step="any" required value={draft}
              aria-invalid={settingsError || undefined} aria-describedby={settingsError ? `${id}-error` : `${id}-effective`}
              onChange={event => setDraft(event.target.value)}
              className={`min-h-11 w-28 rounded-md border border-border px-3 text-sm tabular-nums ${focus}`} />
            <button type="submit" className={`${button} bg-primary-600 text-white hover:bg-primary-700`}>Apply settings</button>
          </div>
          <p id={`${id}-effective`} className="mt-2 text-sm text-foreground-muted">Effective tolerance: {effective} kW</p>
        </form>
      </div>
      <fieldset className="mt-7 min-w-0 border-t border-border pt-4">
        <legend className="pr-3 text-sm font-semibold">Simulate missing evidence</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${id}-site`} className="text-sm">Tower</label>
            <select id={`${id}-site`} className={field} value={selectedSite?.siteId ?? ''} disabled={!selectedSite} onChange={event => setSiteId(event.target.value)}>
              {[...snapshot.sitesById.values()].map(site => <option key={site.siteId} value={site.siteId}>{site.siteId} — {site.name}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-evidence`} className="text-sm">Evidence field</label>
            <select id={`${id}-evidence`} className={field} value={path} onChange={event => setPath(event.target.value)}>
              {Object.entries(MASK_ATTRIBUTES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <button type="button" disabled={!masked && attr?.value == null} className={`${button} border border-border hover:bg-surface-raised disabled:opacity-60`}
            onClick={() => send({ kind: 'mask', siteId: selectedSite.siteId, attribute: path, enabled: !masked })}>
            {masked ? 'Restore evidence' : 'Mask evidence'}
          </button>
          <p className="text-foreground-muted">Effective input: {effectiveLabel}{masked ? ' (simulated missing)' : ''}</p>
        </div>
      </fieldset>
      {errorCode && <p role="alert" id={`${id}-error`} className="mt-4 text-sm text-error">{errors[errorCode] ?? 'The control change could not be applied.'}</p>}
      <p role="status" className="mt-4 text-sm text-foreground-muted tabular-nums">
        Snapshot revision {snapshot.snapshotRevision} · Settings version {snapshot.settingsVersion}
        {state.result?.code === 'NO_CHANGE' ? ' · No effective change.' : ''}
      </p>
      <details className="mt-4 border-t border-border pt-3 text-sm">
        <summary className={`w-fit cursor-pointer py-1 font-medium ${focus}`}>Provisional rule settings</summary>
        <p className="mt-2 max-w-prose text-foreground-muted">Compare {example.comparisonKw} kW and {example.defaultKw} kW with a synthetic {example.shortfallKw} kW shortfall. Product signoff is pending; this is not engineering policy or release approval.</p>
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-foreground-muted">
          <dt>Inspection validity</dt><dd>{snapshot.config.inspectionValidityDays} days</dd>
          <dt>Inspection due window</dt><dd>{snapshot.config.inspectionDueWindowDays} days</dd>
          <dt>Minimum evidence confidence</dt><dd>{snapshot.config.minConfidence}/100</dd>
          <dt>Health band cutoffs</dt><dd>{snapshot.config.healthBands.good} / {snapshot.config.healthBands.attention}</dd>
          <dt>Readiness band cutoffs</dt><dd>{Object.values(snapshot.config.readinessBands).join(' / ')}</dd>
        </dl>
      </details>
    </section>
  );
}
