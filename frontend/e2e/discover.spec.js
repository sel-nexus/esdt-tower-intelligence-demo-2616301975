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

test('compares ranked shortlists across scenarios and opens the top growth assessment', async ({ page }) => {
  await page.goto('/');
  const shortlists = page.getByRole('region', { name: 'Priority shortlists' });
  const growth = shortlists.getByRole('region', { name: 'Growth Opportunities shortlist' }).getByRole('link');
  const critical = shortlists.getByRole('region', { name: 'Critical Sites shortlist' }).getByRole('link');
  await expect(growth).toHaveText(['NYC-10234', 'ATL-30492']);
  await expect(critical).toHaveText(['CHI-40117']);
  await growth.first().click();
  const heading = page.getByRole('heading', { level: 1, name: /NYC-10234/ });
  await expect(heading).toBeFocused();
  await expect(page.getByRole('region', { name: 'Tower health' })).toContainText('Good · 86/100');

  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await page.getByLabel('Active scenario', { exact: true }).selectOption('energy-pressure');
  await expect(page.getByRole('region', { name: 'Active scenario summary' })).toContainText('Energy pressure · 2025-03-15');
  await expect(growth).toHaveText(['ATL-30492']);
  await expect(critical).toHaveText(['CHI-40117']);
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

test('recovers from an unregistered hash via its portfolio link', async ({ page }) => {
  await page.goto('/#/not-a-workshop-route');
  await expect(page.getByRole('heading', { name: 'Page not available' })).toBeFocused();
  await page.getByRole('link', { name: 'Return to portfolio' }).click();
  await expect(page.getByRole('region', { name: 'Active scenario summary' })).toContainText('$1,890,000');
});
