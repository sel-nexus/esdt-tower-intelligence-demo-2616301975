/** Follow the assessment links and simulated alert workflow in the workshop. */
import { expect, test } from '@playwright/test';

test('opens health overviews and keeps the score and findings after closing a simulated alert', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assessments', exact: true })).toBeFocused();
  await page.getByRole('link', { name: /CHI-40117/ }).click();
  await expect(page).toHaveURL(/#\/assessments\/CHI-40117\/overview$/);
  const health = page.getByRole('region', { name: 'Tower health' });
  const findings = page.getByRole('region', { name: 'Findings' });
  const alerts = page.getByRole('region', { name: 'Alerts' });
  await expect(health).toContainText('Critical · 53/100');
  await expect(health).toContainText('Latest inspection: 2023-12-15 · Expired');
  await expect(findings).toContainText('Severe corrosion observed.');
  await expect(alerts).toContainText('No operational request.');
  await expect(alerts.getByRole('button', { name: /close alert: severe corrosion/i })).toHaveCount(0);
  await alerts.getByRole('button', { name: /acknowledge alert: severe corrosion/i }).click();
  await expect(alerts.getByText('Alert status: Acknowledged')).toBeVisible();
  await alerts.getByRole('button', { name: /close alert: severe corrosion/i }).click();
  await expect(alerts.getByText('Alert status: Closed')).toBeFocused();
  await expect(health).toContainText('Critical · 53/100');
  await expect(findings).toContainText('Severe corrosion observed.');

  await page.getByRole('link', { name: 'All assessments' }).click();
  await page.getByRole('link', { name: /LAX-60214/ }).click();
  await expect(health).toContainText('Needs Attention · 64/100');
  await page.getByText('Evidence and sources', { exact: true }).click();
  await expect(page.getByText('Stale · Low Confidence · Incomplete', { exact: true })).toBeVisible();
  await expect(page.getByText('Observed: 2023-12-15 · Updated: 2025-02-20', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
