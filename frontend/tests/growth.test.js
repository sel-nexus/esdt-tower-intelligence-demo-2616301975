// @vitest-environment jsdom
/** Cover evidence precedence, provisional score bands and commercial projections. */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.jsx';
import { PortfolioProvider, usePortfolio } from '../src/components/PortfolioProvider.jsx';
import { computeEconomics, formatIllustrativeUsd } from '../src/utils/economics.js';
import { loadBaseline } from '../src/utils/fixtures.js';
import { assessHealth } from '../src/utils/health.js';
import { createPortfolioState } from '../src/utils/portfolioReducer.js';
import { assessReadiness } from '../src/utils/readiness.js';

const fixture = loadBaseline();
const { snapshot } = createPortfolioState(fixture);
const nyc = snapshot.sitesById.get('NYC-10234');
const atl = snapshot.sitesById.get('ATL-30492');
const dal = snapshot.sitesById.get('DAL-20451');
const chi = snapshot.sitesById.get('CHI-40117');

/** Replace a test observation without mutating the baseline. */
const value = (attr, next) => ({ ...attr, value: next, missingReason: next === null ? 'not-provided' : null });

/** Change an independent source without changing the observation or the fixture. */
function withEvidence(id, changes) {
  const evidenceById = new Map(snapshot.evidenceById);
  evidenceById.set(id, { ...evidenceById.get(id), ...changes });
  return { ...snapshot, evidenceById };
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('esdt.demo.session.v1');
  window.history.replaceState(null, '', '/');
});

describe('readiness', () => {
  it.each([
    ['NYC-10234', 'Yes after an upgrade', 'UPGRADE_FIT', ['power']],
    ['ATL-30492', 'Yes after an upgrade', 'UPGRADE_FIT', ['cabinet']],
    ['DAL-20451', 'Yes', 'CURRENT_FIT', []],
    ['CHI-40117', 'No', 'HARD_BLOCKER', []],
    ['LAX-60214', 'Need More Information', 'MATERIAL_GAP', []],
  ])('derives the %s anchor from evidence', (id, answer, decidingRule, remedies) => {
    const site = snapshot.sitesById.get(id);
    expect(assessReadiness(snapshot, site, assessHealth(snapshot, site).findings)).toMatchObject({
      answer, decidingRule, remedies, disclaimer: 'Indicative assessment only',
      requiredValidation: expect.arrayContaining(['Certified structural and site validation before implementation']),
    });
  });

  it('requires current structure, power and cabinet evidence for LAX', () => {
    const result = assessReadiness(snapshot, snapshot.sitesById.get('LAX-60214'));
    expect(result.score).toBeNull();
    for (const attribute of ['structure.status', 'power.headroomKw', 'space.cabinetFreeUnits']) {
      expect(result.gaps).toContainEqual(expect.objectContaining({ attribute, materiality: 'required', freshness: 'Stale' }));
    }
  });

  it('keeps every confirmed blocker and unrelated gap even when structure settles the answer', () => {
    const site = { ...chi, space: { ...chi.space, cabinetFreeUnits: value(chi.space.cabinetFreeUnits, null) } };
    const result = assessReadiness(snapshot, site, assessHealth(snapshot, site).findings);
    expect(result).toMatchObject({ decidingRule: 'HARD_BLOCKER', score: null,
      gaps: expect.arrayContaining([expect.objectContaining({ attribute: 'space.cabinetFreeUnits' })]) });
    expect(result.constraints).toEqual(expect.arrayContaining([
      'Confirmed structural failure', 'No free mount', 'Unresolved critical safety issue',
      'Power shortfall exceeds the provisional tolerance', 'Required fiber is unavailable',
    ]));
  });

  it('answers No for a confirmed safety issue even when the unchanged score qualifies for Yes', () => {
    const clear = assessReadiness(snapshot, dal);
    const site = { ...dal, condition: { ...dal.condition, criticalSafety: value(dal.condition.criticalSafety, true) } };
    const blocked = assessReadiness(snapshot, site);
    expect(clear.answer).toBe('Yes');
    expect(clear.score).toBeGreaterThanOrEqual(snapshot.config.readinessBands.yes);
    expect(blocked).toMatchObject({ answer: 'No', decidingRule: 'HARD_BLOCKER', score: clear.score });
    expect(blocked.constraints).toContain('Unresolved critical safety issue');
  });

  it.each([[3.99, 'HARD_BLOCKER'], [4, 'UPGRADE_FIT'], [5, 'UPGRADE_FIT']])(
    'uses the inclusive provisional boundary at tolerance %s kW', (powerToleranceKw, decidingRule) => {
      const result = assessReadiness({ ...snapshot, config: { ...snapshot.config, powerToleranceKw } }, nyc);
      expect(result).toMatchObject({ decidingRule, effectiveInputs: { powerDeficit: 4 }, effectiveThresholds: { powerToleranceKw } });
    },
  );

  it('distinguishes a 90-point unverified power deficit from an evidenced remedy', () => {
    const site = { ...nyc, structure: { ...nyc.structure, headroomPct: value(nyc.structure.headroomPct, 100) } };
    const unverified = { ...site, upgrades: value(site.upgrades, []) };
    expect(assessReadiness(snapshot, unverified)).toMatchObject({ score: 90, decidingRule: 'UNVERIFIED_POWER', currentFit: false });
    expect(assessReadiness(snapshot, site)).toMatchObject({ score: 90, decidingRule: 'UPGRADE_FIT', effectiveInputs: { afterCapacities: { power: 12 } } });
  });

  it.each([{ feasibility: 'infeasible' }, { afterCapacity: 7 }])('rejects a current non-remediable power shortfall: %j', patch => {
    const site = { ...nyc, upgrades: value(nyc.upgrades, [{ ...nyc.upgrades.value[0], ...patch }]) };
    expect(assessReadiness(snapshot, site)).toMatchObject({ answer: 'No', decidingRule: 'HARD_BLOCKER' });
  });

  it('does not treat a future-dated infeasibility record as a confirmed power blocker', () => {
    const future = withEvidence(`${nyc.siteId}:future-fit`, { asOf: '2025-03-02' });
    const site = { ...nyc, upgrades: value(nyc.upgrades, [{ ...nyc.upgrades.value[0], feasibility: 'infeasible' }]) };
    expect(assessReadiness(future, site)).toMatchObject({ decidingRule: 'MATERIAL_GAP', remedies: [],
      gaps: [expect.objectContaining({ attribute: 'upgrades.power.futureFit', freshness: 'Future-dated' })] });
  });

  it('keeps a credible cabinet proposal open without promoting partial future-fit proof', () => {
    const partial = withEvidence(`${atl.siteId}:future-fit`, { completeness: 'partial' });
    const result = assessReadiness(partial, atl);
    expect(result).toMatchObject({ decidingRule: 'MATERIAL_GAP', remedies: [], effectiveInputs: { spaceDeficit: 1, afterCapacities: { cabinet: 4 } } });
    expect(result.gaps).toContainEqual(expect.objectContaining({ attribute: 'upgrades.cabinet.futureFit', flags: ['Incomplete'] }));
  });

  it('asks for cabinet feasibility evidence when the current complete record explicitly says unverified', () => {
    const site = { ...atl, upgrades: value(atl.upgrades, [{ ...atl.upgrades.value[0], feasibility: 'unverified' }]) };
    const result = assessReadiness(snapshot, site);
    const unresolved = ['Cabinet shortfall: 1 unit', 'Cabinet upgrade fit is unverified'];
    expect(result).toMatchObject({ answer: 'Need More Information', currentFit: false, remedies: [],
      effectiveInputs: { 'space.requiredCabinetUnits': 2, spaceDeficit: 1, afterCapacities: { cabinet: 4 } },
      evidence: expect.arrayContaining([
        expect.objectContaining({ attribute: 'upgrades.cabinet.afterCapacity', value: 4, freshness: 'Current', completeness: 'complete', usable: true }),
        expect.objectContaining({ attribute: 'upgrades.cabinet.futureFit', value: 'unverified', freshness: 'Current', completeness: 'complete', usable: true }),
      ]),
      constraints: expect.arrayContaining(unresolved),
    });
    expect(result.gaps.filter(row => row.materiality === 'required')).toEqual([]);
    expect(result.recommendation).toMatch(/document that the proposed cabinet upgrade is feasible and meets the tenant’s cabinet demand/i);

    const stricter = { ...snapshot, config: { ...snapshot.config,
      readinessBands: { information: 98, upgrade: 99, yes: 100 } } };
    const belowBand = assessReadiness(stricter, site);
    expect(belowBand.score).toBeLessThan(stricter.config.readinessBands.information);
    expect(belowBand).toMatchObject({ answer: 'Need More Information', recommendation: result.recommendation });

    const unsafe = { ...site, condition: { ...site.condition, criticalSafety: value(site.condition.criticalSafety, true) } };
    const blocked = assessReadiness(snapshot, unsafe);
    expect(blocked).toMatchObject({ answer: 'No', decidingRule: 'HARD_BLOCKER', currentFit: false, remedies: [],
      constraints: expect.arrayContaining(['Unresolved critical safety issue', ...unresolved]),
    });
    expect(blocked.recommendation).toContain('Unresolved critical safety issue');
    expect(blocked.recommendation).not.toMatch(/cabinet/i);
  });

  it.each([
    ['missing catalog', snapshot, value(atl.upgrades, null), 'upgrades', 'Missing'],
    ['stale catalog listing no remedy', withEvidence(atl.upgrades.evidenceId, { asOf: '2023-12-01' }), value(atl.upgrades, []), 'upgrades', 'Stale'],
    ['missing after-capacity evidence', withEvidence(atl.upgrades.value[0].evidenceId, { asOf: null }), atl.upgrades, 'upgrades.cabinet.afterCapacity', 'Missing'],
    ['stale after-capacity evidence', withEvidence(atl.upgrades.value[0].evidenceId, { asOf: '2023-12-01' }), atl.upgrades, 'upgrades.cabinet.afterCapacity', 'Stale'],
  ])('treats %s as a material gap and retains a separate blocker', (_, input, upgrades, attribute, freshness) => {
    const site = { ...atl, upgrades };
    const gap = expect.objectContaining({ attribute, freshness, materiality: 'required' });
    expect(assessReadiness(input, site)).toMatchObject({ answer: 'Need More Information', decidingRule: 'MATERIAL_GAP',
      currentFit: false, remedies: [], gaps: expect.arrayContaining([gap]) });

    const unsafe = { ...site, condition: { ...site.condition, criticalSafety: value(site.condition.criticalSafety, true) } };
    const blocked = assessReadiness(input, unsafe);
    expect(blocked).toMatchObject({ answer: 'No', decidingRule: 'HARD_BLOCKER', gaps: expect.arrayContaining([gap]) });
    expect(blocked.recommendation).toContain('Unresolved critical safety issue');
    expect(blocked.recommendation).not.toMatch(/cabinet/i);
  });

  it.each([
    ['absent', []],
    ['undersized', [{ ...atl.upgrades.value[0], afterCapacity: 1 }]],
    ['infeasible', [{ ...atl.upgrades.value[0], feasibility: 'infeasible' }]],
  ])('blocks a cabinet shortfall when current evidence confirms the remedy is %s', (_, proposals) => {
    const site = { ...atl, upgrades: value(atl.upgrades, proposals) };
    expect(assessReadiness(snapshot, site)).toMatchObject({ answer: 'No', decidingRule: 'HARD_BLOCKER',
      currentFit: false, remedies: [], effectiveInputs: { spaceDeficit: 1 } });
  });

  it('checks each remedy and required fiber before confirming combined future fit', () => {
    const cabinetAndPower = { ...nyc, space: { ...nyc.space, cabinetFreeUnits: value(nyc.space.cabinetFreeUnits, 1) },
      upgrades: value(nyc.upgrades, [...nyc.upgrades.value, ...atl.upgrades.value]) };
    expect(assessReadiness(snapshot, cabinetAndPower)).toMatchObject({ decidingRule: 'UPGRADE_FIT', remedies: ['power', 'cabinet'] });
    const noFiber = { ...cabinetAndPower, connectivity: { requiredFiber: value(nyc.connectivity.requiredFiber, true), fiber: value(nyc.connectivity.fiber, false) } };
    expect(assessReadiness(snapshot, noFiber)).toMatchObject({ answer: 'Need More Information', components: { connectivity: 0 },
      constraints: expect.arrayContaining(['Required fiber is unavailable']) });
  });

  it('does not need unavailable fiber evidence when the tenant does not require fiber', () => {
    const site = { ...dal, connectivity: { ...dal.connectivity, fiber: value(dal.connectivity.fiber, null) }, permits: value(dal.permits, null) };
    expect(assessReadiness(snapshot, site)).toMatchObject({ decidingRule: 'CURRENT_FIT', components: { connectivity: 100 }, gaps: [
      expect.objectContaining({ attribute: 'connectivity.fiber', materiality: 'optional' }),
      expect.objectContaining({ attribute: 'permits', materiality: 'optional' }),
    ] });
  });

  it.each([[49, 'BAND_NO'], [50, 'BAND_INFORMATION'], [69, 'BAND_INFORMATION'],
    [70, 'UPGRADE_UNESTABLISHED'], [84, 'UPGRADE_UNESTABLISHED'], [85, 'CURRENT_FIT']])(
    'applies the provisional bands at %i without treating them as eligibility', (score, decidingRule) => {
      const s = { ...snapshot, config: { ...snapshot.config, readinessWeights: { structure: 100, mounting: 0, space: 0, power: 0, connectivity: 0 } } };
      const status = score === 49 || score === 50 ? 'warning' : 'pass';
      const site = { ...dal, structure: { status: value(dal.structure.status, status),
        headroomPct: value(dal.structure.headroomPct, score * 2 - (status === 'warning' ? 75 : 100)) } };
      expect(assessReadiness(s, site)).toMatchObject({ score, decidingRule });
    },
  );
});

describe('economics and committed projection', () => {
  it('keeps NYC annual money and investment in cents and computes unrounded payback', () => {
    const economics = computeEconomics(nyc, snapshot);
    expect(economics).toMatchObject({ revenue: 6506000, operatingCost: 2040000, energyCost: 720000,
      upgradeCost: 1024100, annualUpside: 3494000, utilization: 0.75, activeTenants: 3,
      paybackStatus: 'known', paybackYears: 1024100 / 3494000 });
    expect(formatIllustrativeUsd(economics.revenue)).toBe('$65,060');
    expect(economics.paybackYears.toFixed(2)).toBe('0.29');
  });

  it.each([[null, 420, 'unknown'], [420, null, 'unknown'], [0, null, 'unknown'],
    [0, 420, 'not-applicable'], [420, 0, 'not-applicable'], [420, -75, 'not-applicable']])(
    'separates unavailable and inapplicable payback for cents %s / %s', (investment, upside, paybackStatus) => {
      const site = { ...nyc, commercial: { ...nyc.commercial, upgradeCost: value(nyc.commercial.upgradeCost, investment),
        annualUpside: value(nyc.commercial.annualUpside, upside) } };
      expect(computeEconomics(site, snapshot)).toMatchObject({ upgradeCost: investment, annualUpside: upside, paybackStatus, paybackYears: null, paybackReason: expect.any(String) });
      expect(formatIllustrativeUsd(investment)).toBe(investment === null ? 'Unknown' : investment === 0 ? '$0' : '$4.20');
    },
  );

  it('does not use stale money or divide by zero available mounts', () => {
    const stale = withEvidence(`${nyc.siteId}:commercial`, { asOf: '2023-12-01' });
    const site = { ...nyc, mounting: { occupied: value(nyc.mounting.occupied, 0), free: value(nyc.mounting.free, 0) } };
    expect(computeEconomics(site, stale)).toMatchObject({ revenue: null, utilization: null, totalMounts: 0, paybackStatus: 'unknown' });
    expect(formatIllustrativeUsd(-75)).toBe('-$0.75');
  });

  it('uses only the energy and tenancy anchor for SEA', () => {
    const sea = snapshot.sitesById.get('SEA-50983');
    expect(computeEconomics(sea, snapshot)).toMatchObject({ activeTenants: 1, energyCost: 1634000 });
    expect(assessHealth(snapshot, sea).findings).toContainEqual(expect.objectContaining({ kind: 'energy' }));
  });

  it('retains the frozen index across an alert edit and recomputes only on a new committed snapshot', () => {
    const { result } = renderHook(usePortfolio, { wrapper: PortfolioProvider });
    const original = result.current.assessments;
    expect(Object.isFrozen(original.get(nyc.siteId).readiness)).toBe(true);
    expect(() => original.clear()).toThrow(TypeError);
    act(() => result.current.send({ kind: 'setAlert', alertId: `${chi.siteId}:corrosion`, to: 'Acknowledged' }));
    expect(result.current.assessments).toBe(original);
    act(() => result.current.send({ kind: 'switch', scenarioId: 'energy-pressure' }));
    expect(result.current.assessments).not.toBe(original);
    expect(result.current.assessments.get(nyc.siteId)).toMatchObject({ ref: { snapshotRevision: 2 }, readiness: { decidingRule: 'HARD_BLOCKER' } });
    expect(original.get(nyc.siteId).readiness.decidingRule).toBe('UPGRADE_FIT');
  });

  it('renders the answer, validation, raw cents and Unknown on a growth deep link', async () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    window.history.replaceState(null, '', `/#/assessments/${nyc.siteId}/growth`);
    const user = userEvent.setup();
    const { unmount } = render(createElement(App));
    const fit = screen.getByRole('region', { name: 'Colocation readiness' });
    expect(within(fit).getByRole('status')).toHaveTextContent('Yes after an upgrade');
    expect(within(fit).getByText(/Certified structural and site validation/)).toBeVisible();
    expect(within(fit).getByText('Indicative assessment only')).toBeVisible();
    expect(within(fit).getByText(/the documented upgrade meets the modeled demand/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Growth' })).toHaveAttribute('aria-current', 'page');
    const economics = screen.getByRole('region', { name: 'Indicative economics' });
    expect(within(economics).getByText('$65,060')).toBeVisible();
    expect(within(economics).getByText('0.29 years')).toBeVisible();
    expect(within(economics).getByText('1024100')).toBeInTheDocument();
    expect(within(economics).getByText('Tower Owner data')).toBeVisible();
    expect(within(fit).queryByText('$65,060')).not.toBeInTheDocument();
    await user.click(screen.getByText('Evidence and sources'));
    const technical = within(screen.getByRole('heading', { name: 'ESDT-Aligned' }).closest('section'));
    const futureFit = within(technical.getByText('Power upgrade future fit').closest('li'));
    expect(futureFit.getByText('Synthetic Future Fit Worksheet · Synthetic')).toBeVisible();
    expect(futureFit.getByText('Completeness: complete · Confidence: 92%')).toBeVisible();
    expect(futureFit.getByText('Current')).toBeVisible();
    unmount();
    window.history.replaceState(null, '', `/#/assessments/${dal.siteId}/growth`);
    render(createElement(App));
    expect(screen.getByText('Payback: Investment and annual upside both need current evidence.')).toBeVisible();
  });

  it('keeps the unknown score, expired validation and required evidence visible for LAX', () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    window.history.replaceState(null, '', '/#/assessments/LAX-60214/growth');
    render(createElement(App));
    const fit = within(screen.getByRole('region', { name: 'Colocation readiness' }));
    expect(fit.getByRole('status')).toHaveTextContent('Need More Information');
    expect(fit.getByText('Technical readiness score:').closest('p')).toHaveTextContent('Technical readiness score: Unknown');
    expect(fit.getByText('Renew the expired inspection')).toBeVisible();
    expect(fit.getByText(/Structure status: Stale.*required for fit/)).toBeVisible();
    expect(fit.getByText(/Collect current, complete records/)).toBeVisible();
  });
});
