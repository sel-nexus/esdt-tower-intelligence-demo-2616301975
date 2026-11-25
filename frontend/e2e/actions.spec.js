/** Follow the local action workflow and compare exported bytes against the on-screen capture. */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('completes an upgrade and downloads the captured assessment unchanged after a settings change', async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');
  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  await expect(controls).toBeVisible();
  page.on('request', request => { if (/^https?:/i.test(request.url())) requests.push(`${request.method()} ${request.url()}`); });

  // A missing battery reading supplies a named gap without changing the power-upgrade decision.
  await controls.getByLabel('Tower', { exact: true }).selectOption('NYC-10234');
  await controls.getByLabel('Evidence field').selectOption('condition.battery');
  await controls.getByRole('button', { name: 'Mask evidence' }).click();
  await expect(controls.getByRole('status')).toHaveText('Snapshot revision 2 · Settings version 1');

  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await expect(page).toHaveURL(/#\/actions$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByLabel('Action queue').selectOption('Upgrade Required');
  const actionLink = page.getByRole('link', { name: 'NYC-10234 · Power upgrade' });
  const row = page.getByRole('listitem').filter({ has: actionLink });
  await expect(row.getByRole('status')).toContainText('Progress: Open');
  await row.getByRole('combobox', { name: /Category/ }).selectOption('Improve');
  await expect(row.getByRole('status')).toContainText('Progress: Open');
  await row.getByRole('button', { name: 'Start action' }).click();
  await expect(row.getByRole('status')).toContainText('In Progress');
  await row.getByRole('button', { name: 'Mark Completed' }).click();
  await expect(row.getByRole('status')).toContainText('Completed');
  await expect(row.getByRole('combobox', { name: /Category/ })).toHaveValue('Improve');
  await row.getByRole('button', { name: 'Record recommended follow-up' }).click();
  await expect(page.getByText('Recommended follow-up recorded locally.')).toBeVisible();

  await actionLink.click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  const readiness = page.getByRole('region', { name: 'Colocation readiness' });
  await expect(readiness.getByRole('status')).toContainText('Yes after an upgrade');

  await page.getByRole('button', { name: 'Generate export preview' }).click();
  const preview = page.getByLabel('Captured assessment text');
  await expect(preview).toBeVisible();
  const filename = 'NYC-10234-baseline-assessment.txt';
  const captureLabel = page.getByText(`${filename} · captured revision 2`, { exact: true });
  await expect(captureLabel).toBeVisible();
  const previewText = await preview.textContent();
  const lines = previewText.split('\n');
  expect(lines).toEqual(expect.arrayContaining([
    'ESDT Tower Intelligence — Synthetic assessment',
    'Tower: NYC-10234', 'Scenario: baseline', 'Assessment date (UTC): 2025-03-01T00:00:00Z',
    'Snapshot revision: 2 | Settings version: 1',
    'Health score: Unknown (Unknown)', 'Readiness score: 85/100',
    'Answer: Yes after an upgrade', 'Deciding rule: UPGRADE_FIT',
    'Evidence (synthetic):',
    '- power.headroomKw [NYC-10234:power]: 4 | Current | ESDT-Aligned / Synthetic Capacity Register | observed 2025-02-12 | updated 2025-02-20 | confidence 92% | complete',
    '- condition.battery [NYC-10234:operations]: Unknown | Missing | Tower Owner / Synthetic Field Operations | observed 2025-02-12 | updated 2025-02-20 | confidence 92% | complete | Missing',
    'Recommendation: Complete the power upgrade before adding a tenant, then validate fit.',
    'Indicative assessment only',
  ]));
  const thresholdLabel = 'Effective thresholds: ';
  expect(JSON.parse(lines.find(line => line.startsWith(thresholdLabel)).slice(thresholdLabel.length))).toEqual({
    yes: 85, upgrade: 70, information: 50, powerToleranceKw: 5, staleDays: 365, minConfidence: 60,
    weights: { structure: 30, mounting: 20, space: 15, power: 20, connectivity: 15 },
  });
  expect(previewText).toContain('\nGaps:\n- condition.battery: simulated-missing, Missing\n\n');
  expect(previewText).toContain('\nConstraints:\n- Power shortfall: 4 kW\n\n');
  expect(previewText).toContain('\nRequired validation:\n- Certified structural and site validation before implementation\n\n');

  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await controls.getByRole('spinbutton', { name: /proposed power tolerance/i }).fill('3');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  await expect(controls.getByText('Effective tolerance: 3 kW')).toBeVisible();
  await expect(controls.getByRole('status')).toHaveText('Snapshot revision 3 · Settings version 2');
  await page.goBack();
  await expect(page).toHaveURL(/#\/assessments\/NYC-10234\/growth$/);
  await expect(readiness.getByRole('status')).toHaveText('No');
  await expect(captureLabel).toBeVisible();
  await expect(preview).toBeVisible();
  expect(await preview.textContent()).toBe(previewText);

  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download TXT' }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe(filename);
  expect(await readFile(await download.path())).toEqual(Buffer.from(previewText, 'utf8'));
  await expect(page.getByText('TXT download initiated.')).toBeVisible();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('button', { name: 'Generate export preview' })).toBeFocused();

  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await page.getByText('Diagnostics', { exact: true }).click();
  const events = page.getByRole('list', { name: 'Recent local events' });
  await expect(events.getByText(/FOLLOW_UP_RECOMMENDED/)).toHaveCount(1);
  await expect(events.getByText(/ASSESSMENT_EXECUTED · baseline · NYC-10234/)).toHaveCount(2);
  await expect(events.getByText(/SETTINGS_CHANGED · baseline/)).toHaveCount(1);
  const exports = events.getByRole('listitem').filter({ hasText: 'ASSESSMENT_EXPORTED' });
  await expect(exports).toHaveCount(2);
  await expect(exports.nth(0)).toContainText('ASSESSMENT_EXPORTED · baseline · NYC-10234 · download');
  await expect(exports.nth(1)).toContainText('ASSESSMENT_EXPORTED · baseline · NYC-10234 · preview');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
