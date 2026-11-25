// @vitest-environment jsdom
/** Exercise snapshot health, provenance, simulated alerts, and assessment navigation. */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, renderHook, act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.jsx';
import { PortfolioProvider, usePortfolio } from '../src/components/PortfolioProvider.jsx';
import AssessmentPage from '../src/pages/AssessmentPage.jsx';
import { listAlerts, transitionAlert } from '../src/utils/alerts.js';
import { loadBaseline } from '../src/utils/fixtures.js';
import { assessHealth, deriveAssessments, healthBand, inspectionTiming, resolveEvidence } from '../src/utils/health.js';
import { createPortfolioState, reduce } from '../src/utils/portfolioReducer.js';

const fixture = loadBaseline();
const initial = createPortfolioState(fixture);
const { snapshot } = initial;
const baseline = deriveAssessments(snapshot);
const chi = 'CHI-40117';
const lax = 'LAX-60214';
const alertId = `${chi}:corrosion`;

/** Submit a new reducer command without forging prior state. */
const send = (state, command) => reduce(state, { ...command, commandId: state.lastCommandId + 1 });

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('esdt.demo.session.v1');
  window.history.replaceState(null, '', '/');
});

describe('health scores', () => {
  it.each([
    ['NYC-10234', 86, 'Good'], ['DAL-20451', 92, 'Good'], ['ATL-30492', 83, 'Good'],
    [chi, 53, 'Critical'], ['SEA-50983', 78, 'Needs Attention'], [lax, 64, 'Needs Attention'],
  ])('derives %s as %i %s from the committed snapshot', (id, score, band) => {
    expect(baseline.get(id)).toMatchObject({
      ref: { siteId: id, scenarioId: 'baseline', settingsVersion: 1, snapshotRevision: 1 },
      assessedAt: '2025-03-01T00:00:00Z', health: { score, band },
    });
  });

  it.each([[59, 'Critical'], [60, 'Needs Attention'], [79, 'Needs Attention'], [80, 'Good'], [null, 'Unknown']])(
    'classifies score %s as %s at the configured band boundaries', (score, band) => {
      expect(healthBand(score, snapshot.config.healthBands)).toBe(band);
    },
  );

  it('retains unrelated components and confirmed corrosion with a masked battery', () => {
    const masked = send(initial, { kind: 'mask', siteId: chi, attribute: 'condition.battery', enabled: true });
    const result = deriveAssessments(masked.snapshot).get(chi);
    expect(result.health).toMatchObject({ score: null, band: 'Unknown', confidence: null, components: { power: null, structure: 40 } });
    expect(result.health.components.equipment).toBe(baseline.get(chi).health.components.equipment);
    expect(result.findings.map(finding => finding.kind)).toEqual(expect.arrayContaining(['corrosion', 'missing-info', 'inspection']));
    expect(result.evidence.find(row => row.attribute === 'condition.battery')).toMatchObject({
      evidenceId: `${chi}:operations`, freshness: 'Missing', missingReason: 'simulated-missing', materiality: 'required', usable: false,
    });
  });

  it('does not change numerical health for an optional cabinet gap', () => {
    const state = send(initial, { kind: 'switch', scenarioId: 'evidence-gaps' });
    const result = deriveAssessments(state.snapshot).get('DAL-20451');
    expect(result.health).toEqual(baseline.get('DAL-20451').health);
    expect(result.evidence.find(row => row.attribute === 'space.cabinetFreeUnits')).toMatchObject({ materiality: 'optional', freshness: 'Missing' });
  });

  it('does not infer a due date from a masked or empty inspection history', () => {
    const masked = send(initial, { kind: 'mask', siteId: chi, attribute: 'histories.inspection', enabled: true });
    const original = snapshot.sitesById.get(chi);
    const empty = { ...original, histories: { ...original.histories, inspection: { ...original.histories.inspection, value: [] } } };
    for (const result of [deriveAssessments(masked.snapshot).get(chi), assessHealth(snapshot, empty)]) {
      expect(result.inspection).toEqual({ latestDate: null, expiryDate: null, due: null, expired: null });
      expect(result.health).toMatchObject({ score: null, penalty: 0, confidence: null });
      expect(result.findings.map(finding => finding.kind)).toEqual(['corrosion', 'missing-info']);
    }
  });

  it.each([
    ['2025-01-29', false, false], ['2025-01-30', true, false], ['2025-03-01', true, false], ['2025-03-02', true, true],
  ])('uses reference date %s for the due and expiry cutoffs', (date, due, expired) => {
    expect(inspectionTiming('2024-03-01', date, snapshot.config)).toEqual({
      latestDate: '2024-03-01', expiryDate: '2025-03-01', due, expired,
    });
  });

  it('subtracts the inspection penalty only after the frozen expiry date', () => {
    const nyc = snapshot.sitesById.get('NYC-10234');
    const inspection = nyc.histories.inspection;
    const site = { ...nyc, histories: { ...nyc.histories, inspection: {
      ...inspection, value: [{ ...inspection.value[0], date: '2024-03-01' }],
    } } };
    const atExpiry = assessHealth(snapshot, site);
    const afterExpiry = assessHealth({ ...snapshot, referenceDate: '2025-03-02' }, site);
    expect(afterExpiry.health.components).toEqual(atExpiry.health.components);
    expect(atExpiry.health.penalty).toBe(0);
    expect(afterExpiry.health.penalty).toBe(8);
    expect(afterExpiry.health.score).toBe(atExpiry.health.score - 8);
    expect(afterExpiry.health.confidence).toBe(atExpiry.health.confidence - 15);
  });

  it('keeps simultaneous stale, low-confidence and incomplete flags without dropping the numeric score', () => {
    const result = baseline.get(lax);
    const inspection = result.evidence.find(row => row.attribute === 'histories.inspection');
    expect(inspection).toMatchObject({ domain: 'ESDT-Aligned', sourceSystem: 'Synthetic Inspection Register', asOf: '2023-12-15',
      updatedAt: '2025-02-20', confidence: 55, completeness: 'partial', synthetic: true, usable: false,
      flags: ['Stale', 'Low Confidence', 'Incomplete'] });
    expect(result.health).toMatchObject({ score: 64, penalty: 8, confidence: 40 });
    expect(result.findings.find(finding => finding.kind === 'missing-info').evidenceIds).toEqual([`${lax}:structure`, `${lax}:inspection`]);
    expect(baseline.get(chi).findings.slice(0, 2).map(finding => finding.kind)).toEqual(['corrosion', 'inspection']);
    expect(baseline.get('SEA-50983').findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'energy' })]));
  });

  it('only considers complete, current observations at or above the confidence threshold usable', () => {
    const id = 'probe';
    const envelope = { evidenceId: id, value: false, missingReason: null };
    const source = { evidenceId: id, asOf: '2024-03-01', confidence: 60, completeness: 'complete' };
    const resolve = changes => resolveEvidence({ ...snapshot, evidenceById: new Map([[id, { ...source, ...changes }]]) }, envelope, 'fiber');
    expect(resolve({})).toMatchObject({ value: false, freshness: 'Current', usable: true });
    expect(resolve({ asOf: '2024-02-29', confidence: 59 })).toMatchObject({ flags: ['Stale', 'Low Confidence'], usable: false });
    expect(resolve({ asOf: '2025-03-02' })).toMatchObject({ freshness: 'Future-dated', usable: false });
    expect(resolve({ asOf: null, confidence: null })).toMatchObject({ freshness: 'Missing', confidence: null, usable: false });
    expect(resolveEvidence(snapshot, envelope, 'fiber')).toMatchObject({ value: null, freshness: 'Missing', usable: false });
    expect(deriveAssessments(null).size).toBe(0);
  });
});

describe('alert progress', () => {
  it('supports direct closure in the transition helper but rejects missing and backward transitions', () => {
    const closed = transitionAlert(snapshot, {}, alertId, 'Closed');
    expect(closed).toMatchObject({ ok: true, from: 'Open', to: 'Closed' });
    expect(transitionAlert(snapshot, closed.edits, alertId, 'Open')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(transitionAlert(snapshot, closed.edits, alertId, 'Acknowledged')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(transitionAlert(snapshot, {}, alertId, 'Unknown')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(transitionAlert(snapshot, {}, 'missing', 'Closed')).toMatchObject({ ok: false, code: 'ITEM_NOT_FOUND' });
    expect(listAlerts(snapshot, closed.edits)).toHaveLength(snapshot.alerts.length);
  });

  it('keeps scenario-local status, rejects stale intents, and restores Open on reset', () => {
    const ack = send(initial, { kind: 'setAlert', alertId, to: 'Acknowledged' });
    const duplicate = send(ack, { kind: 'setAlert', alertId, to: 'Acknowledged' });
    expect(duplicate.result).toEqual({ ok: true, code: 'NO_CHANGE' });
    expect(duplicate.workflow).toBe(ack.workflow);
    expect(duplicate.workflowRevision).toBe(1);
    expect(ack.workflow.actions).toBe(initial.workflow.actions);
    expect(ack.workflow.categories).toBe(initial.workflow.categories);
    const switched = send(duplicate, { kind: 'switch', scenarioId: 'energy-pressure' });
    expect(listAlerts(switched.snapshot, switched.workflow.alerts, chi).every(alert => alert.status === 'Open')).toBe(true);
    const stale = send(switched, { kind: 'setAlert', alertId, to: 'Closed', snapshotRevision: 1 });
    expect(stale.result.code).toBe('STALE_VIEW');
    const back = send(stale, { kind: 'switch', scenarioId: 'baseline' });
    expect(listAlerts(back.snapshot, back.workflow.alerts).find(alert => alert.alertId === alertId).status).toBe('Acknowledged');
    const reset = send(back, { kind: 'reset' });
    expect(listAlerts(reset.snapshot, reset.workflow.alerts).every(alert => alert.status === 'Open')).toBe(true);
  });

  it('does not recompute the assessment map or change findings when an alert advances', () => {
    const { result } = renderHook(usePortfolio, { wrapper: PortfolioProvider });
    const before = result.current;
    act(() => result.current.send({ kind: 'setAlert', alertId, to: 'Acknowledged' }));
    expect(result.current.snapshot).toBe(before.snapshot);
    expect(result.current.assessments).toBe(before.assessments);
    expect(result.current.alerts.find(alert => alert.alertId === alertId).status).toBe('Acknowledged');
    act(() => result.current.send({ kind: 'setAlert', alertId, to: 'Closed' }));
    expect(result.current.assessments.get(chi)).toBe(before.assessments.get(chi));
    expect(result.current.alerts.find(alert => alert.alertId === alertId).status).toBe('Closed');
  });
});

describe('assessment navigation', () => {
  it('keeps missing tenant power demand in shared evidence without flagging health', async () => {
    const siteId = 'DAL-20451';
    const input = structuredClone(fixture);
    const site = input.value.sites.find(item => item.siteId === siteId);
    site.power.requiredKw = { ...site.power.requiredKw, value: null, missingReason: 'not-provided' };
    const user = userEvent.setup();
    render(createElement(PortfolioProvider, { fixtureResult: input }, createElement(AssessmentPage, { siteId })));

    const health = within(screen.getByRole('region', { name: 'Tower health' }));
    expect(health.getByText('Good')).toBeVisible();
    expect(health.queryByText(/Required health evidence needs review/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Evidence and sources'));
    const demand = within(screen.getByText('Required power').closest('li'));
    expect(demand.getByText('power.requiredKw · power · required')).toBeVisible();
    expect(demand.getByText('Missing · not provided')).toBeVisible();
  });

  it('opens a linked assessment with heading focus, then acknowledges and closes without changing health', async () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    const user = userEvent.setup();
    render(createElement(App));
    await user.click(screen.getByRole('link', { name: 'Assessments' }));
    expect(await screen.findByRole('heading', { name: 'Assessments' })).toHaveFocus();
    await user.click(screen.getByRole('link', { name: /CHI-40117/ }));
    expect(await screen.findByRole('heading', { name: /CHI-40117/ })).toHaveFocus();
    const health = screen.getByRole('region', { name: 'Tower health' });
    expect(health).toHaveTextContent('Critical · 53/100');
    expect(health).toHaveTextContent('Latest inspection: 2023-12-15 · Expired');
    await user.click(within(health).getByText('Health score breakdown'));
    expect(within(health).getByText('8 points')).toBeVisible();
    const alerts = screen.getByRole('region', { name: 'Alerts' });
    expect(within(alerts).queryByRole('button', { name: /close alert/i })).not.toBeInTheDocument();
    await user.click(within(alerts).getByRole('button', { name: /acknowledge alert: severe corrosion/i }));
    expect(within(alerts).getByText('Alert status: Acknowledged')).toBeVisible();
    await user.click(within(alerts).getByRole('button', { name: /close alert: severe corrosion/i }));
    expect(within(alerts).getByText('Alert status: Closed')).toHaveFocus();
    expect(health).toHaveTextContent('Critical · 53/100');
    await user.click(screen.getByText('Evidence and sources'));
    expect(screen.getByRole('heading', { name: 'ESDT-Aligned' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tower Owner' })).toBeVisible();
    expect(screen.getAllByText('Synthetic Inspection Register · Synthetic')[0]).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Portfolio' }));
    expect(await screen.findByRole('heading', { name: 'Portfolio scenario' })).toBeVisible();
  });

  it('shows limits on the LAX health assessment and separates inspection provenance from owner economics', async () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    window.history.replaceState(null, '', `/#/assessments/${lax}/overview`);
    const user = userEvent.setup();
    render(createElement(App));
    const health = within(screen.getByRole('region', { name: 'Tower health' }));
    expect(health.getByText('Indicative assessment only')).toBeVisible();
    expect(health.getByText(/Required health evidence needs review/)).toBeVisible();
    expect(health.getByText('Workshop recommendation only. No work order is issued.')).toBeVisible();
    const commercial = within(screen.getByRole('region', { name: 'Commercial snapshot' }));
    expect(commercial.getByText('Tower Owner data')).toBeVisible();
    expect(commercial.getByText(/not an approved business case/)).toBeVisible();
    await user.click(screen.getByText('Evidence and sources'));
    const technical = within(screen.getByRole('heading', { name: 'ESDT-Aligned' }).closest('section'));
    const inspection = within(technical.getByText('histories.inspection').closest('li'));
    expect(inspection.getByText('Synthetic Inspection Register · Synthetic')).toBeVisible();
    expect(inspection.getByText('Observed: 2023-12-15 · Updated: 2025-02-20')).toBeVisible();
    expect(inspection.getByText('Completeness: partial · Confidence: 55%')).toBeVisible();
    expect(inspection.getByText('Stale · Low Confidence · Incomplete')).toBeVisible();
    const owner = within(screen.getByRole('heading', { name: 'Tower Owner' }).closest('section'));
    expect(owner.getByText('commercial.revenue').closest('li')).toHaveTextContent('Synthetic Lease and Cost Ledger');
    expect(owner.queryByText('histories.inspection')).not.toBeInTheDocument();
  });

  it('recovers from an unknown site without displaying an invalid assessment', async () => {
    window.localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}');
    window.history.replaceState(null, '', '/#/assessments/MISSING/overview');
    const user = userEvent.setup();
    render(createElement(App));
    expect(screen.getByRole('status')).toHaveTextContent('Tower not found');
    expect(screen.queryByRole('region', { name: 'Tower health' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /NYC-10234/ }));
    expect(await screen.findByRole('region', { name: 'Tower health' })).toHaveTextContent('Good · 86/100');
  });
});
