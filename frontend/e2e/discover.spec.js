/** Exercise discovery through user-visible links and controls at desktop and mobile sizes. */
import { expect, test } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(() => { expect(errors).toEqual([]); });

test('drills into a KPI and opens the same assessment by marker and row', async ({ page }) => {
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  await expect(summary.getByRole('button', { name: 'Average tenancy: 2.48' })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Healthy sites: 48%' })).toBeVisible();
  await summary.getByRole('button', { name: 'Critical sites: 1' }).click();
  await expect(page.getByRole('heading', { name: 'Tower Map' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Tower Map', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('1 matching tower · 1 on map')).toBeVisible();
  const marker = page.getByRole('group', { name: 'Tower markers' }).getByRole('link', { name: 'CHI-40117 · Critical' });
  const row = page.getByRole('list', { name: 'Matching towers' }).getByRole('link', { name: 'CHI-40117' });
  await expect(marker).toHaveAttribute('href', await row.getAttribute('href'));
  await marker.click();
  await expect(page.getByRole('region', { name: 'Tower health' })).toContainText('Critical · 53/100');
  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  await row.focus();
  await row.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('CHI-40117');
});

test('opens Critical and Growth shortlist assessments and recalculates both distributions', async ({ page }) => {
  await page.goto('/');
  const portfolio = page.getByRole('link', { name: 'Portfolio', exact: true });
  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  const health = summary.getByRole('figure', { name: 'Health distribution' });
  const readiness = summary.getByRole('figure', { name: 'Readiness distribution' });
  await expect(health.getByRole('button', { name: 'Health distribution: Good, 12' })).toBeVisible();
  await expect(readiness.getByRole('button', { name: 'Readiness distribution: Yes after an upgrade, 2' })).toBeVisible();
  await expect(readiness.getByRole('button', { name: 'Readiness distribution: No, 4' })).toBeVisible();
  const shortlists = page.getByRole('region', { name: 'Priority shortlists' });
  const growth = shortlists.getByRole('region', { name: 'Growth Opportunities shortlist' }).getByRole('link');
  const criticalList = shortlists.getByRole('region', { name: 'Critical Sites shortlist' });
  const critical = criticalList.getByRole('link');
  await expect(growth).toHaveText(['NYC-10234', 'ATL-30492']);
  await expect(critical).toHaveText(['CHI-40117']);
  await criticalList.getByRole('link', { name: 'CHI-40117', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /CHI-40117/ })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Tower health' })).toContainText('Critical · 53/100');
  await portfolio.click();
  await growth.first().click();
  const heading = page.getByRole('heading', { level: 1, name: /NYC-10234/ });
  await expect(heading).toBeFocused();
  await expect(page.getByRole('region', { name: 'Tower health' })).toContainText('Good · 86/100');

  await portfolio.click();
  await page.getByLabel('Active scenario', { exact: true }).selectOption('energy-pressure');
  await expect(summary).toContainText('Energy pressure · 2025-03-15');
  await expect(growth).toHaveText(['ATL-30492']);
  await expect(critical).toHaveText(['CHI-40117']);
  await expect(health.getByRole('button', { name: 'Health distribution: Good, 12' })).toBeVisible();
  await expect(readiness.getByRole('button', { name: 'Readiness distribution: Yes after an upgrade, 1' })).toBeVisible();
  await expect(readiness.getByRole('button', { name: 'Readiness distribution: No, 5' })).toBeVisible();

  await summary.getByRole('combobox', { name: 'State' }).selectOption('NY');
  await expect(summary.getByRole('button', { name: 'Active towers: 1' })).toBeVisible();
  for (const [band, count] of [['Good', 1], ['Needs Attention', 0], ['Critical', 0], ['Unknown', 0]]) {
    await expect(health.getByRole('button', { name: `Health distribution: ${band}, ${count}`, exact: true })).toBeVisible();
  }
  for (const [band, count] of [['Yes', 0], ['Yes after an upgrade', 0], ['Need More Information', 0], ['No', 1], ['Unknown', 0]]) {
    await expect(readiness.getByRole('button', { name: `Readiness distribution: ${band}, ${count}`, exact: true })).toBeVisible();
  }
});

test('searches, intersects a filter, switches scenario and resets on a mobile-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search towers' });
  await search.fill(' NO SUCH TOWER ');
  await expect(page.getByText('No towers found.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeVisible();
  await search.fill('  nYc  ');
  await page.getByRole('list', { name: 'Tower search results' }).getByRole('link', { name: /NYC-10234/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NYC-10234');
  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  await expect(page.getByText('1 matching tower · 1 on map')).toBeVisible();
  await page.getByText('Filters · 0 selected').click();
  await page.getByRole('group', { name: 'Health', exact: true }).getByRole('checkbox', { name: 'Critical' }).check();
  await expect(page.getByText('No towers match your search and filters.')).toBeVisible();
  await page.getByLabel('Active scenario').selectOption('energy-pressure');
  await expect(search).toHaveValue(/nyc/i);
  await expect(page.getByRole('checkbox', { name: 'Critical', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Reset workshop' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeFocused();
  await expect(search).toHaveValue('');
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help & about' })).toBeFocused();
  await page.getByRole('main').getByRole('link', { name: 'Tower Map' }).click();
  await expect(page.getByText('25 matching towers · 25 on map')).toBeVisible();
  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(viewportFits).toBe(true);
});

test('keeps scoped KPI contributors and mobile marker and list identities aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  await summary.getByRole('combobox', { name: 'State' }).selectOption('NY');
  await expect(summary.getByRole('button', { name: 'Active towers: 1' })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Readiness distribution: Yes after an upgrade, 1' })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Health distribution: Critical, 0' })).toBeVisible();
  await summary.getByRole('button', { name: 'Growth opportunities: 1' }).click();
  await expect(page.getByRole('list', { name: 'Active discovery criteria' })).toContainText('Geography · state: NY');
  await expect(page.getByText('1 matching tower · 1 on map')).toBeVisible();
  const markers = page.getByRole('group', { name: 'Tower markers' });
  const rows = page.getByRole('list', { name: 'Matching towers' });
  await expect(markers.getByRole('link')).toHaveCount(1);
  await expect(rows.getByRole('link')).toHaveCount(1);
  const row = rows.getByRole('link', { name: 'NYC-10234' });
  await expect(markers.getByRole('link', { name: 'NYC-10234 · Good' })).toHaveAttribute('href', await row.getAttribute('href'));
  await page.getByRole('button', { name: 'Jump to results' }).click();
  await expect(page.getByRole('heading', { name: 'Tower results' })).toBeFocused();
  await page.getByRole('button', { name: 'Clear signal' }).click();
  await expect(page.getByText('1 matching tower · 1 on map')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(page.getByText('25 matching towers · 25 on map')).toBeVisible();
});

/** Verify cohort membership in both user-visible projections, not just their counts. */
async function expectMapCohort(page, siteIds) {
  await expect(page.getByText(`${siteIds.length} matching ${siteIds.length === 1 ? 'tower' : 'towers'} · ${siteIds.length} on map`, { exact: true })).toBeVisible();
  const rows = page.getByRole('list', { name: 'Matching towers' }).getByRole('link');
  const markers = page.getByRole('group', { name: 'Tower markers' }).getByRole('link');
  await expect(rows).toHaveText(siteIds);
  await expect(markers).toHaveCount(siteIds.length);
  for (const [index, siteId] of siteIds.entries()) {
    await expect(markers.nth(index)).toHaveAccessibleName(new RegExp(`^${siteId} · `));
  }
}

const baselineTowerIds = [
  'ABQ-71137', 'ATL-30492', 'BNA-70618', 'BOS-70101', 'CHI-40117', 'CLE-71928', 'DAL-20451', 'DEN-70831', 'DTW-71897',
  'LAX-60214', 'MCI-71683', 'MIA-70520', 'MSP-70716', 'NYC-10234', 'OMA-71533', 'PDX-71244', 'PHL-70204', 'PHX-70972',
  'PIT-70315', 'RDU-70422', 'SAC-71408', 'SEA-50983', 'SFO-71311', 'SLC-71054', 'STL-71765',
];
const goodTowerIds = [
  'ATL-30492', 'BNA-70618', 'BOS-70101', 'DAL-20451', 'DEN-70831', 'MIA-70520', 'MSP-70716', 'NYC-10234',
  'PHL-70204', 'PHX-70972', 'PIT-70315', 'RDU-70422',
];

for (const [metric, value, contributors] of [
  ['Active towers', '25', baselineTowerIds],
  ['Active tenants', '62', baselineTowerIds],
  ['Average tenancy', '2.48', baselineTowerIds],
  ['Indicative annual revenue', '$1,890,000', baselineTowerIds],
  ['Healthy sites', '48%', goodTowerIds],
  ['Open alerts', '4', ['CHI-40117', 'LAX-60214', 'SEA-50983']],
]) {
  test(`drills from ${metric} to its exact contributing towers`, async ({ page }) => {
    await page.goto('/');
    const summary = page.getByRole('region', { name: 'Active scenario summary' });
    await summary.getByRole('button', { name: `${metric}: ${value}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tower Map' })).toBeFocused();
    await expect(page.getByText(`Signal: ${metric} · ${contributors.length} contributing towers`, { exact: true })).toBeVisible();
    await expectMapCohort(page, contributors);
  });
}

for (const [facet, choice, matches] of [
  ['Health', 'Good', goodTowerIds],
  ['Tower type', 'monopole', ['DAL-20451', 'DEN-70831', 'LAX-60214', 'MCI-71683', 'PDX-71244', 'RDU-70422']],
  ['Geography · state', 'NY', ['NYC-10234']],
  ['Active tenant range', '0–1', ['SEA-50983']],
  ['Inspection timing', 'Due', ['BOS-70101', 'CHI-40117', 'DEN-70831', 'LAX-60214', 'OMA-71533']],
  ['Readiness', 'Yes after an upgrade', ['ATL-30492', 'NYC-10234']],
  ['Growth opportunity', 'Eligible', ['ATL-30492', 'DAL-20451', 'MIA-70520', 'MSP-70716', 'NYC-10234', 'PHL-70204']],
  ['Operating or energy cost', 'High cost', ['SEA-50983']],
]) {
  test(`filters the map and row cohort by ${facet}: ${choice}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
    await page.getByText('Filters · 0 selected', { exact: true }).click();
    const option = page.getByRole('group', { name: facet, exact: true }).getByRole('checkbox', { name: choice, exact: true });
    await option.check();
    await expect(option).toBeChecked();
    await expect(page.getByRole('list', { name: 'Active discovery criteria' }).getByRole('listitem')).toHaveText(`${facet}: ${choice}`);
    await expectMapCohort(page, matches);
  });
}

test('scopes Portfolio distributions and Map results by tower type and assessment status, then clears both', async ({ page }) => {
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  const quickFilters = summary.getByRole('group', { name: 'Quick filters' });
  const towerType = quickFilters.getByRole('combobox', { name: 'Tower type', exact: true });
  const assessmentStatus = quickFilters.getByRole('combobox', { name: 'Assessment status', exact: true });
  const state = quickFilters.getByRole('combobox', { name: 'State', exact: true });
  const health = summary.getByRole('figure', { name: 'Health distribution' });
  const readiness = summary.getByRole('figure', { name: 'Readiness distribution' });
  const baselineHealth = ['Good, 12', 'Needs Attention, 12', 'Critical, 1', 'Unknown, 0'];
  const baselineReadiness = ['Yes, 4', 'Yes after an upgrade, 2', 'Need More Information, 15', 'No, 4', 'Unknown, 0'];
  await expect(towerType).toHaveValue('');
  await expect(assessmentStatus).toHaveValue('');
  await expect(state).toHaveValue('');
  for (const band of baselineHealth) {
    await expect(health.getByRole('button', { name: `Health distribution: ${band}`, exact: true })).toBeVisible();
  }
  for (const band of baselineReadiness) {
    await expect(readiness.getByRole('button', { name: `Readiness distribution: ${band}`, exact: true })).toBeVisible();
  }

  await towerType.selectOption('monopole');
  await expect(summary.getByText('6 active towers in scope.', { exact: true })).toBeVisible();
  await expect(health.getByRole('button', { name: 'Health distribution: Needs Attention, 3', exact: true })).toBeVisible();
  await assessmentStatus.selectOption('Good');
  await expect(summary.getByText('3 active towers in scope.', { exact: true })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Active towers: 3', exact: true })).toBeVisible();
  for (const band of ['Good, 3', 'Needs Attention, 0', 'Critical, 0', 'Unknown, 0']) {
    await expect(health.getByRole('button', { name: `Health distribution: ${band}`, exact: true })).toBeVisible();
  }
  for (const band of ['Yes, 1', 'Yes after an upgrade, 0', 'Need More Information, 2', 'No, 0', 'Unknown, 0']) {
    await expect(readiness.getByRole('button', { name: `Readiness distribution: ${band}`, exact: true })).toBeVisible();
  }

  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  const criteria = page.getByRole('list', { name: 'Active discovery criteria' });
  await expect(criteria).toContainText('Tower type: monopole');
  await expect(criteria).toContainText('Health: Good');
  await expectMapCohort(page, ['DAL-20451', 'DEN-70831', 'RDU-70422']);
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await expect(towerType).toHaveValue('monopole');
  await expect(assessmentStatus).toHaveValue('Good');
  await summary.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(towerType).toHaveValue('');
  await expect(assessmentStatus).toHaveValue('');
  await expect(summary.getByText('25 active towers in scope.', { exact: true })).toBeVisible();
  await expect(summary.getByText('No search or facet filters applied.', { exact: true })).toBeVisible();
  for (const band of baselineHealth) {
    await expect(health.getByRole('button', { name: `Health distribution: ${band}`, exact: true })).toBeVisible();
  }
  for (const band of baselineReadiness) {
    await expect(readiness.getByRole('button', { name: `Readiness distribution: ${band}`, exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  await expectMapCohort(page, baselineTowerIds);
});

test('recovers from an unregistered hash via its portfolio link', async ({ page }) => {
  await page.goto('/#/not-a-workshop-route');
  await expect(page.getByRole('heading', { name: 'Page not available' })).toBeFocused();
  await page.getByRole('link', { name: 'Return to portfolio' }).click();
  await expect(page.getByRole('region', { name: 'Active scenario summary' })).toContainText('$1,890,000');
});
