/** Show deterministic work queues, independent simulation controls, and local diagnostics. */
import PropTypes from 'prop-types';
import { useRef, useState } from 'react';
import { usePortfolio } from '../components/PortfolioProvider.jsx';
import { CATEGORIES, QUEUES, STATUSES, selectQueue } from '../utils/actions.js';

const control = 'min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-raised focus-visible:outline-ring';
const kinds = { remediation: 'Remediation', inspection: 'Inspection', energy: 'Cost review', 'missing-info': 'Evidence request',
  'power-upgrade': 'Power upgrade', 'cabinet-upgrade': 'Cabinet upgrade', 'add-tenant': 'Add tenant' };
const errors = {
  STALE_VIEW: 'This queue changed. Review the current action before retrying.',
  ITEM_NOT_FOUND: 'This action is no longer available in the active scenario.',
  INVALID_TRANSITION: 'Move progress forward one step at a time.',
  INVALID_CATEGORY: 'Select Grow, Improve or Protect.',
};

/** Separate progress, categorization and explicit follow-up on one stable action row. */
function ActionRow({ action, alerts, submit }) {
  const status = useRef(null);
  const next = STATUSES[STATUSES.indexOf(action.status) + 1];
  const label = `${action.siteId} · ${kinds[action.kind]}`;
  return (
    <li className="space-y-2 py-5">
      <h3 className="font-semibold">
        <a href={`#/assessments/${action.siteId}/overview`} className="inline-flex min-h-11 items-center text-primary-700 underline-offset-4 hover:underline focus-visible:outline-ring">{label}</a>
      </h3>
      <p className="text-sm">{action.nextStep}</p>
      <p className="text-sm text-foreground-muted">
        Severity: {action.severity} · Due: {action.dueDate ?? 'Not set'}
        {['add-tenant', 'power-upgrade', 'cabinet-upgrade'].includes(action.kind) && ` · ${action.priority === null ? 'Unranked — validation needed' : `Opportunity score: ${action.priority.toFixed(2)}`}`}
      </p>
      <p role="status" ref={status} tabIndex={-1} className="text-sm">
        Progress: {action.status} · Alert status: {alerts.length ? alerts.map(alert => alert.status).join(', ') : 'No registered alert'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-foreground-muted">
          Category <span className="sr-only">for {label}</span>
          <select className={control} value={action.category ?? ''} onChange={event => submit({ kind: 'categorize', category: event.target.value })}>
            <option value="" disabled>Not categorized</option>
            {CATEGORIES.map(category => <option key={category}>{category}</option>)}
          </select>
        </label>
        {next && <button type="button" className={control} onClick={() => {
          if (next === 'Completed') status.current?.focus();
          submit({ kind: 'setAction', to: next });
        }}>{next === 'Completed' ? 'Mark Completed' : 'Start action'}</button>}
        <button type="button" className={control} onClick={() => submit({ kind: 'recordFollowUp' })}>Record recommended follow-up</button>
      </div>
    </li>
  );
}

ActionRow.propTypes = { action: PropTypes.object.isRequired, alerts: PropTypes.array.isRequired, submit: PropTypes.func.isRequired };

/** Render a safe human-readable audit summary without exposing command payloads. */
function eventSummary(event) {
  if (!event) return 'None recorded';
  const change = event.from ? `${event.from} → ${event.to}` : event.to;
  return [event.type, event.scenarioId, event.itemId ?? event.siteId, change, event.mode, event.timestamp].filter(Boolean).join(' · ');
}

/** Display the selected queue and preserve completed work in its original order. */
export default function ActionsPage() {
  const { state, snapshot, actions, diagnostics, alerts, send } = usePortfolio();
  const [queue, setQueue] = useState(QUEUES[0]);
  const rows = selectQueue(actions, queue);
  const actionIntent = ['setAction', 'categorize', 'recordFollowUp'].includes(state.lastCommandKind);
  return (
    <div className="space-y-6">
      <header>
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">Actions</h1>
        <p className="mt-3 text-foreground-muted">Prioritized recommendations from the active assessment snapshot.</p>
        <p className="mt-2 text-sm font-medium">Simulated · No operational request</p>
      </header>
      {!snapshot ? <p role="alert" className="text-error">Synthetic fixture unavailable. <a className="underline focus-visible:outline-ring" href="#/portfolio">Return to portfolio</a> to retry.</p> : (
        <section className="rounded-lg border border-border bg-surface p-5 sm:p-7" aria-labelledby="action-queue">
          <h2 id="action-queue" className="text-xl font-semibold">Priority queue</h2>
          <label className="mt-4 grid w-fit gap-1 text-sm text-foreground-muted">
            Action queue
            <select className={control} value={queue} onChange={event => setQueue(event.target.value)}>
              {QUEUES.map(view => <option key={view}>{view}</option>)}
            </select>
          </label>
          <p role="status" className="mt-3 text-sm text-foreground-muted">{snapshot.scenarioLabel} · {rows.length} {rows.length === 1 ? 'action' : 'actions'} in {queue}.</p>
          {actionIntent && state.result?.ok === false && <p role="alert" className="mt-2 text-sm text-error">{errors[state.result.code] ?? 'Action was not updated.'}</p>}
          <p role="status" className="mt-2 text-sm text-foreground-muted">
            {state.lastCommandKind === 'recordFollowUp' && state.result?.ok && 'Recommended follow-up recorded locally.'}
          </p>
          {rows.length ? (
            <ol className="mt-3 divide-y divide-border">
              {rows.map(action => <ActionRow key={action.actionId} action={action}
                alerts={alerts.filter(alert => action.findingId ? alert.findingId === action.findingId : alert.siteId === action.siteId)}
                submit={command => send({ ...command, actionId: action.actionId, snapshotRevision: snapshot.snapshotRevision })} />)}
            </ol>
          ) : <p className="mt-4 text-sm">No actions qualify for this queue.</p>}
        </section>
      )}
      <details className="rounded-lg border border-border bg-surface px-5 sm:px-7">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-ring">Diagnostics</summary>
        <div className="space-y-3 pb-5 text-sm">
          <p>Build: {diagnostics.build} · Scenario: {diagnostics.scenarioId ?? 'Unavailable'} · Fixture: {diagnostics.fixtureVersion ?? 'Unavailable'} · Settings: {diagnostics.settingsVersion ?? 'Unavailable'}</p>
          <dl className="space-y-1">
            {Object.entries(diagnostics.latest).map(([key, event]) => (
              <div key={key}><dt className="inline font-medium">Latest {key}: </dt><dd className="inline break-words">{eventSummary(event)}</dd></div>
            ))}
            <div><dt className="inline font-medium">Last error: </dt><dd className="inline">{diagnostics.lastErrorCode ?? 'None recorded'}</dd></div>
          </dl>
          <h2 className="font-semibold">Recent local events</h2>
          {diagnostics.events.length ? (
            <ol className="divide-y divide-border" aria-label="Recent local events">
              {[...diagnostics.events].reverse().map(event => <li key={event.sequence} className="break-words py-2">#{event.sequence} · {eventSummary(event)}</li>)}
            </ol>
          ) : <p className="text-foreground-muted">No events recorded in this tab.</p>}
        </div>
      </details>
    </div>
  );
}
