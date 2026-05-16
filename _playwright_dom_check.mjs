import { chromium } from 'playwright';

const BOOKING_ID = 'a51ea259-2df5-4fd0-9f4b-5fe0940c16d6';
const SUPABASE_URL = 'https://wcagbocahogggzxpkhnr.supabase.co';
const PROJECT_REF = 'wcagbocahogggzxpkhnr';
const MAGIC_LINK = 'https://wcagbocahogggzxpkhnr.supabase.co/auth/v1/verify?token=bdbbec4665a5fcae0d8964d29f4ea457ed2525baa6a28aec60450629&type=magiclink&redirect_to=https://app.camperflow.io';

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Step 1: navigate the magic link in a temporary context to capture the session
  const captureCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const capturePage = await captureCtx.newPage();

  let capturedFragment = null;
  capturePage.on('response', async (response) => {
    // capture any redirect that contains access_token
    const loc = response.headers()['location'] || '';
    if (loc.includes('access_token')) capturedFragment = loc;
  });

  // Navigate and wait for redirect to production app (which will have the tokens)
  try {
    await capturePage.goto(MAGIC_LINK, { waitUntil: 'commit', timeout: 15000 });
  } catch { /* navigation error expected — app.camperflow.io might not load */ }

  const finalUrl = capturePage.url();
  console.log('Magic link redirected to:', finalUrl);

  // Parse access_token/refresh_token from the fragment of the final URL
  const hashStr = finalUrl.includes('#') ? finalUrl.split('#')[1] : '';
  const params = new URLSearchParams(hashStr);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  console.log('access_token captured:', accessToken ? accessToken.substring(0, 30) + '...' : 'NOT FOUND');
  console.log('refresh_token captured:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'NOT FOUND');

  await captureCtx.close();

  if (!accessToken) {
    console.error('\nCould not capture session tokens from magic link redirect.');
    console.log('Will try navigating unauthenticated to see if page is accessible...');
  }

  // Step 2: Create a fresh context for localhost:3000, inject the session
  const devCtx = await browser.newContext();
  const devPage = await devCtx.newPage();

  if (accessToken) {
    // Navigate to a blank page on localhost first to set localStorage for that origin
    await devPage.goto('http://localhost:3000', { waitUntil: 'commit', timeout: 10000 }).catch(() => {});
    const lsKey = `sb-${PROJECT_REF}-auth-token`;
    const sessionObj = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { email: 'kevjmarry@gmail.com' },
    };
    await devPage.evaluate(([key, val]) => localStorage.setItem(key, JSON.stringify(val)), [lsKey, sessionObj]);
    console.log('\nInjected session into localhost:3000 localStorage under key:', lsKey);
  }

  // Step 3: Navigate to the booking detail page
  const targetUrl = `http://localhost:3000/en/staff/bookings/${BOOKING_ID}`;
  console.log('\nNavigating to:', targetUrl);
  await devPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 25000 });
  await devPage.waitForTimeout(4000); // allow client-side render to settle

  const currentUrl = devPage.url();
  console.log('Final URL:', currentUrl);

  // Q1: Is <div id="reminders"> present?
  const remindersDiv = await devPage.$('#reminders');
  console.log('\nQ1: <div id="reminders"> present in DOM:', remindersDiv !== null);

  // Q2: Is "Review request" text or aria-label present?
  const reviewText = await devPage.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const matches = [];
    let n;
    while ((n = walker.nextNode())) {
      if (/review.?request/i.test(n.textContent ?? '')) matches.push(n.textContent.trim());
    }
    return matches;
  });
  const ariaBtn = await devPage.$('[aria-label*="review_request_reminder"]');
  console.log('Q2a: Text nodes matching "Review request":', JSON.stringify(reviewText));
  console.log('Q2b: aria-label button [review_request_reminder*] present:', ariaBtn !== null);

  // Q3: Which view? Manager view has a <form> + <select name="status">; redacted view does not
  const hasForm = await devPage.$('form') !== null;
  const hasStatusSelect = await devPage.$('select[name="status"]') !== null;
  const h1Text = await devPage.$eval('h1', el => el.textContent?.trim()).catch(() => 'none');
  const h2Texts = await devPage.evaluate(() =>
    Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim())
  );
  console.log('\nQ3 — View detection:');
  console.log('  <form> present:', hasForm, '(manager view only has this form)');
  console.log('  <select name="status"> present:', hasStatusSelect);
  console.log('  h1 text:', h1Text);
  console.log('  h2 texts:', JSON.stringify(h2Texts));

  if (hasForm && hasStatusSelect) {
    console.log('  => MANAGER VIEW (full editable form present)');
  } else {
    console.log('  => REDACTED VIEW (no editable status select)');
  }

  // Q4: What user is logged in? Check localStorage for Supabase session
  const lsData = await devPage.evaluate((ref) => {
    const key = `sb-${ref}-auth-token`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }, PROJECT_REF);

  const loggedInEmail = lsData?.user?.email || lsData?.currentSession?.user?.email || null;
  console.log('\nQ4: localStorage session user email:', loggedInEmail ?? '(no session found)');

  // Q5: Dump #reminders innerHTML if present
  if (remindersDiv) {
    const html = await devPage.evaluate(() => {
      const el = document.getElementById('reminders');
      return el?.innerHTML?.substring(0, 600) ?? null;
    });
    console.log('\nQ5: First 600 chars of #reminders innerHTML:');
    console.log(html);
  }

  await devCtx.close();
  await browser.close();
})();
