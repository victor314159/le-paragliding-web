import { defineConfig } from '@playwright/test';

// The compiled packages: each file rebuilds build/<name>/ and its
// dependencies (scripts/assemble-package.sh), so one file at a time.
const PACKAGES = /\/package\.spec\.ts$/;
// The real browser computations: each engine starts above 1 GiB.
const COMPUTE = /\/(compute|previews|oracle)\.spec\.ts$/;

export default defineConfig({
  testDir: '.',
  outputDir: '../build/test-results',
  // Every test opens its own page or engine: the tests of a file are independent.
  fullyParallel: true,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  projects: [
    { name: 'packages', testMatch: PACKAGES, fullyParallel: false, workers: 1 },
    { name: 'compute', testMatch: COMPUTE, workers: 2 },
    { name: 'main', testIgnore: [PACKAGES, COMPUTE] },
  ],
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
    // Material then skips its animations: overlays open and close at once.
    contextOptions: { reducedMotion: 'reduce' },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
