/** Compose workshop views under one portfolio provider and hash router. */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import PropTypes from 'prop-types';
import { GlobalBar, focus } from './components/GlobalBar.jsx';
import { PortfolioProvider } from './components/PortfolioProvider.jsx';
import { SampleIntake } from './components/SampleIntake.jsx';
import ActionsPage from './pages/ActionsPage.jsx';
import AssessmentPage from './pages/AssessmentPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import PortfolioPage from './pages/PortfolioPage.jsx';
import SignInPage from './pages/SignInPage.jsx';
import TowerMapPage from './pages/TowerMapPage.jsx';
import { exitSession, PERSONAS, resumeSession, selectPersona, SESSION_KEY } from './utils/session.js';

const ENTRY_ROUTE = '#/personas';
const LEGACY_ENTRY_ROUTE = '#/sign-in';

/**
 * Resolve only registered workshop paths, never displaying raw route input.
 * Args:
 *   hash: Current workshop route.
 *   persona: Active local perspective.
 *   onSelectPersona: Open the selected role's start without resetting this provider.
 *   onExit: Close the workshop and attempt to clear its marker.
 *   sessionError: A failed role switch that leaves the current view intact.
 */
function WorkshopRoutes({ hash, persona, onSelectPersona, onExit, sessionError }) {
  const main = useRef(null);
  useEffect(() => { main.current?.querySelector('h1')?.focus(); }, [hash]);
  const portfolio = hash === '' || hash === '#/portfolio' || hash === ENTRY_ROUTE || hash === LEGACY_ENTRY_ROUTE;
  const match = /^#\/assessments\/([A-Z0-9-]+)\/(overview|growth)$/.exec(hash);
  const assessment = hash === '#/assessments' || Boolean(match);
  const growthQueue = hash === '#/actions/growth';
  const actions = hash === '#/actions' || hash === '#/actions/link' || hash === '#/actions/critical' || growthQueue;
  const active = portfolio ? 'portfolio' : assessment ? 'assessments' : actions ? 'actions'
    : hash === '#/map' ? 'map' : hash === '#/help' ? 'help' : hash === '#/samples' ? 'samples' : undefined;
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <GlobalBar active={active} route={hash} persona={persona} onSelectPersona={onSelectPersona} onExit={onExit} sessionError={sessionError} />
      <main ref={main} className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {portfolio && <PortfolioPage />}
        {assessment && <AssessmentPage key={match?.[1]} siteId={match?.[1]} tab={match?.[2]} />}
        {actions && <ActionsPage key={hash} initialQueue={growthQueue ? 'Growth Opportunities' : undefined} />}
        {active === 'map' && <TowerMapPage />}
        {active === 'help' && <HelpPage />}
        {active === 'samples' && <SampleIntake />}
        {!active && (
          <>
            <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">Page not available</h1>
            <p className="mt-3 text-foreground-muted">This workshop route could not be found.</p>
            <a href="#/portfolio" className={`mt-4 inline-flex min-h-11 items-center text-primary-700 underline underline-offset-4 ${focus}`}>Return to portfolio</a>
          </>
        )}
      </main>
    </div>
  );
}

WorkshopRoutes.propTypes = {
  hash: PropTypes.string.isRequired, persona: PropTypes.string.isRequired,
  onSelectPersona: PropTypes.func.isRequired, onExit: PropTypes.func.isRequired, sessionError: PropTypes.string,
};

/** Mount one workshop provider per entered session, independent of the active role. */
export default function App() {
  const [session, setSession] = useState(() => resumeSession());
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    /** Synchronize native link and history navigation. */
    function syncHash() { setHash(window.location.hash); }

    /** Close this tab's workshop when the origin's session marker is removed. */
    function syncSession(event) {
      if (event.newValue !== null || (event.key !== SESSION_KEY && event.key !== null)) return;
      if (event.storageArea !== window.localStorage) return;
      flushSync(() => setSession({ ok: true }));
    }

    window.addEventListener('hashchange', syncHash);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  useEffect(() => {
    if (!session.persona) replaceRoute(ENTRY_ROUTE);
    else if (!hash || hash === ENTRY_ROUTE || hash === LEGACY_ENTRY_ROUTE) replaceRoute(PERSONAS[session.persona].route);
  }, [hash, session.persona]);

  /**
   * Replace the current route without leaving a stale gate entry in history.
   * Args:
   *   route: Known destination hash.
   */
  function replaceRoute(route) {
    if (window.location.hash !== route) window.history.replaceState(null, '', route);
    setHash(route);
  }

  /**
   * Navigate to a role's start only if the marker can be saved.
   * Args:
   *   persona: Requested demo perspective.
   */
  function enter(persona) {
    const result = selectPersona(persona);
    if (!result.ok) {
      setSession(current => ({ ...current, code: result.code }));
      return;
    }
    if (session.persona && window.location.hash !== PERSONAS[persona].route) {
      window.history.pushState(null, '', PERSONAS[persona].route);
      setHash(PERSONAS[persona].route);
    } else {
      replaceRoute(PERSONAS[persona].route);
    }
    setSession(result);
  }

  /** Unmount intake immediately, including when deleting the session marker fails. */
  function exit() {
    flushSync(() => setSession(exitSession()));
  }

  if (!session.persona) {
    return <SignInPage error={session.code} pendingClear={session.phase === 'pending-clear'} onSelect={enter} onRetry={exit} />;
  }
  return (
    <PortfolioProvider>
      <WorkshopRoutes hash={hash} persona={session.persona} onSelectPersona={enter} onExit={exit} sessionError={session.code} />
    </PortfolioProvider>
  );
}
