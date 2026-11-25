/** Present direct entry into a synthetic workshop perspective. */
import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import { focus, WorkshopBrand } from '../components/GlobalBar.jsx';
import { PERSONAS } from '../utils/session.js';

const roleIcons = {
  portfolio: 'M3 3h8v8H3zM15 3h6v8h-6zM3 15h8v6H3zM15 15h6v6h-6z',
  asset: 'M8 5H5v16h14V5h-3M9 3h6v4H9zM8 12h8m-8 4h6',
  commercial: 'M3 4v16h18M6 15l5-5 4 2 6-7m-5 0h5v5',
  operations: 'M3 12h4l3-7 4 14 3-7h4',
  facilitator: 'M3 6h10m4 0h4M3 12h4m4 0h10M3 18h12m4 0h2M13 4h4v4h-4zM7 10h4v4H7zM15 16h4v4h-4z',
};

const notices = {
  STORAGE_UNAVAILABLE: 'Browser storage is unavailable. Enable site storage, then select a role again.',
  STORE_VERSION_INVALID: 'The saved demo session could not be restored. Select a role to replace it.',
  UNKNOWN_PERSONA: 'That demo role is unavailable. Choose one of the roles below.',
};

/**
 * Show the role picker or, exclusively, recovery for an unconfirmed exit.
 * Args:
 *   error: Recoverable marker error, if present.
 *   pendingClear: Whether exiting still requires removal of the saved marker.
 *   onSelect: Enter the selected demo perspective.
 *   onRetry: Retry removing the saved session marker.
 */
export default function SignInPage({ error, pendingClear, onSelect, onRetry }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [pendingClear]);

  return (
    <div className="workshop-entry min-h-screen font-sans">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-4 sm:px-8">
          <WorkshopBrand />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-foreground-muted">TowerCo decision workshop</p>
        <h1 ref={heading} tabIndex={-1} className="workshop-entry-title max-w-prose font-semibold tracking-tight">
          {pendingClear ? 'Workshop exit needs attention' : 'Choose a demo role'}
        </h1>
        {pendingClear ? (
          <div className="mt-5 max-w-prose space-y-5">
            <p role="alert">The workshop is hidden, but the saved session could not be removed. Reloading may restore it. Enable browser storage and retry. If removal stays blocked, clear site data before reloading; this also deletes retained samples.</p>
            <button type="button" className={`min-h-11 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-raised ${focus}`} onClick={onRetry}>Retry exit</button>
          </div>
        ) : (
          <>
            <p className="mt-3 max-w-prose text-foreground-muted">Explore the same synthetic US tower portfolio from five perspectives. Your role sets the starting view, not your permissions.</p>
            {notices[error] && <p role="alert" className="mt-5 max-w-prose rounded-md border border-border bg-surface p-3 text-sm text-error">{notices[error]}</p>}
            <ul aria-label="Demo roles" className="workshop-role-grid mt-8">
              {Object.entries(PERSONAS).map(([id, role]) => (
                <li key={id}>
                  <button type="button" className="workshop-role" aria-labelledby={`role-name-${id}`}
                    aria-describedby={`role-job-${id} role-start-${id}`} onClick={() => onSelect(id)}>
                    <svg className="workshop-role-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={roleIcons[id]} />
                    </svg>
                    <span id={`role-name-${id}`} className="workshop-role-name">{role.name}</span>
                    <span id={`role-job-${id}`} className="text-sm leading-relaxed text-foreground-muted">{role.description}</span>
                    <span id={`role-start-${id}`} className="workshop-role-start">
                      <span>{role.start}</span>
                      <span aria-hidden="true">→</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-border pt-4 text-sm text-foreground-muted">Fixture data only. No real work orders, engineering approvals or commercial commitments.</p>
          </>
        )}
      </main>
    </div>
  );
}

SignInPage.propTypes = {
  error: PropTypes.string,
  pendingClear: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
};
