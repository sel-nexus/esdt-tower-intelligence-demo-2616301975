/** Exercise facilitator changes through the standalone browser UI. */
import { expect, test } from '@playwright/test';

test('switches, masks, applies settings and recovers the synthetic baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

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
