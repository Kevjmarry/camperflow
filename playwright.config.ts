import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Guest tests — no auth needed
    {
      name: 'guest',
      testMatch: '**/flows/guest*.spec.ts',
    },

    // Staff auth setup — uncomment in batch 2 when auth is implemented
    // {
    //   name: 'staff-setup',
    //   testMatch: '**/fixtures/auth.setup.ts',
    // },

    // Staff tests — uncomment in batch 2 once auth.setup.ts is implemented
    // {
    //   name: 'staff',
    //   testMatch: '**/flows/!(guest)*.spec.ts',
    //   dependencies: ['staff-setup'],
    //   use: {
    //     storageState: 'tests/e2e/.auth/staff.json',
    //   },
    // },
  ],
});
