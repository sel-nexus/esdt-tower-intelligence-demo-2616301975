/** Explain the discovery workflow and the limits of the synthetic workshop. */
export default function HelpPage() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-foreground-muted">Workshop guide</p>
      <h1 tabIndex={-1} className="mt-2 text-4xl font-semibold tracking-tight">Help &amp; about</h1>
      <p className="mt-3 max-w-prose text-foreground-muted">Use this synthetic portfolio to practice finding a tower, explaining a signal and identifying the next review.</p>
      <ol className="mt-8 max-w-3xl divide-y divide-border border-y border-border">
        <li className="grid gap-1 py-5 sm:grid-cols-[12rem_1fr]">
          <h2 className="font-semibold">01 · Find a signal</h2>
          <p><a className="text-primary-700 underline underline-offset-4" href="#/portfolio">Open Portfolio</a> and choose a KPI to see the towers behind that number. The alert count is a count of records; several can belong to one tower.</p>
        </li>
        <li className="grid gap-1 py-5 sm:grid-cols-[12rem_1fr]">
          <h2 className="font-semibold">02 · Narrow the list</h2>
          <p>Use global search or the <a className="text-primary-700 underline underline-offset-4" href="#/map">Tower Map</a> filters. Choices within a filter are alternatives; choices across filters must all match. A row and its marker lead to the same assessment.</p>
        </li>
        <li className="grid gap-1 py-5 sm:grid-cols-[12rem_1fr]">
          <h2 className="font-semibold">03 · Repeat the exercise</h2>
          <p>Change the active scenario in the header. Use Reset workshop to return to Portfolio with baseline settings and no search, filters or simulated workflow edits. For a rejected fixture, use Reset workshop to reload.</p>
        </li>
      </ol>
      <p className="mt-6 max-w-prose text-sm text-foreground-muted">No live integrations or real work orders. Provisional demo defaults, product signoff pending. Indicative assessment only.</p>
    </>
  );
}
