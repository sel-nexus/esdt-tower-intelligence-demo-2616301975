/** Exercise facilitator changes through the standalone browser UI. */
import { expect, test } from '@playwright/test';

test('switches, masks, applies settings and recovers the synthetic baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  await expect(summary).toContainText('Baseline · 2025-03-01');
  await expect(summary.getByText('25', { exact: true })).toBeVisible();
  await expect(summary.getByText('62', { exact: true })).toBeVisible();
  await expect(summary.getByText('$1,890,000', { exact: true })).toBeVisible();
  await controls.getByLabel('Scenario', { exact: true }).selectOption('energy-pressure');
  await expect(summary).toContainText('Energy pressure · 2025-03-15');
  await expect(controls.getByText('Effective input: 2', { exact: true })).toBeVisible();
  await controls.getByRole('button', { name: 'Mask evidence' }).click();
  await expect(controls.getByText('Effective input: Unknown (simulated missing)')).toBeVisible();
  await controls.getByRole('button', { name: 'Restore evidence' }).click();
  await expect(controls.getByText('Effective input: 2', { exact: true })).toBeVisible();

  const tolerance = controls.getByRole('spinbutton', { name: /proposed power tolerance/i });
  const apply = controls.getByRole('button', { name: 'Apply settings' });
  await tolerance.fill('-1');
  await apply.click();
  await expect(controls.getByRole('alert')).toContainText('effective tolerance is unchanged');
  await expect(controls.getByRole('status')).toContainText('Snapshot revision 4 · Settings version 1');
  await tolerance.fill('3');
  await apply.click();
  await expect(controls.getByText('Effective tolerance: 3 kW')).toBeVisible();
  await apply.click();
  await expect(controls.getByRole('status')).toContainText('Snapshot revision 5 · Settings version 2 · No effective change.');

  await controls.getByRole('button', { name: 'Reset baseline' }).click();
  await expect(summary).toContainText('Baseline · 2025-03-01');
  await expect(controls.getByText('Effective input: 4', { exact: true })).toBeVisible();
  await expect(tolerance).toHaveValue('5');
  expect(errors).toEqual([]);
});

test('changes NYC growth and queue membership at 3 kW, then restores both at baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');

  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  const tolerance = controls.getByRole('spinbutton', { name: /proposed power tolerance/i });
  const portfolio = page.getByRole('link', { name: 'Portfolio', exact: true });
  const actions = page.getByRole('link', { name: 'Actions', exact: true });
  const queue = page.getByRole('region', { name: 'Priority queue' });
  const nycUpgrade = queue.getByRole('link', { name: 'NYC-10234 · Power upgrade', exact: true });
  const readiness = page.getByRole('region', { name: 'Colocation readiness' }).getByRole('status');

  await expect(controls.getByText('Effective tolerance: 5 kW')).toBeVisible();
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(nycUpgrade).toBeVisible();
  await nycUpgrade.click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NYC-10234');
  await expect(readiness).toHaveText('Yes after an upgrade');

  await portfolio.click();
  await tolerance.fill('3');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  await expect(controls.getByText('Effective tolerance: 3 kW')).toBeVisible();
  await expect(controls.getByText('Effective input: 4', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search towers' });
  await search.fill('NYC-10234');
  await page.getByRole('list', { name: 'Tower search results' }).getByRole('link', { name: /NYC-10234/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NYC-10234');
  await expect(readiness).toHaveText('No');
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(queue.getByRole('status').filter({ hasText: 'Baseline · 1 action in Upgrade Required.' })).toBeVisible();
  await expect(queue.getByRole('link', { name: /^ATL-30492/ })).toBeVisible();
  await expect(queue.getByRole('link', { name: /^NYC-10234/ })).toHaveCount(0);

  await portfolio.click();
  await controls.getByRole('button', { name: 'Reset baseline' }).click();
  await expect(controls.getByText('Effective tolerance: 5 kW')).toBeVisible();
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(nycUpgrade).toBeVisible();
  await nycUpgrade.click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(readiness).toHaveText('Yes after an upgrade');
  expect(errors).toEqual([]);
});
