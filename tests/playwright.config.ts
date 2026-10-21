import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../build/test-results',
  // Each engine starts above 1 GiB. Exercise one real browser computation at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  // The release build (`docker build --output dist .`), as deployed.
  webServer: {
    command: 'http-server dist -p 8080 -c-1 -s',
    cwd: '..',
    url: 'http://localhost:8080',
  },
  use: {
    // localhost is a secure context (crypto.subtle), like the https site.
    baseURL: 'http://localhost:8080',
    browserName: 'chromium',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
