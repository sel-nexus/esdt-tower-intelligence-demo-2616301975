/** Verify the workshop entry and sidebar-free role switching in the running app. */
import { expect, test } from '@playwright/test';

/** Capture failures from app scripts and browser console. */
function observeErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/** Pick a new perspective from the current role disclosure. */
async function switchRole(page, name) {
  await page.locator('summary').filter({ hasText: 'Demo role' }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

for (const [role, view, queue] of [
  ['Portfolio Manager', 'Portfolio scenario'],
  ['Asset Manager', 'Assessments'],
  ['Colocation / Commercial Manager', 'Actions', 'Growth Opportunities'],
  ['Operations Manager', 'Actions', 'Critical Sites'],
  ['Demonstration Facilitator', 'Portfolio scenario'],
]) {
  test(`${role} enters the workshop in one selection`, async ({ page }) => {
    const errors = observeErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choose a demo role' })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Demo roles' }).getByRole('button')).toHaveCount(5);
    await page.getByRole('button', { name: role, exact: true }).click();
    await expect(page.getByRole('heading', { name: view, level: 1 })).toBeFocused();
    await expect(page.locator('summary').filter({ hasText: 'Demo role' })).toContainText(role);
    if (queue) {
      await expect(page.getByLabel('Action queue')).toHaveValue(queue);
      const item = queue === 'Critical Sites' ? /CHI-40117/ : /NYC-10234/;
      await expect(page.getByRole('region', { name: 'Priority queue' }).getByRole('link', { name: item }).first()).toBeVisible();
    } else if (role === 'Asset Manager') {
      await expect(page.getByRole('main').getByRole('link', { name: /NYC-10234/ })).toBeVisible();
    } else {
      await expect(page.getByRole('region', { name: 'Active scenario summary' })).toBeVisible();
      if (role === 'Demonstration Facilitator') await expect(page.getByRole('region', { name: 'Facilitator controls' })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('mobile keyboard entry and role switches keep the active override, search, and workflow', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const entry = page.getByRole('button', { name: 'Demonstration Facilitator' });
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('Tab');
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeFocused();
  const scenario = page.getByLabel('Active scenario', { exact: true });
  await scenario.selectOption('energy-pressure');
  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  await controls.getByRole('spinbutton', { name: /proposed power tolerance/i }).fill('3');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  const search = page.getByRole('searchbox', { name: 'Search towers' });
  await search.fill('Chicago');
  await search.press('Escape');
  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  await page.getByText('Filters · 0 selected', { exact: true }).click();
  await page.getByRole('group', { name: 'Health', exact: true }).getByRole('checkbox', { name: 'Critical' }).check();
  await switchRole(page, 'Operations Manager');
  const queue = page.getByRole('region', { name: 'Priority queue' });
  const remediation = queue.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'CHI-40117 · Remediation' }) });
  await remediation.getByRole('button', { name: 'Start action' }).click();
  await switchRole(page, 'Demonstration Facilitator');
  await expect(scenario).toHaveValue('energy-pressure');
  await expect(search).toHaveValue('Chicago');
  await expect(controls.getByText('Effective tolerance: 3 kW')).toBeVisible();
  await switchRole(page, 'Operations Manager');
  await expect(remediation.getByText(/Progress: In Progress/)).toBeVisible();
  await page.getByRole('link', { name: 'Tower Map', exact: true }).click();
  await page.getByText('Filters · 1 selected', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Health', exact: true }).getByRole('checkbox', { name: 'Critical' })).toBeChecked();
  expect(errors).toEqual([]);
});
