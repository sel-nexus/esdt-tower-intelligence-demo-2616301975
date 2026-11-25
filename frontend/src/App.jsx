/** Compose the standalone scenario workshop view. */
import { PortfolioProvider, usePortfolio } from './components/PortfolioProvider.jsx';
import { ScenarioControls } from './components/ScenarioControls.jsx';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Show the current baseline totals and provide fixture recovery on failure. */
function ScenarioWorkshop() {
  const { state, snapshot, summary } = usePortfolio();
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <p className="text-sm font-semibold">ESDT Tower Intelligence</p>
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Synthetic workshop</p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio scenario</h1>
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
      </main>
    </div>
  );
}

/** Mount workshop content inside the single portfolio state owner. */
export default function App() {
  return (
    <PortfolioProvider>
      <ScenarioWorkshop />
    </PortfolioProvider>
  );
}
