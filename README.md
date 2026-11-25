# ESDT Tower Intelligence – Demo

A synthetic TowerCo workshop decision aid. All results are indicative, not engineering or investment approval. No action sends a request, creates a work order, or changes a lease. The app has no backend, database, live map service, or telemetry.

## Run locally

Use Node 24 and npm. From `frontend/`:

```sh
npm ci --no-bin-links
npm run build
npm run preview
npm test
node node_modules/@playwright/test/cli.js test
```

Open the preview URL printed by Vite and choose a demo role. There is no account or password. The role is remembered in this browser; it changes the starting view, not permissions. Use a dedicated browser profile. No secrets or real documents belong in this app.

| Demo role | Starting view |
| --- | --- |
| Portfolio Manager | Portfolio overview |
| Asset Manager | Assessments tower picker |
| Colocation / Commercial Manager | Actions → Growth Opportunities |
| Operations Manager | Actions → Critical Sites |
| Demonstration Facilitator | Portfolio with facilitator controls |

Use **Demo role** in the header to switch perspectives without resetting this tab’s active scenario, committed overrides, search, filters or simulated workflow. **Reset workshop** restores the baseline without changing roles. **Exit workshop** returns open tabs to the role picker without removing retained samples. If browser storage is blocked, enable it and retry.

## Workshop walkthrough

1. From Portfolio, compare the Critical and Growth shortlists. Drill into a KPI, filter Tower Map, and open the same site from its map marker and list row. The map is schematic; the list remains usable without marker geometry.
2. Review Chicago (`CHI-40117`): 53 Critical, with corrosion and overdue inspection. Acknowledge the simulated alert, then check that action progress did not change.
3. Compare Dallas (current fit) with NYC (`NYC-10234`, indicative power upgrade) and Los Angeles (more evidence needed). Inspect source dates, confidence and the required certified structural and site validation. NYC shows $65,060 annual revenue, $34,940 annual upside and $10,241 investment (about 0.29 years simple payback).
4. Use Actions to compare queues, categorize and progress a simulated follow-up, and inspect Diagnostics. Preview and download an assessment; both use the same captured record.
5. Open Scenario Controls. Apply tolerances of 3 and 5 kW against the synthetic 4 kW shortfall, mask a required input, then reset. Reset restores the baseline inputs and simulated workflow, but preserves the local session, retained samples and latest audit context.
6. In Samples, use `synthetic-workshop-example.txt`. Intake accepts synthetic UTF-8 `.txt` only, at most 64 KiB and 10 records; extraction is local and stores text plus metadata, never original bytes. Remove individual samples or clear this origin's site data to remove all retained material and the session. Samples do not become scoring evidence.

## Decision inputs

The versioned baseline and rules live in `frontend/src/fixtures/`. Product owns the fixture date, cutoffs and normalized mappings. **These are provisional demo assumptions pending Product sign-off**, not TowerCo policy. The baseline freezes 2025-03-01 and derives 25 sites, 62 active tenants, $1.89M indicative annual revenue, and 12 Good / 12 Needs Attention / 1 Critical.

Health weights: structure 30%, equipment 20%, power 20%, maintenance 15%, data quality 15%. Clamp and round the weighted result after the configured expiry penalty, then band at 80 and 60. Missing required inputs produce Unknown. Readiness weights: structure 30%, mounting 20%, space 15%, power 20%, connectivity 15%. Confirmed blockers take precedence over material gaps and an independently computed technical score. A conditional answer requires evidence that the upgrade resolves the constraint; a current-fit Yes needs current evidence and a score of at least 85. See `rules.v1.json` for mappings, units, caps, penalties and other bands.

Commercial values use integer USD cents. Simple payback divides upgrade cost by positive annual upside and excludes financing and other costs. Candidate priority weights readiness 40%, capped upside 30%, inverse capped payback 20% and confidence 10%. Incomplete candidates are unranked, not assigned zero. Operational queues order by configured severity, due date and stable IDs.

## Release handoff

The intended AWS rollout is a non-root static container behind the shared ALB and CloudFront; use root `GET /` as the health check. Do not deploy as an approved workshop release until Product signs off and QA/DevOps verify security headers, current Chrome and Edge, accessibility, performance, and rehearsal/rollback. Keep the previous digest and hashed assets, revalidate HTML, and wait for target convergence before announcing a new release. Use local preview as the rehearsal fallback. Two suggested follow-on validations: compare representative evidence against an approved ESDT extract and reconcile owner figures against approved Tower Owner records. Neither integration is implemented.
