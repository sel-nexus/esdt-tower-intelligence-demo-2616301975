// @vitest-environment jsdom
/** Verify discovery projections and their keyboard-facing workshop controls. */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.jsx';
import { GlobalBar } from '../src/components/GlobalBar.jsx';
import { PortfolioProvider } from '../src/components/PortfolioProvider.jsx';
import TowerMapPage from '../src/pages/TowerMapPage.jsx';
import { loadBaseline } from '../src/utils/fixtures.js';
import { createPortfolioState, reduce } from '../src/utils/portfolioReducer.js';
import { rankActions, selectQueue } from '../src/utils/actions.js';
import { listAlerts } from '../src/utils/alerts.js';
import { formatUtilization, reduceDiscovery, selectDiscovery, selectKpis, selectShortlists } from '../src/utils/discover.js';

const nyc = 'NYC-10234';
const chi = 'CHI-40117';
const baseline = createPortfolioState(loadBaseline());
const { snapshot, assessments } = baseline;
const alerts = listAlerts(snapshot);
const actions = rankActions(snapshot, assessments);
const kpis = selectKpis(snapshot, assessments, alerts);

/** Apply the same ordered discovery adapter used by the provider. */
const command = (state, intent) => reduceDiscovery(reduce, state, { ...intent, commandId: state.lastCommandId + 1, timestamp: '2025-03-01T00:00:00Z' });

/** Query the real baseline with only the intent fields relevant to the case. */
const view = (intent = {}, geometry) => selectDiscovery(snapshot, assessments, { ...baseline.discovery, ...intent }, actions, kpis, geometry);

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('portfolio membership and ranking', () => {
  it('publishes baseline values and uses the same contributors for every drill-in', () => {
    expect(kpis.towers.value).toBe(25);
    expect(kpis.tenants.value).toBe(62);
    expect(kpis.revenue.value).toBe(189000000);
    expect(kpis.average.value).toBe(2.48);
    expect(kpis.healthy.value).toBe(48);
    expect(kpis['health:Good'].value).toBe(12);
    expect(kpis['health:Needs Attention'].value).toBe(12);
    expect(kpis.critical.siteIds).toEqual([chi]);
    expect(kpis.opportunities.siteIds).toContain(nyc);
    for (const tile of Object.values(kpis)) {
      expect(view({ signal: tile.ref }).siteIds).toEqual([...tile.siteIds].sort());
    }
    expect(view({ signal: kpis['health:Unknown'].ref }).siteIds).toEqual([]);
  });

  it('counts open records separately from sites and excludes inactive contributors and unknown additive inputs', () => {
    const narrowed = { ...snapshot, sitesById: new Map([...snapshot.sitesById].map(([id, site]) => [id,
      id === chi ? { ...site, lifecycleStatus: 'inactive' } : site])) };
    const incomplete = new Map(assessments);
    incomplete.set(nyc, { ...assessments.get(nyc), commercial: { ...assessments.get(nyc).commercial, activeTenants: null, revenue: null } });
    const tiles = selectKpis(narrowed, incomplete, [
      { siteId: nyc, status: 'Open' }, { siteId: nyc, status: 'Open' }, { siteId: nyc, status: 'Closed' }, { siteId: chi, status: 'Open' },
    ]);
    expect(tiles.towers.value).toBe(24);
    expect(tiles.alerts).toMatchObject({ value: 2, siteIds: [nyc] });
    for (const key of ['tenants', 'average', 'revenue']) {
      expect(tiles[key]).toMatchObject({ value: null, siteIds: null, coverage: { known: 23, total: 24 } });
    }
  });

  it('re-resolves a drill-in after an alert change without replacing the snapshot or assessments', () => {
    const active = command(baseline, { kind: 'signal', ref: kpis.alerts.ref });
    const open = alerts.find(alert => alert.status === 'Open' && alerts.filter(row => row.status === 'Open' && row.siteId === alert.siteId).length === 1);
    const updated = command(active, { kind: 'setAlert', alertId: open.alertId, to: 'Acknowledged' });
    const tiles = selectKpis(snapshot, assessments, listAlerts(snapshot, updated.workflow.alerts));
    expect(updated.snapshot).toBe(snapshot);
    expect(updated.assessments).toBe(assessments);
    expect(tiles.alerts.value).toBe(kpis.alerts.value - 1);
    expect(selectDiscovery(snapshot, assessments, updated.discovery, actions, tiles).siteIds).not.toContain(open.siteId);
  });

  it('uses the five shared queues, keeps stable ties and excludes unranked or duplicate sites', () => {
    const shortlists = selectShortlists(snapshot, assessments, actions);
    expect(shortlists.map(list => list.view)).toEqual(['Critical Sites', 'Inspection Due', 'High Operating Cost', 'Growth Opportunities', 'Upgrade Required']);
    expect(shortlists[0].entries.map(row => row.siteId)).toEqual([chi]);
    expect(shortlists[1].entries).toEqual(selectQueue(actions, 'Inspection Due').slice(0, 5));
    const eligible = ['DAL-20451', 'ATL-30492', nyc, 'ABQ-71137', 'BNA-70618', 'BOS-70101', 'CLE-71928'];
    const mockRanks = eligible.map((siteId, i) => ({ siteId, actionId: `${siteId}:add-tenant`, priority: i === 6 ? null : 42, kind: 'add-tenant' }));
    mockRanks.push({ siteId: nyc, actionId: `${nyc}:power-upgrade`, priority: 45, kind: 'power-upgrade' });
    const growth = selectShortlists(snapshot, assessments, mockRanks)[3];
    expect(growth.entries.map(row => row.siteId)).toEqual([nyc, 'ABQ-71137', 'ATL-30492', 'BNA-70618', 'BOS-70101']);
    expect(growth.incomplete).toBe(true);
  });
});

describe('map and list sharing', () => {
  it.each([
    ['health', 'Good'], ['type', snapshot.sitesById.get(nyc).type], ['geography', 'NY'], ['tenants', '2–3'],
    ['inspection', assessments.get(nyc).inspection.due ? 'Due' : 'Not due'],
    ['readiness', 'Yes after an upgrade'], ['cost', 'Within thresholds'],
  ])('keeps row and marker identities aligned for %s', (dimension, value) => {
    const match = view({ filters: { [dimension]: [value] } });
    expect(match.siteIds).not.toHaveLength(0);
    expect(match.siteIds.length).toBeLessThan(25);
    expect(match.markerIds).toEqual(match.siteIds);
  });

  it('uses union within facets and intersection between facets, query and the signal', () => {
    const geography = { geography: ['NY', 'IL'] };
    expect(view({ filters: geography }).siteIds).toEqual([chi, nyc]);
    expect(view({ query: '  NeW YoRk ', filters: { ...geography, health: ['Critical', 'Good'] }, signal: kpis.healthy.ref }).siteIds).toEqual([nyc]);
    expect(view({ query: ' New York Metro ' }).siteIds).toEqual([]);
    expect(view({ filters: { geography: ['NY'], health: ['Critical'] }, selectedSiteId: nyc }).selectedSiteId).toBeNull();
    expect(view({ query: '    ' }).searchIds).toEqual([]);
  });

  it('keeps unplottable rows, rejects malformed outlines and never invents utilization', () => {
    const missingPoint = { ...snapshot, sitesById: new Map(snapshot.sitesById) };
    missingPoint.sitesById.set(nyc, { ...snapshot.sitesById.get(nyc), latitude: { value: null } });
    const isolated = selectDiscovery(missingPoint, assessments, { query: nyc }, actions, kpis);
    expect(isolated.siteIds).toEqual([nyc]);
    expect(isolated.markerIds).toEqual([]);
    const corrupt = view({ query: nyc }, { version: 1, bounds: [-127, 23, -65, 51], ring: [[0, 0], null, null, [0, 0]] });
    expect(corrupt).toMatchObject({ siteIds: [nyc], markerIds: [], polygon: null });
    expect(formatUtilization({ occupiedMounts: 3, totalMounts: 4 })).toBe('3/4 (75%)');
    for (const totalMounts of [0, null, -1, 2, NaN]) expect(formatUtilization({ occupiedMounts: 3, totalMounts })).toBe('Unknown');
  });

  it('retains facets and query across changes, rejects stale signals and resets both', () => {
    let state = command(baseline, { kind: 'query', query: '  chi ' });
    state = command(state, { kind: 'facet', key: 'health', value: 'Critical' });
    state = command(state, { kind: 'selectTower', siteId: chi });
    state = command(state, { kind: 'signal', ref: kpis.critical.ref });
    expect(state.discovery.selectedSiteId).toBe(chi);
    state = command(state, { kind: 'switch', scenarioId: 'energy-pressure' });
    expect(state.discovery).toMatchObject({ query: '  chi ', filters: { health: ['Critical'] }, signal: null });
    expect(state.discovery.notice).toMatch(/portfolio changed/i);
    expect(command(state, { kind: 'signal', ref: kpis.critical.ref }).result.code).toBe('STALE_VIEW');
    expect(command(state, { kind: 'facet', key: 'not-a-facet', value: 'Critical' }).result.code).toBe('INVALID_FILTER');
    expect(command(state, { kind: 'reset' }).discovery).toEqual(baseline.discovery);
  });
});

describe('discovery controls', () => {
  it('drills into Critical and gives marker and keyboard list the same destination', async () => {
    const user = userEvent.setup();
    render(createElement(App));
    await user.click(screen.getByRole('button', { name: 'Critical sites: 1' }));
    expect(await screen.findByRole('heading', { name: 'Tower Map' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Tower Map' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('1 matching tower · 1 on map')).toBeVisible();
    const row = within(screen.getByRole('list', { name: 'Matching towers' })).getByRole('link', { name: chi });
    const marker = within(screen.getByRole('group', { name: 'Tower markers' })).getByLabelText(`${chi} · Critical`);
    expect(marker).toHaveAttribute('href', row.getAttribute('href'));
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: /CHI-40117/ })).toHaveFocus();
  });

  it('prompts for blank search, keeps unmatched input on the current route, and clears back to all towers', async () => {
    const user = userEvent.setup();
    render(createElement(App));
    const search = screen.getByRole('searchbox', { name: 'Search towers' });
    await user.click(search);
    expect(screen.getByText(/Enter a site ID/)).toBeVisible();
    await user.type(search, 'no-such-tower');
    expect(screen.getByText('No towers found.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Portfolio scenario' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(search).toHaveFocus();
    expect(screen.queryByText('No towers found.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Tower Map' }));
    expect(await screen.findByText('No towers match your search and filters.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(screen.getByText('25 matching towers · 25 on map')).toBeVisible();
    expect(search).toHaveValue('');
  });

  it('keeps recovery and Help reachable without a valid fixture', () => {
    render(createElement(PortfolioProvider, { fixtureResult: { ok: false, code: 'INVALID_FIXTURE' } },
      createElement(GlobalBar, { active: 'map', route: '#/map' }), createElement(TowerMapPage)));
    expect(screen.getByRole('alert')).toHaveTextContent('No portfolio results were published');
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '#/help');
    expect(screen.getByRole('button', { name: 'Reset workshop' })).toBeEnabled();
    expect(screen.queryByRole('list', { name: 'Matching towers' })).not.toBeInTheDocument();
  });
});
