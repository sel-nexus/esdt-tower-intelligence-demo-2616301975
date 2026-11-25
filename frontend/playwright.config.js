/** Run browser journeys against a dedicated local workshop server. */
import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, channel: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort',
    url: baseURL,
    timeout: 30_000,
  },
});
