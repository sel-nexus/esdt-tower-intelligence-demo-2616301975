/** Follow the assessment links and simulated alert workflow in the workshop. */
import { expect, test } from '@playwright/test';

test('shows inspection work and keeps Chicago health, corrosion alert and remediation progress independent through reset', async ({ page }) => {
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
  const corrosion = alerts.getByRole('listitem').filter({ hasText: 'Severe corrosion observed.' });
  const corrosionStatus = corrosion.getByRole('status');
  await expect(corrosionStatus).toHaveText('Alert status: Open');
  await expect(corrosion.getByRole('button', { name: /close alert: severe corrosion/i })).toHaveCount(0);

  const actionsLink = page.getByRole('link', { name: 'Actions', exact: true });
  const queue = page.getByLabel('Action queue');
  await actionsLink.click();
  await queue.selectOption('Inspection Due');
  const inspectionLink = page.getByRole('link', { name: 'CHI-40117 · Inspection', exact: true });
  const inspectionRow = page.getByRole('listitem').filter({ has: inspectionLink });
  await expect(inspectionRow).toContainText('Why this is queued: Inspection has expired.');
  await expect(inspectionRow).toContainText('Severity: High · Due: 2024-12-14');
  await expect(inspectionRow).toContainText('Recommended next step: Schedule a new inspection.');
  await expect(page.getByRole('link', { name: 'CHI-40117 · Remediation', exact: true })).toHaveCount(0);
  await inspectionLink.click();
  await expect(health).toContainText('Latest inspection: 2023-12-15 · Expired · Expiry: 2024-12-14');

  await actionsLink.click();
  await queue.selectOption('Critical Sites');
  const remediationLink = page.getByRole('link', { name: 'CHI-40117 · Remediation', exact: true });
  const remediation = page.getByRole('listitem').filter({ has: remediationLink });
  const progress = remediation.getByRole('status');
  await expect(remediation).toContainText('Why this is queued: Severe corrosion observed.');
  await expect(progress).toHaveText('Progress: Open · Alert status: Open');
  await remediation.getByRole('button', { name: 'Start action' }).click();
  await expect(progress).toHaveText('Progress: In Progress · Alert status: Open');

  await remediationLink.click();
  await expect(corrosionStatus).toHaveText('Alert status: Open');
  await corrosion.getByRole('button', { name: /acknowledge alert: severe corrosion/i }).click();
  await expect(corrosion.getByText('Alert status: Acknowledged')).toBeVisible();
  await corrosion.getByRole('button', { name: /close alert: severe corrosion/i }).click();
  await expect(corrosion.getByText('Alert status: Closed')).toBeFocused();
  await expect(health).toContainText('Critical · 53/100');
  await expect(findings).toContainText('Severe corrosion observed.');

  await actionsLink.click();
  await queue.selectOption('Critical Sites');
  await expect(progress).toHaveText('Progress: In Progress · Alert status: Closed');
  await remediation.getByRole('button', { name: 'Mark Completed' }).click();
  await expect(progress).toHaveText('Progress: Completed · Alert status: Closed');

  const diagnostics = page.getByText('Diagnostics', { exact: true });
  const events = page.getByRole('list', { name: 'Recent local events' });
  const workflowEvents = events.getByRole('listitem').filter({ hasText: /(?:ACTION_STATUS_CHANGED · baseline · CHI-40117:remediation|ALERT_STATUS_CHANGED · baseline · CHI-40117:corrosion)/ });
  await diagnostics.click();
  await expect(events).toBeVisible();
  await expect(workflowEvents).toHaveText([
    /ACTION_STATUS_CHANGED · baseline · CHI-40117:remediation · In Progress → Completed/,
    /ALERT_STATUS_CHANGED · baseline · CHI-40117:corrosion · Acknowledged → Closed/,
    /ALERT_STATUS_CHANGED · baseline · CHI-40117:corrosion · Open → Acknowledged/,
    /ACTION_STATUS_CHANGED · baseline · CHI-40117:remediation · Open → In Progress/,
  ]);
  const beforeReset = await workflowEvents.allTextContents();

  await page.getByRole('button', { name: 'Reset workshop' }).click();
  await expect(page).toHaveURL(/#\/portfolio$/);
  await actionsLink.click();
  await queue.selectOption('Critical Sites');
  await expect(progress).toHaveText('Progress: Open · Alert status: Open');
  await diagnostics.click();
  await expect(events).toBeVisible();
  await expect(events.getByText(/PORTFOLIO_RESET · baseline/)).toHaveCount(1);
  await expect(workflowEvents).toHaveText(beforeReset);

  await remediationLink.click();
  await expect(corrosionStatus).toHaveText('Alert status: Open');
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
