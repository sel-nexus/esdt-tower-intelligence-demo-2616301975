/** Exercise facilitator changes through the standalone browser UI. */
import { expect, test } from '@playwright/test';

test('switches, masks, applies settings and recovers the synthetic baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
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

test('reclassifies health on battery mask and keeps scenario, mask and restore audit after reset', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');

  const summary = page.getByRole('region', { name: 'Active scenario summary' });
  const health = summary.getByRole('figure', { name: 'Health distribution' });
  const good = count => health.getByRole('button', { name: `Health distribution: Good, ${count}`, exact: true });
  const unknown = count => health.getByRole('button', { name: `Health distribution: Unknown, ${count}`, exact: true });
  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  const actions = page.getByRole('link', { name: 'Actions', exact: true });
  const portfolio = page.getByRole('link', { name: 'Portfolio', exact: true });
  const diagnostics = page.getByText('Diagnostics', { exact: true });
  const events = page.getByRole('list', { name: 'Recent local events' }).getByRole('listitem');
  const switchEvent = events.filter({ hasText: 'SCENARIO_CHANGED · energy-pressure' });
  const evidenceEvents = events.filter({ hasText: 'EVIDENCE_MASK_CHANGED · energy-pressure · NYC-10234' });

  await controls.getByLabel('Scenario', { exact: true }).selectOption('energy-pressure');
  await expect(summary).toContainText('Energy pressure · 2025-03-15');
  await expect(good(12)).toBeVisible();
  await expect(unknown(0)).toBeVisible();
  await actions.click();
  await diagnostics.click();
  await expect(switchEvent).toBeVisible();
  await expect(evidenceEvents).toHaveCount(0);

  await portfolio.click();
  await controls.getByLabel('Tower', { exact: true }).selectOption('NYC-10234');
  await controls.getByLabel('Evidence field').selectOption('condition.battery');
  await expect(controls.getByText('Effective input: fair', { exact: true })).toBeVisible();
  await controls.getByRole('button', { name: 'Mask evidence' }).click();
  await expect(controls.getByText('Effective input: Unknown (simulated missing)', { exact: true })).toBeVisible();
  await expect(good(11)).toBeVisible();
  await expect(unknown(1)).toBeVisible();
  await actions.click();
  await diagnostics.click();
  await expect(evidenceEvents).toHaveCount(1);
  await expect(evidenceEvents).toBeVisible();
  const maskEvent = await evidenceEvents.innerText();

  await portfolio.click();
  await controls.getByLabel('Tower', { exact: true }).selectOption('NYC-10234');
  await controls.getByLabel('Evidence field').selectOption('condition.battery');
  await controls.getByRole('button', { name: 'Restore evidence' }).click();
  await expect(controls.getByText('Effective input: fair', { exact: true })).toBeVisible();
  await expect(good(12)).toBeVisible();
  await expect(unknown(0)).toBeVisible();
  await actions.click();
  await diagnostics.click();
  await expect(switchEvent).toBeVisible();
  await expect(evidenceEvents).toHaveCount(2);
  await expect(evidenceEvents.first()).toBeVisible();
  await expect(evidenceEvents.last()).toHaveText(maskEvent);
  const restoreEvent = await evidenceEvents.first().innerText();
  expect(restoreEvent).not.toBe(maskEvent);
  const scenarioEvent = await switchEvent.innerText();

  await page.getByRole('button', { name: 'Reset workshop' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio scenario' })).toBeFocused();
  await expect(summary).toContainText('Baseline · 2025-03-01');
  await expect(good(12)).toBeVisible();
  await expect(unknown(0)).toBeVisible();
  await actions.click();
  await diagnostics.click();
  await expect(events.first()).toContainText('PORTFOLIO_RESET · baseline');
  await expect(events.first()).toBeVisible();
  await expect(switchEvent).toHaveText(scenarioEvent);
  await expect(switchEvent).toBeVisible();
  await expect(evidenceEvents).toHaveText([restoreEvent, maskEvent]);
  await expect(evidenceEvents.first()).toBeVisible();
  await expect(evidenceEvents.last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('discards unstaged changes on a same-route workshop reset even at baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/#/portfolio');

  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  const tolerance = controls.getByRole('spinbutton', { name: /proposed power tolerance/i });
  const tower = controls.getByLabel('Tower', { exact: true });
  const evidence = controls.getByLabel('Evidence field');
  await tolerance.fill('3');
  await tower.selectOption('DAL-20451');
  await evidence.selectOption('structure.status');
  await expect(tolerance).toHaveValue('3');
  await expect(tower).toHaveValue('DAL-20451');
  await expect(evidence).toHaveValue('structure.status');
  await expect(controls.getByText('Effective tolerance: 5 kW')).toBeVisible();

  await page.getByRole('button', { name: 'Reset workshop' }).click();

  await expect(page).toHaveURL(/#\/portfolio$/);
  await expect(controls.getByRole('status')).toHaveText('Snapshot revision 1 · Settings version 1 · No effective change.');
  await expect(tolerance).toHaveValue('5');
  await expect(tower).toHaveValue('NYC-10234');
  await expect(evidence).toHaveValue('power.headroomKw');
  expect(errors).toEqual([]);
});

test('changes NYC growth and queue membership at 3 kW, then restores both at baseline', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('esdt.demo.session.v1', '{"v":1,"signedIn":true}'));
  await page.goto('/');

  const controls = page.getByRole('region', { name: 'Facilitator controls' });
  const tolerance = controls.getByRole('spinbutton', { name: /proposed power tolerance/i });
  const portfolio = page.getByRole('link', { name: 'Portfolio', exact: true });
  const actions = page.getByRole('link', { name: 'Actions', exact: true });
  const queue = page.getByRole('region', { name: 'Priority queue' });
  const nycUpgrade = queue.getByRole('link', { name: 'NYC-10234 · Power upgrade', exact: true });
  const readiness = page.getByRole('region', { name: 'Colocation readiness' }).getByRole('status');

  await expect(controls.getByText('Effective tolerance: 5 kW')).toBeVisible();
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(nycUpgrade).toBeVisible();
  await nycUpgrade.click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NYC-10234');
  await expect(readiness).toHaveText('Yes after an upgrade');

  await portfolio.click();
  await tolerance.fill('3');
  await controls.getByRole('button', { name: 'Apply settings' }).click();
  await expect(controls.getByText('Effective tolerance: 3 kW')).toBeVisible();
  await expect(controls.getByText('Effective input: 4', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search towers' });
  await search.fill('NYC-10234');
  await page.getByRole('list', { name: 'Tower search results' }).getByRole('link', { name: /NYC-10234/ }).click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NYC-10234');
  await expect(readiness).toHaveText('No');
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(queue.getByRole('status').filter({ hasText: 'Baseline · 1 action in Upgrade Required.' })).toBeVisible();
  await expect(queue.getByRole('link', { name: /^ATL-30492/ })).toBeVisible();
  await expect(queue.getByRole('link', { name: /^NYC-10234/ })).toHaveCount(0);

  await portfolio.click();
  await controls.getByRole('button', { name: 'Reset baseline' }).click();
  await expect(controls.getByText('Effective tolerance: 5 kW')).toBeVisible();
  await actions.click();
  await queue.getByLabel('Action queue').selectOption('Upgrade Required');
  await expect(nycUpgrade).toBeVisible();
  await nycUpgrade.click();
  await page.getByRole('link', { name: 'Growth', exact: true }).click();
  await expect(readiness).toHaveText('Yes after an upgrade');
  expect(errors).toEqual([]);
});
