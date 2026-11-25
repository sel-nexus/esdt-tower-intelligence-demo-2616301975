/** Capture representative workshop screens from an already running static preview. */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173';
const out = 'test-results/visual';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const page = await browser.newPage({ viewport });
    await page.goto(base);
    const captures = [];
    await page.getByRole('button', { name: 'Portfolio Manager', exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${name}-entry.png` });
    captures.push({ state: 'persona entry', tree: await page.locator('body').ariaSnapshot(), styles: await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, width: document.body.scrollWidth, viewport: innerWidth })), html: await page.content() });
    await page.getByRole('button', { name: 'Portfolio Manager', exact: true }).click();
    for (const [state, link] of [['portfolio', null], ['map', 'Tower Map']]) {
      if (link) await page.getByRole('navigation', { name: 'Workshop' }).getByRole('link', { name: link, exact: true }).click();
      await page.getByRole('heading', { level: 1, name: state === 'portfolio' ? /portfolio/i : /tower map/i }).waitFor();
      await page.screenshot({ path: `${out}/${name}-${state}.png` });
      captures.push({ state, tree: await page.locator('body').ariaSnapshot(), styles: await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, width: document.body.scrollWidth, viewport: innerWidth })), html: await page.content() });
    }
    await page.getByRole('navigation', { name: 'Workshop' }).getByRole('link', { name: 'Portfolio', exact: true }).click();
    const controls = page.getByRole('region', { name: 'Facilitator controls' });
    await controls.getByRole('spinbutton', { name: /proposed power tolerance/i }).fill('-1');
    await controls.getByRole('button', { name: 'Apply settings' }).click();
    await controls.getByRole('alert').waitFor();
    await controls.screenshot({ path: `${out}/${name}-controls-error.png` });
    captures.push({ state: 'invalid tolerance', tree: await controls.ariaSnapshot(), styles: await controls.evaluate(el => ({ font: getComputedStyle(el).fontFamily, width: el.scrollWidth })), html: await controls.innerHTML() });
    await writeFile(`${out}/${name}.txt`, captures.map(({ state, tree, styles, html }) => `${state}\n${JSON.stringify(styles)}\n${tree}\n\n${html}`).join('\n\n'));
    await page.close();
  }
} finally {
  await browser.close();
}
