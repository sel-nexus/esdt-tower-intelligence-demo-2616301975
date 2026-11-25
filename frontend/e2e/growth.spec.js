/** Exercise the Growth tab using the same assessment links as workshop users. */
import { expect, test } from '@playwright/test';

test('follows assessment links to Growth, compares conditional fit and evidence gaps, and returns to Overview', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  await page.getByRole('link', { name: /NYC-10234/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page).toHaveURL(/#\/assessments\/NYC-10234\/growth$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Growth', exact: true })).toHaveAttribute('aria-current', 'page');
  const fit = page.getByRole('region', { name: 'Colocation readiness' });
  const economics = page.getByRole('region', { name: 'Indicative economics' });
  await expect(fit.getByRole('status')).toHaveText('Yes after an upgrade');
  await expect(fit).toContainText('Power shortfall: 4 kW');
  await expect(fit).toContainText('Certified structural and site validation');
  await expect(page.getByText(/Indicative assessment only/)).toBeVisible();
  await expect(economics).toContainText('$65,060');
  await expect(economics).toContainText('0.29 years');
  await economics.getByText('Raw illustrative amounts (USD cents)', { exact: true }).click();
  await expect(economics.getByText('1024100', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tower health' })).toContainText('Good · 86/100');
  await page.getByRole('link', { name: 'All assessments' }).click();
  await page.getByRole('link', { name: /LAX-60214/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(fit.getByRole('status')).toHaveText('Need More Information');
  await expect(fit).toContainText('Structure status: Stale');
  await expect(fit).toContainText('Technical readiness score: Unknown');
  await expect(economics).toContainText('Unknown');
  expect(errors).toEqual([]);
});
