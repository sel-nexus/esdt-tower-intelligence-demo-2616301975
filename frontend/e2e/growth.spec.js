/** Exercise the Growth tab using the same assessment links as workshop users. */
import { expect, test } from '@playwright/test';

test('follows assessment links to Growth, compares conditional fit and evidence gaps, and returns to Overview', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
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
  await expect(fit).toContainText('Complete the power upgrade before adding a tenant, then validate fit.');
  await expect(fit).toContainText('Certified structural and site validation');
  await expect(page.getByText(/Indicative assessment only/)).toBeVisible();
  await fit.getByText('Deciding rule and score breakdown', { exact: true }).click();
  await expect(fit.getByText('UPGRADE_FIT', { exact: true })).toBeVisible();
  for (const [label, value] of [
    ['Power headroom', '4 kW'], ['Required power', '8 kW'],
    ['Estimated power headroom after upgrade', '12 kW'], ['Power shortfall tolerance', '5 kW'],
  ]) {
    await expect(fit.getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible();
  }
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

test('compares Dallas current fit with Chicago hard blockers and shows the effective decision inputs', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  await page.getByRole('link', { name: /DAL-20451/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page).toHaveURL(/#\/assessments\/DAL-20451\/growth$/);

  const fit = page.getByRole('region', { name: 'Colocation readiness' });
  const breakdown = fit.getByText('Deciding rule and score breakdown', { exact: true });
  await expect(fit.getByRole('status')).toHaveText('Yes');
  await expect(fit).toContainText('Validate the proposed additional tenant against the current site configuration.');
  await expect(fit).toContainText('Certified structural and site validation');
  await expect(fit).toContainText('Technical readiness score: 98/100');
  await breakdown.click();
  await expect(fit.getByText('CURRENT_FIT', { exact: true })).toBeVisible();
  for (const [label, value] of [
    ['Power headroom', '14 kW'], ['Required power', '8 kW'],
    ['Free cabinet units', '3'], ['Required cabinet units', '2'],
    ['Score cutoffs (yes / upgrade / information)', '85 / 70 / 50'],
  ]) {
    await expect(fit.getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible();
  }

  await page.getByRole('link', { name: 'All assessments' }).click();
  await page.getByRole('link', { name: /CHI-40117/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page).toHaveURL(/#\/assessments\/CHI-40117\/growth$/);
  await expect(fit.getByRole('status')).toHaveText('No');
  await expect(fit.getByText('Confirmed structural failure', { exact: true })).toBeVisible();
  await expect(fit.getByText('No free mount', { exact: true })).toBeVisible();
  await expect(fit.getByText('Power shortfall: 6 kW', { exact: true })).toBeVisible();
  await breakdown.click();
  await expect(fit.getByText('HARD_BLOCKER', { exact: true })).toBeVisible();
  for (const [label, value] of [
    ['Power headroom', '2 kW'], ['Required power', '8 kW'], ['Power shortfall tolerance', '5 kW'],
  ]) {
    await expect(fit.getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
