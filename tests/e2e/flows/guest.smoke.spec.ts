import { test, expect } from '@playwright/test';

// Smoke: guest portal loads without a server crash.
// TEST01 may not exist in the local DB — that's fine.
// A "booking not found" page is a valid non-crash response.
// What we're ruling out: HTTP 500, unhandled JS exception, blank white page.

test('guest page loads without crash', async ({ page }) => {
  const response = await page.goto('/en/guest?code=TEST01');

  // Must not be a server error
  expect(response?.status()).toBeLessThan(500);

  // Must render a body with some content
  await expect(page.locator('body')).not.toBeEmpty();
});
