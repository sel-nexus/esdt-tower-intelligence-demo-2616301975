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
import { resumeSession, SESSION_KEY, signIn, signOut } from './utils/session.js';

/**
 * Resolve only registered workshop paths, never displaying raw route input.
 * Args:
 *   hash: Current workshop route.
 *   onSignOut: Close the workshop and attempt to clear its marker.
 */
function WorkshopRoutes({ hash, onSignOut }) {
  const main = useRef(null);
  useEffect(() => { main.current?.querySelector('h1')?.focus(); }, [hash]);
  const portfolio = hash === '' || hash === '#/portfolio' || hash === '#/sign-in';
  const match = /^#\/assessments\/([A-Z0-9-]+)\/(overview|growth)$/.exec(hash);
  const assessment = hash === '#/assessments' || Boolean(match);
  const actions = hash === '#/actions' || hash === '#/actions/link';
  const active = portfolio ? 'portfolio' : assessment ? 'assessments' : actions ? 'actions'
    : hash === '#/map' ? 'map' : hash === '#/help' ? 'help' : hash === '#/samples' ? 'samples' : undefined;
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <GlobalBar active={active} route={hash} onSignOut={onSignOut} />
      <main ref={main} className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {portfolio && <PortfolioPage />}
        {assessment && <AssessmentPage key={match?.[1]} siteId={match?.[1]} tab={match?.[2]} />}
        {actions && <ActionsPage />}
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

WorkshopRoutes.propTypes = { hash: PropTypes.string.isRequired, onSignOut: PropTypes.func.isRequired };

/** Gate the workshop before mounting portfolio state; this is not authorization. */
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
      flushSync(() => setSession({ ok: true, signedIn: false }));
    }

    window.addEventListener('hashchange', syncHash);
    window.addEventListener('storage', syncSession);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  useEffect(() => {
    if (!session.signedIn) replaceRoute('#/sign-in');
    else if (hash === '#/sign-in') replaceRoute('#/portfolio');
  }, [hash, session.signedIn]);

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
   * Open Portfolio only after the fixed pair results in a saved session.
   * Args:
   *   username: Entered username.
   *   password: Entered password.
   * Returns:
   *   Whether the sign-in form can be cleared and dismissed.
   */
  function enter(username, password) {
    const result = signIn(username, password);
    if (result.ok) replaceRoute('#/portfolio');
    setSession(result);
    return result.ok;
  }

  /** Unmount intake immediately, including when deleting the session marker fails. */
  function exit() {
    flushSync(() => setSession(signOut()));
  }

  if (!session.signedIn) {
    return <SignInPage error={session.code} pendingClear={session.phase === 'pending-clear'} onSignIn={enter} onRetry={exit} />;
  }
  return (
    <PortfolioProvider>
      <WorkshopRoutes hash={hash} onSignOut={exit} />
    </PortfolioProvider>
  );
}
