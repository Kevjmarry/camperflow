import { test, expect } from '@playwright/test';

// Authenticated staff smoke tests — all skipped until auth is wired up.
// TODO: implement tests/e2e/fixtures/auth.setup.ts with Supabase test credentials,
//       then uncomment the staff-setup and staff projects in playwright.config.ts.
// See: https://playwright.dev/docs/auth

const LOCALE = 'en';
const AUTH_TODO = 'TODO: requires auth — implement tests/e2e/fixtures/auth.setup.ts';

test('staff operations loads after auth setup', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/operations`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('bookings page loads', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/bookings`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('vehicles page loads', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/vehicles`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('checklists page loads', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/checklists`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('company settings page loads', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/company`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('pricing/billing page loads', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/settings/billing`);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('main navigation renders', async ({ page }) => {
  test.skip(true, AUTH_TODO);
  await page.goto(`/${LOCALE}/staff/operations`);
  await expect(page.locator('nav.staff-top-nav')).toBeVisible();
  await expect(page.getByRole('link', { name: /bookings/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /vehicles/i })).toBeVisible();
});
