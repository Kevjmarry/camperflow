import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const VIEWPORT_W = 390
const SUPABASE_URL = 'https://wcagbocahogggzxpkhnr.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjYWdib2NhaG9nZ2d6eHBraG5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc5MzI4MCwiZXhwIjoyMDg0MzY5MjgwfQ.qGZBBCZEYUEZBNxTouU1nRQc79vof5AAse18jRz53DA'
const EMAIL = 'kevjmarry@gmail.com'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Get user data for the session object
const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
const user = users.find(u => u.email === EMAIL)
if (!user) throw new Error('User not found')
console.log('User id:', user.id)

// Generate magic link and follow it to get real tokens
console.log('Generating magic link...')
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
if (linkErr) throw linkErr
const actionLink = linkData.properties.action_link

// Launch browser, follow magic link, capture tokens from redirect URL hash
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: VIEWPORT_W, height: 844 } })
const page = await ctx.newPage()

let accessToken = null
let refreshToken = null
let expiresIn = 3600

// Listen for navigation events to grab the hash fragment with tokens
page.on('framenavigated', async (frame) => {
  if (frame !== page.mainFrame()) return
  const url = frame.url()
  if (url.includes('access_token=') && !accessToken) {
    const hashIdx = url.indexOf('#')
    if (hashIdx !== -1) {
      const params = new URLSearchParams(url.slice(hashIdx + 1))
      accessToken = params.get('access_token')
      refreshToken = params.get('refresh_token')
      expiresIn = parseInt(params.get('expires_in') || '3600')
      console.log('Captured tokens from redirect:', url.slice(0, 60) + '...')
    }
  }
})

try {
  await page.goto(actionLink, { waitUntil: 'domcontentloaded', timeout: 20000 })
} catch { /* redirect to app.camperflow.io is expected to fail */ }

if (!accessToken) {
  // Sometimes Playwright catches the final URL via page.url() after redirect
  const url = page.url()
  const hashIdx = url.indexOf('#')
  if (hashIdx !== -1) {
    const params = new URLSearchParams(url.slice(hashIdx + 1))
    accessToken = params.get('access_token')
    refreshToken = params.get('refresh_token')
  }
}

if (!accessToken) {
  console.log('❌ Failed to capture access token from magic link redirect')
  await browser.close()
  process.exit(1)
}
console.log('access_token captured (len):', accessToken.length)

// Build the session cookie value that @supabase/ssr expects
const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
const sessionObj = {
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: expiresIn,
  expires_at: expiresAt,
  refresh_token: refreshToken || '',
  user: {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  },
}
const sessionValue = JSON.stringify(sessionObj)

// @supabase/ssr stores the cookie as URI-encoded JSON, potentially chunked
// Chunk size is 3180 chars of URI-encoded value
const CHUNK_SIZE = 3180
const encoded = encodeURIComponent(sessionValue)
const cookieName = 'sb-wcagbocahogggzxpkhnr-auth-token'

const cookiesToSet = []
if (encoded.length <= CHUNK_SIZE) {
  cookiesToSet.push({ name: cookieName, value: sessionValue, domain: 'localhost', path: '/' })
} else {
  let i = 0
  let remaining = encoded
  while (remaining.length > 0) {
    const chunk = decodeURIComponent(remaining.slice(0, CHUNK_SIZE))
    remaining = remaining.slice(encodeURIComponent(chunk).length)
    cookiesToSet.push({ name: `${cookieName}.${i}`, value: chunk, domain: 'localhost', path: '/' })
    i++
  }
}

await ctx.addCookies(cookiesToSet.map(c => ({ ...c, sameSite: 'Lax', secure: false })))
console.log('Set', cookiesToSet.length, 'cookie(s):', cookiesToSet.map(c => c.name))

// Navigate to operations
await page.goto('http://localhost:3000/en/staff/operations', { waitUntil: 'networkidle', timeout: 40000 })
const finalUrl = page.url()
console.log('Final URL:', finalUrl)

if (!finalUrl.includes('/operations')) {
  console.log('❌ Auth failed — still redirected. Dumping cookies set by response...')
  const cookies = await ctx.cookies('http://localhost:3000')
  console.log('Current cookies:', cookies.map(c => c.name + '=' + c.value.slice(0, 30)))
  await browser.close()
  process.exit(1)
}

// Wait for hydration
await page.waitForTimeout(5000)

// Run overflow detection
const result = await page.evaluate((vw) => {
  const sw = document.documentElement.scrollWidth
  const report = { viewportWidth: vw, scrollWidth: sw, overflow: sw - vw, offenders: [] }
  const all = document.querySelectorAll('*')
  for (const el of all) {
    const rect = el.getBoundingClientRect()
    if (rect.right > vw + 1) {
      const cs = window.getComputedStyle(el)
      report.offenders.push({
        tag: el.tagName,
        classes: (el.className?.toString?.() || '').slice(0, 120),
        right: Math.round(rect.right),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        overflow: cs.overflow + '/' + cs.overflowX,
        minWidth: cs.minWidth,
        text: (el.textContent || '').trim().slice(0, 80),
      })
    }
  }
  if (report.offenders.length === 0) report.offenders.push('NO OVERFLOW DETECTED')
  return report
}, VIEWPORT_W)

await browser.close()

console.log('\n=== OVERFLOW REPORT ===')
console.log(`Viewport: ${result.viewportWidth}px  |  scrollWidth: ${result.scrollWidth}px  |  Excess: +${result.overflow}px`)
for (const o of result.offenders) {
  if (typeof o === 'string') { console.log('  ' + o); continue }
  console.log(`  <${o.tag}> "${o.classes}"`)
  console.log(`    left=${o.left} right=${o.right} w=${o.width} | overflow=${o.overflow}`)
  if (o.text) console.log(`    text: ${o.text.slice(0, 80)}`)
}
