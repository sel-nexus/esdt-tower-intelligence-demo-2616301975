// @vitest-environment jsdom
/** Exercise ranking, isolated workflow, audit retention, and the exact export contract. */
import { Blob, Buffer } from 'node:buffer';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentExport } from '../src/components/AssessmentExport.jsx';
import { PortfolioProvider, usePortfolio } from '../src/components/PortfolioProvider.jsx';
import ActionsPage from '../src/pages/ActionsPage.jsx';
import { nextOperationalAction, QUEUES, rankActions, selectQueue } from '../src/utils/actions.js';
import { appendEvent, createAudit, inspectDiagnostics, noteError } from '../src/utils/diagnostics.js';
import { captureExport, downloadText, renderText } from '../src/utils/export.js';
import { loadBaseline } from '../src/utils/fixtures.js';
import { createPortfolioState, reduce } from '../src/utils/portfolioReducer.js';

const timestamp = '2025-03-01T10:11:12.000Z';
const fixture = loadBaseline();
const baseline = createPortfolioState(fixture);
const nyc = 'NYC-10234';
const chi = 'CHI-40117';
const actionId = `${nyc}:power-upgrade`;
const alertId = `${chi}:corrosion`;
const ref = baseline.assessments.get(nyc).ref;
const filename = 'NYC-10234-baseline-assessment.txt';

afterEach(cleanup);

/** Send an ordered intent against the snapshot that the test is viewing. */
const send = (state, command) => reduce(state, { commandId: state.lastCommandId + 1, timestamp,
  snapshotRevision: state.snapshot.snapshotRevision, ...command });
/** Project stable IDs for membership and ordering assertions. */
const ids = rows => rows.map(row => row.actionId);

describe('action queues', () => {
  it('projects all five queues from the same baseline, including safety, due work, cost and both upgrade types', () => {
    const actions = rankActions(baseline.snapshot, baseline.assessments, baseline.workflow);
    const [critical, inspection, cost, growth, upgrades] = QUEUES.map(queue => selectQueue(actions, queue));
    expect(ids(critical)).toContain(`${chi}:remediation`);
    expect(critical.every(row => row.siteId === chi)).toBe(true);
    expect(ids(inspection)).toContain(`${chi}:inspection`);
    expect(inspection.every(row => row.kind === 'inspection' && row.dueDate)).toBe(true);
    expect(ids(cost)).toContain('SEA-50983:energy');
    expect(cost.every(row => row.kind === 'energy')).toBe(true);
    expect(ids(growth)).toEqual(expect.arrayContaining(['DAL-20451:add-tenant', actionId, 'ATL-30492:cabinet-upgrade']));
    expect(ids(upgrades)).toEqual(expect.arrayContaining([actionId, 'ATL-30492:cabinet-upgrade']));
    expect(ids(upgrades)).not.toContain('DAL-20451:add-tenant');
    expect(nextOperationalAction(actions, chi)).toBe(critical[0]);
    expect(nextOperationalAction(actions, 'unknown')).toBeUndefined();
    expect(selectQueue(actions, 'toString')).toEqual([]);
    expect(rankActions(null, new Map())).toEqual([]);
  });

  it('uses urgency, due date and IDs operationally, but raw score, IDs and unranked-last for opportunities', () => {
    const site = (siteId, due, upside = 1000) => ({
      ref: { siteId }, health: { band: 'Critical' }, recommendation: 'Validate',
      findings: [
        { kind: 'energy', severity: 'High', nextStep: 'Check energy' },
        { kind: 'inspection', severity: 'High', dueDate: due, nextStep: 'Inspect' },
      ],
      readiness: { answer: 'Yes after an upgrade', remedies: ['power', 'cabinet'], score: 90, confidence: 80, gaps: [] },
      commercial: { upgradeCost: 0, annualUpside: upside, paybackYears: null, paybackStatus: 'not-applicable' },
    });
    const index = new Map([['C', site('C', null, 1001)], ['D', site('D', null, null)], ['B', site('B', '2025-03-02')], ['A', site('A', '2025-03-01')]]);
    const actions = rankActions(baseline.snapshot, index);
    expect(ids(selectQueue(actions, 'Critical Sites')).slice(0, 10)).toEqual([
      'A:remediation', 'B:remediation', 'C:remediation', 'D:remediation', 'A:inspection', 'B:inspection',
      'A:energy', 'B:energy', 'C:energy', 'C:inspection',
    ]);
    const ranked = selectQueue(actions, 'Growth Opportunities');
    expect(ids(ranked)).toEqual(['C:cabinet-upgrade', 'C:power-upgrade', 'A:cabinet-upgrade', 'A:power-upgrade', 'B:cabinet-upgrade', 'B:power-upgrade', 'D:cabinet-upgrade', 'D:power-upgrade']);
    expect(ranked[0].priority).toBeGreaterThan(ranked[2].priority);
    expect(ranked[0].priority.toFixed(2)).toBe(ranked[2].priority.toFixed(2));
    expect(ranked.at(-1).priority).toBeNull();
  });
});

describe('workflow and audit', () => {
  it('keeps alerts, progress and category independent and completed actions in their original positions', () => {
    const skipped = send(baseline, { kind: 'setAction', actionId, to: 'Completed' });
    expect(skipped.result.code).toBe('INVALID_TRANSITION');
    const started = send(skipped, { kind: 'setAction', actionId, to: 'In Progress' });
    const categorized = send(started, { kind: 'categorize', actionId, category: 'Improve' });
    const followed = send(categorized, { kind: 'recordFollowUp', actionId });
    const alerted = send(followed, { kind: 'setAlert', alertId, to: 'Closed' });
    const completed = send(alerted, { kind: 'setAction', actionId, to: 'Completed' });
    const rows = state => selectQueue(rankActions(state.snapshot, state.assessments, state.workflow), 'Upgrade Required');
    expect(ids(rows(completed))).toEqual(ids(rows(baseline)));
    expect(rows(completed).find(row => row.actionId === actionId)).toMatchObject({ status: 'Completed', category: 'Improve' });
    expect(completed.workflow.alerts.baseline[alertId]).toBe('Closed');
    expect(followed.workflow).toBe(categorized.workflow);
    expect(completed.assessments).toBe(baseline.assessments);
    expect(completed.snapshot).toBe(baseline.snapshot);
    expect(completed.audit.events.map(event => event.type)).toEqual([
      'ACTION_STATUS_CHANGED', 'ACTION_CATEGORY_CHANGED', 'FOLLOW_UP_RECOMMENDED', 'ALERT_STATUS_CHANGED', 'ACTION_STATUS_CHANGED',
    ]);
    expect(send(completed, { kind: 'setAction', actionId, to: 'Open' }).result.code).toBe('INVALID_TRANSITION');
  });

  it('rejects stale, unknown and illegal requests and never emits for no-ops or command replay', () => {
    const command = { kind: 'categorize', actionId, category: 'Protect' };
    const edited = send(baseline, command);
    expect(send(edited, command).result.code).toBe('NO_CHANGE');
    expect(send(edited, command).audit).toBe(edited.audit);
    expect(reduce(edited, { ...command, commandId: edited.lastCommandId, timestamp })).toBe(edited);
    expect(send(edited, { ...command, category: 'Other' }).result.code).toBe('INVALID_CATEGORY');
    expect(send(edited, { ...command, actionId: 'unknown' }).result.code).toBe('ITEM_NOT_FOUND');
    const switched = send(edited, { kind: 'switch', scenarioId: 'energy-pressure' });
    const stale = send(switched, { ...command, snapshotRevision: ref.snapshotRevision });
    expect(stale.result.code).toBe('STALE_VIEW');
    expect(stale.audit.events).toBe(switched.audit.events);
    expect(stale.audit.lastErrorCode).toBe('STALE_VIEW');
    const active = rankActions(switched.snapshot, switched.assessments, switched.workflow);
    expect(active.every(row => row.category === null)).toBe(true);
    const restored = send(switched, { kind: 'switch', scenarioId: 'baseline' });
    expect(rankActions(restored.snapshot, restored.assessments, restored.workflow).find(row => row.actionId === actionId).category).toBe('Protect');
  });

  it('keeps the latest alert/export after eviction and reset, with only safe summary fields', () => {
    const alerted = send(baseline, { kind: 'setAlert', alertId, to: 'Acknowledged' });
    const exported = send(alerted, { kind: 'exportAssessment', ref, query: 'do not retain', credentials: 'do not retain' });
    let state = exported;
    for (let i = 0; i < 105; i += 1) state = send(state, { kind: 'recordFollowUp', actionId });
    expect(state.audit.events).toHaveLength(100);
    expect(state.audit.events[0].sequence).toBe(8);
    const reset = send(state, { kind: 'reset' });
    expect(reset.workflow).toEqual(baseline.workflow);
    expect(reset.audit.latest).toMatchObject({ scenario: { type: 'PORTFOLIO_RESET', sequence: 108 }, alert: { sequence: 1 }, export: { sequence: 2 } });
    expect(inspectDiagnostics(reset.snapshot, reset.audit)).toMatchObject({ scenarioId: 'baseline', settingsVersion: 1 });
    expect(JSON.stringify(reset.audit)).not.toContain('do not retain');
    expect(createPortfolioState(fixture).audit).toEqual(createAudit());
    expect(appendEvent(reset.audit, { type: 'UNSAFE_EVENT', scenarioId: 'baseline', timestamp })).toBe(reset.audit);
    expect(noteError(reset.audit, 'raw error')).toBe(reset.audit);
  });
});

describe('assessment delivery and export', () => {
  it.each([
    ['missing reference', undefined, 'SITE_NOT_FOUND'],
    ['missing site', { ...ref, siteId: 'NONEXISTENT' }, 'SITE_NOT_FOUND'],
    ['different snapshot revision', { ...ref, snapshotRevision: 2 }, 'STALE_VIEW'],
    ['different settings version', { ...ref, settingsVersion: 2 }, 'STALE_VIEW'],
    ['different scenario', { ...ref, scenarioId: 'energy-pressure' }, 'STALE_VIEW'],
  ])('rejects assessment delivery with %s without recording an execution', (_label, rejectedRef, code) => {
    const current = send(baseline, { kind: 'assessmentDelivered', ref });
    expect(current.result).toEqual({ ok: true });
    expect(current.audit.events).toEqual([{ sequence: 1, type: 'ASSESSMENT_EXECUTED', timestamp,
      siteId: nyc, scenarioId: 'baseline', snapshotRevision: 1 }]);
    const rejected = send(current, { kind: 'assessmentDelivered', ref: rejectedRef });
    expect(rejected.result).toEqual({ ok: false, code });
    expect(rejected.audit.lastErrorCode).toBe(code);
    expect(rejected.audit.events).toBe(current.audit.events);
    expect(rejected.assessments).toBe(current.assessments);
  });

  it('captures scores, provenance and constraints once and downloads the original record after a settings change', () => {
    const delivered = send(baseline, { kind: 'assessmentDelivered', ref });
    const captured = send(delivered, { kind: 'exportAssessment', ref });
    expect(captured.preview.text).toBe(renderText(captured.preview.record));
    expect(Object.isFrozen(captured.preview.record.evidence[0])).toBe(true);
    expect(captured.preview.record).toMatchObject({
      ref: { siteId: nyc, scenarioId: 'baseline', snapshotRevision: 1, settingsVersion: 1 },
      filename, towerId: nyc, assessedAt: '2025-03-01T00:00:00Z',
      healthScore: 86, healthBand: 'Good', readinessScore: 85, answer: 'Yes after an upgrade', rule: 'UPGRADE_FIT',
      thresholds: { yes: 85, upgrade: 70, information: 50, powerToleranceKw: 5, staleDays: 365, minConfidence: 60,
        weights: { structure: 30, mounting: 20, space: 15, power: 20, connectivity: 15 } },
      evidence: expect.arrayContaining([expect.objectContaining({
        id: 'NYC-10234:power', attribute: 'power.headroomKw', value: 4, status: 'Current',
        domain: 'ESDT-Aligned', source: 'Synthetic Capacity Register', asOf: '2025-02-12', updatedAt: '2025-02-20',
        confidence: 92, completeness: 'complete', flags: [],
      })]),
      gaps: [], constraints: ['Power shortfall: 4 kW'],
      recommendation: 'Complete the power upgrade before adding a tenant, then validate fit.',
      requiredValidation: ['Certified structural and site validation before implementation'], disclaimer: 'Indicative assessment only',
    });
    const changed = send(captured, { kind: 'settings', patch: { powerToleranceKw: 3 } });
    const stale = send(changed, { kind: 'exportAssessment', ref });
    expect(stale.result.code).toBe('STALE_VIEW');
    expect(stale.audit.events).toBe(changed.audit.events);
    const lateDelivery = send(changed, { kind: 'assessmentDelivered', ref });
    expect(lateDelivery.result).toEqual({ ok: false, code: 'STALE_VIEW' });
    expect(lateDelivery.audit.events).toBe(changed.audit.events);
    expect(changed.preview).toBe(captured.preview);
    expect(changed.assessments.get(nyc).readiness.answer).toBe('No');
    const download = send(changed, { kind: 'downloadExport', previewId: captured.preview.id, initiated: true });
    expect(download.audit.events.map(event => [event.type, event.mode])).toEqual([
      ['ASSESSMENT_EXECUTED', undefined], ['ASSESSMENT_EXPORTED', 'preview'], ['SETTINGS_CHANGED', undefined], ['ASSESSMENT_EXPORTED', 'download'],
    ]);
    expect(download.audit.latest.export.snapshotRevision).toBe(ref.snapshotRevision);
    expect(reduce(download, { kind: 'downloadExport', commandId: download.lastCommandId, timestamp })).toBe(download);
    expect(send(download, { kind: 'downloadExport', previewId: -1, initiated: true }).audit.events).toBe(download.audit.events);
    expect(send(download, { kind: 'downloadExport', previewId: captured.preview.id, initiated: false }).audit.events).toBe(download.audit.events);
  });

  it('labels unknown scores and sends exact preview bytes to a MIME-typed Blob, safely releasing the URL', async () => {
    const lax = baseline.assessments.get('LAX-60214');
    const result = captureExport(lax.ref, baseline.assessments);
    const text = renderText(result.record);
    expect(text).toContain('Readiness score: Unknown');
    expect(text).toContain('Gaps:\n- structure.status: Stale\n- histories.inspection: Stale, Low Confidence, Incomplete');
    const anchor = { click: vi.fn(), remove: vi.fn() };
    const browser = { Blob, URL: { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() },
      document: { createElement: () => anchor, body: { append: vi.fn() } }, setTimeout: callback => callback() };
    expect(downloadText(text, result.record.filename, browser)).toEqual({ ok: true, filename: result.record.filename });
    const [blob] = browser.URL.createObjectURL.mock.calls[0];
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(text, 'utf8'))).toBe(true);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
    expect(downloadText(text, '../unsafe.txt', browser).code).toBe('EXPORT_FAILED');
    anchor.click.mockImplementationOnce(() => { throw new Error('local failure'); });
    expect(downloadText(text, result.record.filename, browser).code).toBe('EXPORT_FAILED');
    expect(captureExport(null, baseline.assessments).code).toBe('STALE_VIEW');
  });
});

describe('provider download guard', () => {
  it('rejects a download without a capture before calling the adapter or appending an audit event', () => {
    const download = vi.fn((_text, name) => ({ ok: true, filename: name }));
    const { result } = renderHook(usePortfolio, {
      wrapper: ({ children }) => createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download }, children),
    });
    expect(result.current.state.preview).toBeNull();
    act(() => {
      expect(result.current.downloadExport(1)).toEqual({ ok: false, code: 'STALE_VIEW' });
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.state.audit.events).toEqual([]);
  });

  it('rejects the ID of a replaced capture before calling the adapter or appending an audit event', () => {
    const download = vi.fn((_text, name) => ({ ok: true, filename: name }));
    const { result } = renderHook(usePortfolio, {
      wrapper: ({ children }) => createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download }, children),
    });
    act(() => { result.current.send({ kind: 'exportAssessment', ref }); });
    const obsolete = result.current.state.preview;
    act(() => { result.current.send({ kind: 'exportAssessment', ref }); });
    expect(result.current.state.preview.id).not.toBe(obsolete.id);
    const events = result.current.state.audit.events;
    act(() => {
      expect(result.current.downloadExport(obsolete.id)).toEqual({ ok: false, code: 'STALE_VIEW' });
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.state.audit.events).toEqual(events);
  });

  it('blocks the still-committed ID while a replacement is pending in the same turn, then downloads the committed replacement', () => {
    const download = vi.fn((_text, name) => ({ ok: true, filename: name }));
    const { result } = renderHook(usePortfolio, {
      wrapper: ({ children }) => createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download }, children),
    });
    act(() => { result.current.send({ kind: 'exportAssessment', ref }); });
    const original = result.current.state.preview;
    act(() => {
      const { send, downloadExport } = result.current;
      send({ kind: 'exportAssessment', ref });
      expect(result.current.state.preview.id).toBe(original.id);
      expect(downloadExport(original.id)).toEqual({ ok: false, code: 'STALE_VIEW' });
    });
    const replacement = result.current.state.preview;
    expect(replacement.id).not.toBe(original.id);
    expect(download).not.toHaveBeenCalled();
    expect(result.current.state.audit.events.map(event => [event.type, event.mode])).toEqual([
      ['ASSESSMENT_EXPORTED', 'preview'], ['ASSESSMENT_EXPORTED', 'preview'],
    ]);

    act(() => {
      expect(result.current.downloadExport(replacement.id)).toEqual({ ok: true, filename });
    });
    expect(download.mock.calls).toEqual([[replacement.text, filename]]);
    expect(result.current.state.audit.events.map(event => [event.type, event.mode])).toEqual([
      ['ASSESSMENT_EXPORTED', 'preview'], ['ASSESSMENT_EXPORTED', 'preview'], ['ASSESSMENT_EXPORTED', 'download'],
    ]);
  });
});

describe('actions and export in the workshop UI', () => {
  it('offers a return to Portfolio when the fixture is unavailable instead of rendering a queue', () => {
    render(createElement(PortfolioProvider, { fixtureResult: { ok: false, code: 'INVALID_FIXTURE' } }, createElement(ActionsPage)));
    const alert = within(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic fixture unavailable.');
    expect(alert.getByRole('link', { name: 'Return to portfolio' })).toHaveAttribute('href', '#/portfolio');
    expect(screen.queryByLabelText('Action queue')).not.toBeInTheDocument();
  });

  it('announces an empty queue without fabricating actions and lets the user select a populated queue', async () => {
    const user = userEvent.setup();
    const singleTower = { ok: true, value: { ...fixture.value, sites: fixture.value.sites.filter(site => site.siteId === nyc) } };
    render(createElement(PortfolioProvider, { fixtureResult: singleTower }, createElement(ActionsPage)));
    const queue = within(screen.getByRole('region', { name: 'Priority queue' }));
    await user.selectOptions(queue.getByLabelText('Action queue'), 'High Operating Cost');
    expect(queue.getByText('Baseline · 0 actions in High Operating Cost.')).toHaveAttribute('role', 'status');
    expect(queue.getByText('No actions qualify for this queue.')).toBeVisible();
    expect(queue.queryByRole('list')).not.toBeInTheDocument();
    await user.selectOptions(queue.getByLabelText('Action queue'), 'Upgrade Required');
    expect(queue.getByRole('link', { name: 'NYC-10234 · Power upgrade' })).toBeVisible();
  });

  it('shows reducer rejection in the queue without changing the displayed action or recording success', async () => {
    const user = userEvent.setup();
    function RejectStaleAction() {
      const { send } = usePortfolio();
      return createElement('button', { onClick: () => send({ kind: 'setAction', actionId, snapshotRevision: 0, to: 'In Progress' }) },
        'Submit obsolete action');
    }
    render(createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp },
      createElement(RejectStaleAction), createElement(ActionsPage)));
    const queue = within(screen.getByRole('region', { name: 'Priority queue' }));
    await user.selectOptions(queue.getByLabelText('Action queue'), 'Upgrade Required');
    const row = within(queue.getByRole('link', { name: 'NYC-10234 · Power upgrade' }).closest('li'));
    await user.click(screen.getByRole('button', { name: 'Submit obsolete action' }));
    expect(queue.getByRole('alert')).toHaveTextContent('This queue changed. Review the current action before retrying.');
    expect(row.getByRole('status')).toHaveTextContent('Progress: Open');
    await user.click(screen.getByText('Diagnostics', { exact: true }));
    expect(screen.getByText('STALE_VIEW')).toBeVisible();
    expect(screen.getByText('No events recorded in this tab.')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Start action' }));
    expect(row.getByRole('status')).toHaveTextContent('Progress: In Progress');
    expect(queue.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects stale preview generation in the UI and does not call the download adapter or audit an export', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download },
      createElement(AssessmentExport, { assessmentRef: { ...ref, snapshotRevision: 2 } }), createElement(ActionsPage)));
    const region = within(screen.getByRole('region', { name: 'Assessment export' }));
    await user.click(region.getByRole('button', { name: 'Generate export preview' }));
    expect(region.getByRole('alert')).toHaveTextContent('Preview was not generated. Reopen this assessment and try again.');
    expect(region.queryByLabelText('Captured assessment text')).not.toBeInTheDocument();
    expect(region.queryByRole('button', { name: 'Download TXT' })).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
    await user.click(screen.getByText('Diagnostics', { exact: true }));
    expect(screen.getByText('STALE_VIEW')).toBeVisible();
    expect(screen.getByText('No events recorded in this tab.')).toBeVisible();
  });

  it('tells the user to regenerate when a download is rejected as stale', async () => {
    const user = userEvent.setup();
    const download = vi.fn((_text, name) => ({ ok: true, filename: name }));
    function ExportWithPendingCapture() {
      const { send } = usePortfolio();
      return createElement('div', {
        onClickCapture: event => {
          if (event.target.textContent === 'Download TXT') send({ kind: 'exportAssessment', ref });
        },
      }, createElement(AssessmentExport, { assessmentRef: ref }));
    }
    render(createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download },
      createElement(ExportWithPendingCapture)));
    const region = within(screen.getByRole('region', { name: 'Assessment export' }));
    await user.click(region.getByRole('button', { name: 'Generate export preview' }));
    await user.click(region.getByRole('button', { name: 'Download TXT' }));
    expect(region.getByRole('alert').textContent).toBe('Download did not start. Generate a new preview and try again.');
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    ['returns failure', () => ({ ok: false, code: 'EXPORT_FAILED' })],
    ['throws', () => { throw new Error('private adapter details'); }],
  ])('audits only successful downloads when the injected adapter %s before retry', async (_label, fail) => {
    const user = userEvent.setup();
    const download = vi.fn((_text, name) => ({ ok: true, filename: name })).mockImplementationOnce(fail);
    render(createElement(PortfolioProvider, { fixtureResult: fixture, now: () => timestamp, download },
      createElement(AssessmentExport, { assessmentRef: ref }), createElement(ActionsPage)));
    const region = within(screen.getByRole('region', { name: 'Assessment export' }));
    await user.click(region.getByRole('button', { name: 'Generate export preview' }));
    const capturedText = region.getByLabelText('Captured assessment text').textContent;
    expect(download).not.toHaveBeenCalled();
    const downloadButton = region.getByRole('button', { name: 'Download TXT' });
    await user.click(downloadButton);
    expect(region.getByRole('alert').textContent).toBe('Download did not start. Try Download TXT again.');
    expect(region.getByRole('status')).not.toHaveTextContent('TXT download initiated.');
    expect(region.queryByText(/private adapter details/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Diagnostics', { exact: true }));
    expect(screen.getByText('EXPORT_FAILED')).toBeVisible();
    const events = within(screen.getByRole('list', { name: 'Recent local events' }));
    expect(events.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      `#1 · ASSESSMENT_EXPORTED · baseline · ${nyc} · preview · ${timestamp}`,
    ]);
    await user.click(downloadButton);
    expect(region.getByRole('status')).toHaveTextContent('TXT download initiated.');
    expect(region.queryByRole('alert')).not.toBeInTheDocument();
    expect(download.mock.calls).toEqual([[capturedText, filename], [capturedText, filename]]);
    expect(events.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      `#2 · ASSESSMENT_EXPORTED · baseline · ${nyc} · download · ${timestamp}`,
      `#1 · ASSESSMENT_EXPORTED · baseline · ${nyc} · preview · ${timestamp}`,
    ]);
  });
});
