/** Provide workshop navigation, tower search and scenario recovery. */
import PropTypes from 'prop-types';
import { useId, useRef, useState } from 'react';
import { overviewHref } from '../pages/AssessmentPage.jsx';
import { PERSONAS } from '../utils/session.js';
import { usePortfolio } from './PortfolioProvider.jsx';

export const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const control = `min-h-11 rounded-md border border-border bg-surface px-3 text-sm ${focus}`;
const navItems = [['portfolio', 'Portfolio'], ['map', 'Tower Map'], ['assessments', 'Assessments'], ['actions', 'Actions'], ['help', 'Help'], ['samples', 'Samples']];

/** Identify the workshop consistently on the entry screen and in the shell. */
export function WorkshopBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="workshop-brand-icon grid size-10 shrink-0 place-items-center rounded-md">
        <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 21l5-15 5 15M9 16h6m-7 3h8M6.5 4.5a7.5 7.5 0 0 0 0 9m11-9a7.5 7.5 0 0 1 0 9" />
        </svg>
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-[.14em] text-foreground-muted">ESDT · Synthetic workshop</p>
        <p className="font-semibold tracking-tight">Tower Intelligence</p>
      </div>
    </div>
  );
}

/** Open the same assessment route from search, shortlists, markers and rows. */
export function TowerLink({ siteId, children, label, className, onFocus, onBlur, onPointerEnter, onPointerLeave }) {
  const { send } = usePortfolio();
  return (
    <a href={overviewHref(siteId)} role={label ? 'link' : undefined} tabIndex={label ? 0 : undefined}
      aria-label={label} className={className}
      onFocus={onFocus} onBlur={onBlur} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
      onClick={event => {
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
          send({ kind: 'selectTower', siteId });
        }
      }}>
      {children}
    </a>
  );
}

TowerLink.propTypes = {
  siteId: PropTypes.string.isRequired, children: PropTypes.node.isRequired, label: PropTypes.string,
  className: PropTypes.string, onFocus: PropTypes.func, onBlur: PropTypes.func,
  onPointerEnter: PropTypes.func, onPointerLeave: PropTypes.func,
};

/**
 * Show workshop navigation and shared search without navigating until activation.
 * Args:
 *   active: Current navigation destination, if registered.
 *   route: Current hash used to collapse search between views.
 *   persona: Active demo perspective shown on the disclosure.
 *   onSelectPersona: Request another role without resetting the workshop.
 *   onExit: Close the local workshop.
 *   sessionError: Whether the requested role change could not be saved.
 */
export function GlobalBar({ active, route, persona, onSelectPersona, onExit, sessionError }) {
  const { snapshot, state, discovery, send } = usePortfolio();
  const id = useId();
  const searchInput = useRef(null);
  const roleDisclosure = useRef(null);
  const roleSummary = useRef(null);
  const [searchRoute, setSearchRoute] = useState(null);
  const query = state.discovery.query;
  const expanded = searchRoute === route && Boolean(snapshot);
  const results = discovery.searchIds ?? [];

  /** Reset the committed workshop from any route, or reload a rejected fixture. */
  function reset() {
    setSearchRoute(null);
    if (!snapshot) {
      window.location.reload();
      return;
    }
    send({ kind: 'reset' });
    window.location.hash = '#/portfolio';
  }

  return (
    <header className="workshop-shell border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-border py-4">
          <WorkshopBrand />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {snapshot && (
              <>
                <label htmlFor={`${id}-scenario`} className="text-sm text-foreground-muted">Active scenario</label>
                <select id={`${id}-scenario`} value={snapshot.scenarioId} className={`${control} max-w-full`}
                  onChange={event => send({ kind: 'switch', scenarioId: event.target.value })}>
                  {state.base.scenarios.map(item => <option key={item.scenarioId} value={item.scenarioId}>{item.label}</option>)}
                </select>
              </>
            )}
            <button type="button" onClick={reset} className={`${control} hover:bg-surface-raised`}>Reset workshop</button>
            {persona && (
              <details ref={roleDisclosure} className="workshop-role-disclosure relative min-w-0 max-w-full"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
                }}
                onKeyDown={event => {
                  if (event.key === 'Escape' && event.currentTarget.open) {
                    roleSummary.current.focus();
                    event.currentTarget.open = false;
                  }
                }}>
                <summary ref={roleSummary} className={`${control} flex cursor-pointer items-center gap-2 py-2 text-start hover:bg-surface-raised`}>
                  <span>
                    <span className="block text-xs text-foreground-muted">Demo role</span>
                    <span className="font-semibold">{PERSONAS[persona].name}</span>
                  </span>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="workshop-role-options rounded-md border border-border bg-surface p-2 shadow-sm">
                  <p className="px-2 py-2 text-xs font-semibold text-foreground-muted">Switch demo role</p>
                  {Object.entries(PERSONAS).filter(([id]) => id !== persona).map(([id, role]) => (
                    <button key={id} type="button" className={`block min-h-11 w-full rounded px-2 text-left text-sm hover:bg-surface-raised ${focus}`}
                      onClick={() => {
                        roleSummary.current.focus();
                        roleDisclosure.current.open = false;
                        onSelectPersona(id);
                      }}>{role.name}</button>
                  ))}
                  <button type="button" className={`mt-1 block min-h-11 w-full border-t border-border px-2 text-left text-sm hover:bg-surface-raised ${focus}`} onClick={onExit}>Exit workshop</button>
                </div>
              </details>
            )}
          </div>
          {sessionError && <p role="alert" className="w-full text-sm text-error">Could not switch roles. Your current role and workshop changes are unchanged. Check browser storage and try again.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 pb-3 sm:pb-0">
          <nav aria-label="Workshop" className="flex flex-wrap gap-x-4 sm:gap-x-6">
            {navItems.map(([key, label]) => (
              <a key={key} href={`#/${key}`} aria-current={active === key ? 'page' : undefined}
                onClick={() => setSearchRoute(null)} className={`inline-flex min-h-12 items-center border-b-2 border-transparent px-1 text-sm font-medium text-foreground-muted hover:text-foreground aria-[current=page]:border-primary-600 aria-[current=page]:font-semibold aria-[current=page]:text-primary-700 ${focus}`}>
                {label}
              </a>
            ))}
          </nav>
          {snapshot && (
            <div role="search" aria-label="Global tower search" className="relative w-full max-w-xs sm:py-1"
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchRoute(null); }}
              onKeyDown={event => {
                if (event.key === 'Escape' && expanded) {
                  event.preventDefault();
                  searchInput.current?.focus();
                  setSearchRoute(null);
                }
              }}>
              <label htmlFor={`${id}-query`} className="sr-only">Search towers</label>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-foreground-muted sm:top-[18px]">
                <circle cx="10" cy="10" r="5.5" />
                <path d="m14.5 14.5 5 5" />
              </svg>
              <input ref={searchInput} id={`${id}-query`} type="search" placeholder="Site ID, city, state or type" value={query}
                className={`${control} w-full pl-9`} aria-controls={expanded ? `${id}-results` : undefined}
                onFocus={() => setSearchRoute(route)} onClick={() => setSearchRoute(route)}
                onChange={event => { setSearchRoute(route); send({ kind: 'query', query: event.target.value }); }} />
              {expanded && (
                <div id={`${id}-results`} className="absolute left-0 right-0 top-full z-20 max-h-72 overflow-y-auto rounded-md border border-border bg-surface p-2 shadow-sm">
                  <p role="status" className="px-2 py-1 text-sm text-foreground-muted">
                    {!query.trim() ? 'Enter a site ID, city, state or tower type.' : results.length ? `${results.length} tower${results.length === 1 ? '' : 's'} found.` : 'No towers found.'}
                  </p>
                  {results.length > 0 && (
                    <ul aria-label="Tower search results" className="divide-y divide-border">
                      {results.map(siteId => {
                        const site = snapshot.sitesById.get(siteId);
                        return (
                          <li key={siteId}>
                            <TowerLink siteId={siteId} className={`flex min-h-11 flex-wrap items-center justify-between gap-x-2 px-2 text-sm hover:bg-surface-raised ${focus}`}>
                              <span className="font-mono font-medium text-primary-700">{siteId}</span>
                              <span className="text-foreground-muted">{site.city}, {site.state}</span>
                            </TowerLink>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

GlobalBar.propTypes = {
  active: PropTypes.string, route: PropTypes.string.isRequired, persona: PropTypes.oneOf(Object.keys(PERSONAS)),
  onSelectPersona: PropTypes.func, onExit: PropTypes.func, sessionError: PropTypes.string,
};
