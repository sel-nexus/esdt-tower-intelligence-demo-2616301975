/** Exercise ranking, isolated workflow, audit retention, and the exact export contract. */
import { describe, expect, it, vi } from 'vitest';
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
  it('captures scores, provenance and constraints once and downloads the original scenario after a switch', () => {
    const delivered = send(baseline, { kind: 'assessmentDelivered', ref });
    const captured = send(delivered, { kind: 'exportAssessment', ref });
    expect(captured.preview.text).toBe(renderText(captured.preview.record));
    expect(Object.isFrozen(captured.preview.record.evidence[0])).toBe(true);
    expect(captured.preview.text).toContain('Health score: 86/100 (Good)');
    expect(captured.preview.text).toContain('Power shortfall: 4 kW');
    expect(captured.preview.text).toContain('Indicative assessment only');
    expect(captured.preview.text).toMatch(/observed .*confidence/);
    const changed = send(captured, { kind: 'settings', patch: { powerToleranceKw: 3 } });
    expect(send(changed, { kind: 'exportAssessment', ref }).result.code).toBe('STALE_VIEW');
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
    expect(text).toMatch(/Gaps:\n- /);
    const anchor = { click: vi.fn(), remove: vi.fn() };
    const browser = { Blob, URL: { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() },
      document: { createElement: () => anchor, body: { append: vi.fn() } }, setTimeout: callback => callback() };
    expect(downloadText(text, result.record.filename, browser)).toEqual({ ok: true, filename: result.record.filename });
    const [blob] = browser.URL.createObjectURL.mock.calls[0];
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new TextEncoder().encode(text));
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
    expect(downloadText(text, '../unsafe.txt', browser).code).toBe('EXPORT_FAILED');
    anchor.click.mockImplementationOnce(() => { throw new Error('local failure'); });
    expect(downloadText(text, result.record.filename, browser).code).toBe('EXPORT_FAILED');
    expect(captureExport(null, baseline.assessments).code).toBe('STALE_VIEW');
  });
});
