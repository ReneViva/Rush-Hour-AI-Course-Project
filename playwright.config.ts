import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  outputDir: './reports/browser',
  fullyParallel: false,
  workers: 2,
  timeout: 35_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4176',
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.RUSH_BROWSER_PATH ? { executablePath: process.env.RUSH_BROWSER_PATH } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/serve-build.mjs 4176',
    url: 'http://127.0.0.1:4176/',
  },
});
