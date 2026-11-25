/** Exercise public workshop entry, browser persistence and isolated intake in the running app. */
import { expect, test } from '@playwright/test';

const sessionKey = 'esdt.demo.session.v1';
const samplesKey = 'esdt.demo.samples.v1';
const credentialsKey = 'esdt.demo.credentials.v1';
const text = '<strong>Synthetic workshop only</strong>\n\tNYC-10234: illustrative practice note.';

/** Attach browser error observers before navigation. */
function browserErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/** Enter the public demo pair using the actual form. */
async function enter(page) {
  await page.getByLabel('Username').fill('tower-demo');
  await page.getByLabel('Password').fill('synthetic-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeFocused();
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
  const gate = page.getByRole('heading', { name: 'Sign in to Tower Intelligence' });
  await expect(gate).toBeFocused();
  await expect(page).toHaveURL(/#\/sign-in$/);
  await expect(page.getByRole('navigation', { name: 'Workshop' })).toHaveCount(0);
  const requests = [];
  const capture = request => { if (/^https?:/i.test(request.url())) requests.push(`${request.method()} ${request.url()}`); };
  page.on('request', capture);

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the exact demo username and password');
  await page.getByLabel('Username').fill('tower-demo');
  await page.getByLabel('Password').fill('synthetic-only ');
  await page.getByLabel('Password').press('Enter');
  await expect(gate).toBeVisible();
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
  await save.click();
  const retained = page.getByRole('list', { name: 'Retained samples' });
  await expect(retained.getByRole('heading', { name: 'practice.TXT' })).toBeVisible();
  expect(await retained.locator('pre').textContent()).toBe(text);
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
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([credentialsKey, samplesKey, sessionKey].sort());
  const tab = await context.newPage();
  const tabErrors = browserErrors(tab);
  await tab.goto('/#/samples');
  await expect(tab.getByRole('heading', { name: 'Synthetic samples' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(gate).toBeVisible();
  await expect(tab.getByRole('heading', { name: 'Sign in to Tower Intelligence' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([credentialsKey, samplesKey].sort());
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
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('alert')).toContainText('Reloading may restore it');
  await expect(page.getByRole('navigation', { name: 'Workshop' })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).not.toBeNull();
  await page.getByRole('button', { name: 'Retry Sign Out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Tower Intelligence' })).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), samplesKey)).toBe(stored);
  expect(errors).toEqual([]);
});
