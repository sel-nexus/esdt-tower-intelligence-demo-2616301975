/** Exercise public workshop entry, browser persistence and isolated intake in the running app. */
import { expect, test } from '@playwright/test';

const sessionKey = 'esdt.demo.session.v1';
const samplesKey = 'esdt.demo.samples.v1';
const text = '<strong>Synthetic workshop only</strong>\n\tNYC-10234: illustrative practice note.';

/** Attach browser error observers before navigation. */
function browserErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/** Enter through the role picker and observe the initial focus handoff. */
async function enter(page) {
  await page.getByRole('button', { name: 'Portfolio Manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeFocused();
}

/** Close the workshop through its role disclosure. */
async function exit(page) {
  await page.locator('summary').filter({ hasText: 'Demo role' }).click();
  await page.getByRole('button', { name: 'Exit workshop' }).click();
}

/** Capture decision outputs that must remain identical across intake changes. */
async function fingerprint(page) {
  await page.getByRole('navigation', { name: 'Workshop' }).getByRole('link', { name: 'Actions' }).click();
  await page.getByLabel('Action queue').selectOption('Upgrade Required');
  const queue = page.getByRole('region', { name: 'Priority queue' });
  const nyc = queue.getByRole('link', { name: 'NYC-10234 · Power upgrade' });
  await expect(nyc).toBeVisible();
  const rank = await queue.getByRole('link').allTextContents();
  await nyc.click();
  const health = page.getByRole('region', { name: 'Tower health' });
  await expect(health).toContainText('Good · 86/100');
  return { rank, health: await health.innerText() };
}

test('enters from signed out, keeps literal samples across reset and reload, and signs out another tab', async ({ page, context }) => {
  const errors = browserErrors(page);
  await page.goto('/#/samples');
  const gate = page.getByRole('heading', { name: 'Choose a demo role' });
  await expect(gate).toBeFocused();
  await expect(page).toHaveURL(/#\/personas$/);
  await expect(page.getByRole('navigation', { name: 'Workshop' })).toHaveCount(0);
  const requests = [];
  const capture = request => {
    if (!/^https?:/i.test(request.url())) return;
    // Chromium can revalidate the public icon on hash navigation; no workflow data is sent.
    const icon = new URL('/favicon.svg', page.url()).href;
    if (request.method() === 'GET' && request.resourceType() === 'other' && request.url() === icon) return;
    requests.push(`${request.method()} ${request.url()}`);
  };
  page.on('request', capture);

  await expect(page.getByLabel('Password')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);

  await enter(page);
  const before = await fingerprint(page);
  await page.getByRole('link', { name: 'Samples', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic samples' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Samples', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Download synthetic-workshop-example.txt' })).toHaveAttribute('download', '');
  const chooser = page.getByLabel('Choose Synthetic File');
  const save = page.getByRole('button', { name: 'Extract and Save' });
  await chooser.setInputFiles({ name: 'fiction.csv', mimeType: 'text/plain', buffer: Buffer.from('fiction') });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Only plain text is supported');
  await chooser.setInputFiles({ name: 'malformed.txt', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]) });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('could not be read as UTF-8 plain text');
  expect(await page.evaluate(key => localStorage.getItem(key), samplesKey)).toBeNull();
  await chooser.setInputFiles({ name: 'practice.TXT', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.getByText('No retained samples yet.')).toBeVisible();
  // Hold delivery of this File's native bytes, not decoding, rendering, or storage.
  const releaseRead = await chooser.evaluateHandle(input => {
    const file = input.files[0];
    const nativeRead = file.arrayBuffer.bind(file);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    file.arrayBuffer = async () => {
      const bytes = await nativeRead();
      await gate;
      return bytes;
    };
    return release;
  });
  const intakeStatus = page.getByRole('region', { name: 'Extract a sample' }).getByRole('status');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(intakeStatus).toHaveText('Reading synthetic sample…');
  await expect(save).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), samplesKey)).toBeNull();
  await releaseRead.evaluate(release => release());
  await releaseRead.dispose();
  await expect(intakeStatus).toHaveText('Synthetic sample saved on this browser.');
  const retained = page.getByRole('list', { name: 'Retained samples' });
  await expect(retained.getByRole('listitem')).toHaveCount(1);
  await expect(retained.getByRole('heading', { name: 'practice.TXT' })).toBeVisible();
  expect(await retained.locator('pre').textContent()).toBe(text);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), samplesKey);
  expect(stored).toEqual({ v: 1, records: [expect.objectContaining({ name: 'practice.TXT', text })] });
  await expect(retained.locator('pre strong')).toHaveCount(0);
  expect(await fingerprint(page)).toEqual(before);
  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await page.getByText('Diagnostics', { exact: true }).click();
  const events = page.getByRole('list', { name: 'Recent local events' });
  await expect(events.getByRole('listitem')).toHaveCount(2);
  await expect(events.getByText(/ASSESSMENT_EXECUTED/)).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset workshop' }).click();
  expect(requests).toEqual([]);
  page.off('request', capture);

  await page.getByRole('link', { name: 'Samples', exact: true }).click();
  await page.reload();
  await expect(retained.getByRole('heading', { name: 'practice.TXT' })).toBeVisible();
  expect(await retained.locator('pre').textContent()).toBe(text);
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([samplesKey, sessionKey].sort());
  const tab = await context.newPage();
  const tabErrors = browserErrors(tab);
  await tab.goto('/#/samples');
  await expect(tab.getByRole('heading', { name: 'Synthetic samples' })).toBeVisible();
  await exit(page);
  await expect(gate).toBeVisible();
  await expect(tab.getByRole('heading', { name: 'Choose a demo role' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([samplesKey]);
  await enter(page);
  await page.getByRole('link', { name: 'Samples', exact: true }).click();
  await retained.getByRole('button', { name: 'Remove sample practice.TXT' }).click();
  await expect(page.getByText('No retained samples yet.')).toBeVisible();
  expect(errors).toEqual([]);
  expect(tabErrors).toEqual([]);
});

test('retains a successful sample when a later save fails and retries a blocked sign-out', async ({ page }) => {
  const errors = browserErrors(page);
  await page.goto('/');
  await enter(page);
  await page.getByRole('link', { name: 'Samples', exact: true }).click();
  const chooser = page.getByLabel('Choose Synthetic File');
  const save = page.getByRole('button', { name: 'Extract and Save' });
  await chooser.setInputFiles({ name: 'first.txt', mimeType: '', buffer: Buffer.from(text) });
  await save.click();
  await expect(page.getByText('Synthetic sample saved on this browser.')).toBeVisible();
  const stored = await page.evaluate(key => localStorage.getItem(key), samplesKey);
  // Inject targeted browser storage exceptions; keep the rest of the real app and storage intact.
  await page.evaluate(({ samplesKey, sessionKey }) => {
    const write = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === samplesKey) throw new DOMException('Storage full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
    let blockOnce = true;
    Storage.prototype.removeItem = function (key) {
      if (key === sessionKey && blockOnce) {
        blockOnce = false;
        throw new DOMException('Storage blocked', 'SecurityError');
      }
      return remove.call(this, key);
    };
  }, { samplesKey, sessionKey });
  await chooser.setInputFiles({ name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('Another fictitious note.') });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Previously retained samples are unchanged');
  await expect(page.getByRole('heading', { name: 'second.txt' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), samplesKey)).toBe(stored);
  await exit(page);
  await expect(page.getByRole('alert')).toContainText('Reloading may restore it');
  await expect(page.getByRole('navigation', { name: 'Workshop' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).not.toBeNull();
  await page.getByRole('button', { name: 'Retry exit' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a demo role' })).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), samplesKey)).toBe(stored);
  expect(errors).toEqual([]);
});
