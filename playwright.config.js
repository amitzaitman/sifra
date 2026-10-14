// Playwright (architecture 4.5): Chromium as a Pixel 7 and WebKit as an iPhone 13. In this
// container only Chromium is installed: npm run e2e -- --project=chromium.
//
// Each run starts its own server and never reuses one: a server already on the port may belong to
// another worktree and serve its files. When the port is taken the run fails; pick another with
// SIFRA_PORT=4174 npx playwright test.
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.SIFRA_PORT ?? 4173);
const url = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: url,
    trace: 'retain-on-failure',
    timezoneId: 'Asia/Jerusalem',
    locale: 'he-IL',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `node start.js ${port}`,
    url,
    reuseExistingServer: false,
  },
});
