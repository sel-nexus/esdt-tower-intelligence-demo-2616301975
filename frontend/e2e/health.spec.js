/** Follow the assessment links and simulated alert workflow in the workshop. */
import { expect, test } from '@playwright/test';

test('shows tower profile, history and health, and keeps the score and findings after closing a simulated alert', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assessments', exact: true })).toBeFocused();
  await page.getByRole('link', { name: /CHI-40117/ }).click();
  await expect(page).toHaveURL(/#\/assessments\/CHI-40117\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'CHI-40117 · Lakefront Junction' })).toBeVisible();
  const profile = page.getByRole('region', { name: 'Tower profile' });
  for (const [label, value] of [
    ['Portfolio', 'Synthetic US Tower Portfolio'], ['Location', 'Chicago, IL, US'],
    ['Lifecycle status', 'active'], ['Height', '134 ft'], ['Commissioned', '2006'],
    ['Active tenants', '3'], ['Mount utilization', '3/3 (100%)'], ['Free mounts', '0'],
    ['Structural status', 'failed'], ['Structural headroom', '-7%'],
    ['Free ground space', '136 sq ft'], ['Free cabinet units', '5'],
    ['Power load', '20 kW'], ['Power headroom', '2 kW'], ['Fiber', 'Not available'],
  ]) {
    await expect(profile.getByText(label, { exact: true }).locator('..').locator('dd')).toHaveText(value);
  }
  const history = page.getByRole('region', { name: 'Inspection and maintenance history' });
  const inspection = history.getByRole('listitem').filter({ hasText: 'Synthetic structural inspection. · poor' });
  const maintenance = history.getByRole('listitem').filter({ hasText: 'Synthetic equipment service review. · poor' });
  await expect(inspection.getByText('2023-12-15', { exact: true })).toBeVisible();
  await expect(maintenance.getByText('2025-01-20', { exact: true })).toBeVisible();

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
  await expect(profile.getByText('3/6 (50%)', { exact: true })).toBeVisible();
  await page.getByText('Evidence and sources', { exact: true }).click();
  await expect(page.getByText('Stale · Low Confidence · Incomplete', { exact: true })).toBeVisible();
  await expect(page.getByText('Observed: 2023-12-15 · Updated: 2025-02-20', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
