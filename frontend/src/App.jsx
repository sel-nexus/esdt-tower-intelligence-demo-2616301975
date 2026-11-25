/** Compose the scenario workshop and the assessment hash routes. */
import { useEffect, useRef, useState } from 'react';
import { PortfolioProvider, usePortfolio } from './components/PortfolioProvider.jsx';
import { ScenarioControls } from './components/ScenarioControls.jsx';
import ActionsPage from './pages/ActionsPage.jsx';
import AssessmentPage from './pages/AssessmentPage.jsx';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Show the current baseline totals and provide fixture recovery on failure. */
function ScenarioWorkshop() {
  const { state, snapshot, summary } = usePortfolio();
  return (
      <>
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio scenario</h1>
        <p className="mt-3 max-w-prose text-foreground-muted">Reproduce the baseline, then test how changes to the synthetic inputs affect the active scenario.</p>
        {!snapshot ? (
          <div role="alert" className="mt-7 rounded-lg border border-border bg-surface p-5">
            <h2 className="font-semibold text-error">Synthetic fixture unavailable</h2>
            <p className="mt-2 text-sm">{state.fixtureError} Reload to retry. No portfolio results have been published.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-md border border-border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Reload fixture</button>
          </div>
        ) : (
          <>
            <section aria-label="Active scenario summary" className="my-7 rounded-lg border border-border bg-surface p-5 sm:p-7">
              <p className="text-sm font-semibold text-primary-700">{snapshot.scenarioLabel} · {snapshot.referenceDate} (UTC)</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  ['Active towers', summary.sites],
                  ['Active tenants', summary.tenants ?? 'Unknown'],
                  ['Indicative annual revenue', summary.revenueCents === null ? 'Unknown' : dollars.format(summary.revenueCents / 100)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-foreground-muted">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <ScenarioControls />
          </>
        )}
        <p className="mt-6 text-sm text-foreground-muted">Provisional demo defaults · Product signoff pending · Indicative assessment only</p>
      </>
  );
}

/** Resolve only the workshop's registered paths, without displaying raw input. */
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
  const navLink = 'inline-flex min-h-11 items-center px-2 text-sm font-medium hover:underline focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-primary-700';
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 px-5 py-2 sm:px-8">
          <p className="py-1 text-sm font-semibold">ESDT Tower Intelligence</p>
          <nav aria-label="Workshop">
            <a href="#/portfolio" className={navLink} aria-current={portfolio ? 'page' : undefined}>Portfolio</a>
            <a href="#/assessments" className={navLink} aria-current={assessment ? 'page' : undefined}>Assessments</a>
            <a href="#/actions" className={navLink} aria-current={actions ? 'page' : undefined}>Actions</a>
          </nav>
          <p className="py-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">Synthetic workshop</p>
        </div>
      </header>
      <main ref={main} className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        {portfolio ? <ScenarioWorkshop /> : assessment ? <AssessmentPage key={match?.[1]} siteId={match?.[1]} tab={match?.[2]} /> : actions ? <ActionsPage /> : (
          <>
            <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">Page not available</h1>
            <p className="mt-3 text-foreground-muted">This workshop route could not be found.</p>
            <a href="#/portfolio" className="mt-4 inline-flex min-h-11 items-center text-primary-700 underline underline-offset-4 focus-visible:outline-ring">Return to portfolio</a>
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
