/** Follow the local action workflow and compare exported bytes against the on-screen capture. */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('completes an upgrade, records follow-up, and downloads a matching local TXT preview', async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('link', { name: 'Actions', exact: true }).waitFor();
  page.on('request', request => { if (/^https?:/i.test(request.url())) requests.push(`${request.method()} ${request.url()}`); });
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
  await page.getByRole('button', { name: 'Generate export preview' }).click();
  const preview = page.getByLabel('Captured assessment text');
  await expect(preview).toContainText('Health score: 86/100 (Good)');
  await expect(preview).toContainText('Indicative assessment only');
  const previewText = await preview.textContent();
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download TXT' }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('NYC-10234-baseline-assessment.txt');
  expect(await readFile(await download.path())).toEqual(Buffer.from(previewText, 'utf8'));
  await expect(page.getByText('TXT download initiated.')).toBeVisible();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('button', { name: 'Generate export preview' })).toBeFocused();

  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await page.getByText('Diagnostics', { exact: true }).click();
  const events = page.getByRole('list', { name: 'Recent local events' });
  await expect(events.getByText(/FOLLOW_UP_RECOMMENDED/)).toHaveCount(1);
  await expect(events.getByText(/ASSESSMENT_EXECUTED/)).toHaveCount(1);
  await expect(events.getByText(/ASSESSMENT_EXPORTED.*preview/)).toHaveCount(1);
  await expect(events.getByText(/ASSESSMENT_EXPORTED.*download/)).toHaveCount(1);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
