// @vitest-environment jsdom
/** Check fixture arithmetic, transaction boundaries and accessible controls. */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.jsx';
import { PortfolioProvider, usePortfolio } from '../src/components/PortfolioProvider.jsx';
import { loadBaseline, readAttribute, validateBundle } from '../src/utils/fixtures.js';
import { createPortfolioState, reduce } from '../src/utils/portfolioReducer.js';
import { buildSnapshot, createBaselineControls, summarizeBaseline } from '../src/utils/scenario.js';

const fixture = loadBaseline();
const nyc = 'NYC-10234';
const path = 'power.headroomKw';
const day = 86_400_000;
afterEach(() => { cleanup(); window.localStorage.removeItem('esdt.demo.session.v1'); });

/** Issue consecutive tab-local control intents for reducer tests. */
const control = (state, args) => reduce(state, { ...args, commandId: state.lastCommandId + 1 });

/** Independently calculate the proposed arithmetic as fixture proof only. */
function healthProof(snapshot, site) {
  const config = snapshot.config;
  const paths = ['structure.status', 'condition.equipment', 'condition.corrosion', 'power.resilience', 'condition.battery', 'condition.generator', 'histories.maintenance', 'histories.inspection'];
  const attrs = paths.map(field => readAttribute(site, field));
  const date = Date.parse(snapshot.referenceDate);
  const usable = attrs.filter(attr => {
    const record = snapshot.evidenceById.get(attr.evidenceId);
    const age = (date - Date.parse(record.asOf)) / day;
    return attr.value !== null && record.completeness === 'complete' && age >= 0 && age <= config.staleDays && record.confidence >= config.minConfidence;
  }).length;
  const [status, equipment, corrosion, resilience, battery, generator, maintenance, inspection] = attrs.map(attr => attr.value);
  const latest = history => [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
  const values = config.conditionScores;
  const contributions = {
    structure: { pass: 100, warning: 75, failed: 40 }[status],
    equipment: (values[equipment] + { none: 100, minor: 75, severe: 40 }[corrosion]) / 2,
    power: (values[resilience] + values[battery] + values[generator]) / 3,
    maintenance: values[latest(maintenance).condition],
    dataQuality: Math.round(100 * usable / attrs.length),
  };
  const weighted = Object.entries(contributions).reduce((sum, [name, score]) => sum + score * config.healthWeights[name], 0) / 100;
  return Math.round(weighted - (date > Date.parse(latest(inspection).date) + day * config.inspectionValidityDays ? config.expiredHealthPenalty : 0));
}

describe('synthetic fixture', () => {
  it('validates and derives active towers, active leases and annual USD cents', () => {
    expect(fixture.ok, fixture.detail).toBe(true);
    const { snapshot } = createPortfolioState(fixture);
    expect(summarizeBaseline(snapshot)).toEqual({ sites: 25, tenants: 62, revenueCents: 189_000_000 });
    expect([...snapshot.sitesById.values()].some(site => site.tenants.value.some(tenant => tenant.leaseStatus === 'pending'))).toBe(true);
    expect(() => snapshot.sitesById.clear()).toThrow(/read-only/);
    expect(Object.isFrozen(snapshot.sitesById.get(nyc).power.headroomKw)).toBe(true);
  });

  it('derives all six named anchors and the 12/12/1 split from inputs, not stored scores', () => {
    const { snapshot } = createPortfolioState(fixture);
    const scores = Object.fromEntries([...snapshot.sitesById].map(([id, site]) => [id, healthProof(snapshot, site)]));
    expect(scores).toMatchObject({ [nyc]: 86, 'DAL-20451': 92, 'ATL-30492': 83, 'CHI-40117': 53, 'SEA-50983': 78, 'LAX-60214': 64 });
    const bands = Object.values(scores).reduce((counts, score) => {
      counts[score >= snapshot.config.healthBands.good ? 0 : score >= snapshot.config.healthBands.attention ? 1 : 2]++;
      return counts;
    }, [0, 0, 0]);
    expect(bands).toEqual([12, 12, 1]);
    const site = snapshot.sitesById.get(nyc);
    expect(site.power.requiredKw.value - site.power.headroomKw.value).toBe(4);
    const example = snapshot.config.governance.example;
    expect(example).toEqual({ shortfallKw: 4, comparisonKw: 3, defaultKw: 5, status: 'provisional' });
    expect(example.comparisonKw).toBeLessThan(example.shortfallKw);
    expect(example.defaultKw).toBeGreaterThan(example.shortfallKw);
  });

  it.each([
    ['unknown attribute evidence', raw => { raw.sites[0].power.headroomKw.evidenceId = 'orphan'; }],
    ['unknown history evidence', raw => { raw.sites[0].histories.inspection.value[0].evidenceId = 'orphan'; }],
    ['unknown future fit evidence', raw => { raw.sites[0].upgrades.value[0].futureFitEvidenceId = 'orphan'; }],
    ['duplicate evidence ID', raw => { raw.evidence.push(raw.evidence[0]); }],
    ['invalid calendar day', raw => { raw.evidence[0].asOf = '2025-02-30'; }],
    ['negative load', raw => { raw.sites[0].power.loadKw.value = -2; }],
    ['non-allowlisted patch path', raw => { raw.scenarios[1].patches[0].path = 'power.unknown'; }],
    ['non-100 weights', raw => { raw.config.healthWeights.power++; }],
    ['equal cutoffs', raw => { raw.config.healthBands.attention = raw.config.healthBands.good; }],
    ['alert linked to the wrong site', raw => { raw.alerts[0].siteId = nyc; }],
  ])('rejects %s without publishing a snapshot', (_, corrupt) => {
    const raw = structuredClone(fixture.value);
    corrupt(raw);
    const result = validateBundle(raw);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_FIXTURE' });
    expect(createPortfolioState(result)).toMatchObject({ snapshot: null, base: null });
  });
});

describe('scenario transactions', () => {
  it('overlays, masks and restores against the active scenario without modifying baseline', () => {
    const original = createPortfolioState(fixture);
    const altered = control(original, { kind: 'switch', scenarioId: 'energy-pressure' });
    expect(altered.snapshot).toMatchObject({ snapshotRevision: 2, settingsVersion: 1, referenceDate: '2025-03-15' });
    expect(altered.snapshot.sitesById.get(nyc).power.headroomKw.value).toBe(2);
    const mask = { kind: 'mask', siteId: nyc, attribute: path };
    const masked = control(altered, { ...mask, enabled: true });
    expect(masked.snapshot.sitesById.get(nyc).power.headroomKw).toEqual({ value: null, evidenceId: 'NYC-10234:power', missingReason: 'simulated-missing' });
    const switched = control(masked, { kind: 'switch', scenarioId: 'baseline' });
    expect(switched.snapshot.sitesById.get(nyc).power.headroomKw.value).toBeNull();
    expect(control(switched, { ...mask, enabled: false }).snapshot.sitesById.get(nyc).power.headroomKw.value).toBe(4);
    expect(control(masked, { ...mask, enabled: false }).snapshot.sitesById.get(nyc).power.headroomKw.value).toBe(2);
    expect(fixture.value.sites[0].power.headroomKw.value).toBe(4);
    expect(masked.snapshot.sitesById.get('DAL-20451')).toBe(original.snapshot.sitesById.get('DAL-20451'));
  });

  it.each([
    { kind: 'settings', patch: { powerToleranceKw: -1 } },
    { kind: 'settings', patch: { powerToleranceKw: Infinity } },
    { kind: 'settings', patch: { powerToleranceKw: '3' } },
    { kind: 'settings', patch: { healthWeights: {} } },
    { kind: 'settings', patch: { powerToleranceKw: 3 }, settingsVersion: 99 },
    { kind: 'switch', scenarioId: 'unlisted' },
    { kind: 'mask', siteId: nyc, attribute: 'name', enabled: true },
    { kind: 'mask', siteId: 'MISSING', attribute: path, enabled: true },
  ])('rejects invalid intent $kind and retains the same decision snapshot', command => {
    const state = createPortfolioState(fixture);
    const next = control(state, command);
    expect(next.result.ok).toBe(false);
    expect(next.snapshot).toBe(state.snapshot);
    expect(next.controls).toBe(state.controls);
  });

  it('leaves settings and snapshot versions unchanged for duplicate or stale intent', () => {
    const initial = createPortfolioState(fixture);
    const settings = { kind: 'settings', patch: { powerToleranceKw: 3 } };
    const edited = control(initial, settings);
    expect(edited.snapshot).toMatchObject({ snapshotRevision: 2, settingsVersion: 2, config: { powerToleranceKw: 3 } });
    const duplicate = control(edited, settings);
    expect(duplicate.result).toEqual({ ok: true, code: 'NO_CHANGE', snapshotRevision: 2, settingsVersion: 2 });
    expect(duplicate.snapshot).toBe(edited.snapshot);
    expect(reduce(duplicate, { kind: 'reset', commandId: edited.lastCommandId })).toBe(duplicate);
    expect(control(duplicate, { kind: 'switch', scenarioId: 'baseline' }).snapshot).toBe(edited.snapshot);
    expect(buildSnapshot(fixture.value, { ...createBaselineControls(), masks: new Set(['NYC-10234:unknown']) })).toEqual({ ok: false, code: 'INVALID_MASK' });
  });

  it('resets controls, workflow and discovery, then treats a second reset as a no-op', () => {
    const initial = createPortfolioState(fixture);
    const setting = control(initial, { kind: 'settings', patch: { powerToleranceKw: 3 } });
    const switched = control(setting, { kind: 'switch', scenarioId: 'energy-pressure' });
    const masked = control(switched, { kind: 'mask', siteId: nyc, attribute: path, enabled: true });
    const dirty = { ...masked, discovery: { query: 'nyc', filters: { health: ['Good'] }, signal: {}, selectedSiteId: nyc }, workflow: { alerts: { baseline: { a: 'Closed' } }, actions: {}, categories: {} } };
    const reset = control(dirty, { kind: 'reset' });
    expect(reset.controls).toEqual(createBaselineControls());
    expect(reset.discovery).toEqual(initial.discovery);
    expect(reset.workflow).toEqual(initial.workflow);
    expect(reset.snapshot).toMatchObject({ scenarioId: 'baseline', config: { powerToleranceKw: 5 }, snapshotRevision: 5, settingsVersion: 3 });
    expect(reset.snapshot.sitesById.get(nyc)).toBe(initial.snapshot.sitesById.get(nyc));
    expect(control(reset, { kind: 'reset' }).result.code).toBe('NO_CHANGE');
  });
});

describe('facilitator controls', () => {
  it('stages draft edits, announces invalid input, and resets the effective tolerance', async () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    const user = userEvent.setup();
    render(createElement(App));
    const tolerance = screen.getByRole('spinbutton', { name: /proposed power tolerance/i });
    const apply = screen.getByRole('button', { name: 'Apply settings' });
    await user.clear(tolerance);
    await user.type(tolerance, '-1');
    expect(screen.getByText('Effective tolerance: 5 kW')).toBeVisible();
    await user.click(apply);
    expect(screen.getByRole('alert')).toHaveTextContent(/effective tolerance is unchanged/);
    expect(tolerance).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Snapshot revision 1 · Settings version 1');
    await user.clear(tolerance);
    await user.type(tolerance, '3');
    await user.click(apply);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Effective tolerance: 3 kW')).toBeVisible();
    await user.click(apply);
    expect(screen.getByRole('status')).toHaveTextContent('Snapshot revision 2 · Settings version 2 · No effective change.');
    await user.click(screen.getByRole('button', { name: 'Reset baseline' }));
    expect(tolerance).toHaveValue(5);
  });

  it('shows the fixture failure instead of publishing partial data', () => {
    function Probe() {
      const { state, snapshot } = usePortfolio();
      return createElement('p', null, snapshot ? 'Published' : state.fixtureError);
    }
    render(createElement(PortfolioProvider, { fixtureResult: { ok: false, detail: 'Fixture invalid' } }, createElement(Probe)));
    expect(screen.getByText('Fixture invalid')).toBeVisible();
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
  });
});
