/** Compose workshop views under one portfolio provider and hash router. */
import { useEffect, useRef, useState } from 'react';
import { GlobalBar, focus } from './components/GlobalBar.jsx';
import { PortfolioProvider } from './components/PortfolioProvider.jsx';
import ActionsPage from './pages/ActionsPage.jsx';
import AssessmentPage from './pages/AssessmentPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import PortfolioPage from './pages/PortfolioPage.jsx';
import TowerMapPage from './pages/TowerMapPage.jsx';

/** Resolve only registered workshop paths, never displaying raw route input. */
function WorkshopRoutes() {
  const [hash, setHash] = useState(() => window.location.hash);
  const main = useRef(null);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => { main.current?.querySelector('h1')?.focus(); }, [hash]);
  const portfolio = hash === '' || hash === '#/portfolio';
  const match = /^#\/assessments\/([A-Z0-9-]+)\/(overview|growth)$/.exec(hash);
  const assessment = hash === '#/assessments' || Boolean(match);
  const actions = hash === '#/actions' || hash === '#/actions/link';
  const active = portfolio ? 'portfolio' : assessment ? 'assessments' : actions ? 'actions'
    : hash === '#/map' ? 'map' : hash === '#/help' ? 'help' : undefined;
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <GlobalBar active={active} route={hash} />
      <main ref={main} className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {portfolio && <PortfolioPage />}
        {assessment && <AssessmentPage key={match?.[1]} siteId={match?.[1]} tab={match?.[2]} />}
        {actions && <ActionsPage />}
        {active === 'map' && <TowerMapPage />}
        {active === 'help' && <HelpPage />}
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

/** Mount workshop content inside the single portfolio state owner. */
export default function App() {
  return (
    <PortfolioProvider>
      <WorkshopRoutes />
    </PortfolioProvider>
  );
}
