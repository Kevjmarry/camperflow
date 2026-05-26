#!/usr/bin/env node
// Verifies that every active-locale message file has the same key structure as en.json.
// Reads active locales directly from i18n.ts so the script never goes stale.
// Usage: node scripts/check-i18n.js  |  npm run check:i18n

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// ── Parse activeLocales from i18n.ts (no TypeScript runtime needed) ───────────
const i18nSrc = fs.readFileSync(path.join(root, 'i18n.ts'), 'utf8');
const arrayMatch = i18nSrc.match(/activeLocales\s*=\s*\[([^\]]+)\]/);
if (!arrayMatch) {
  console.error('ERROR: Could not find activeLocales in i18n.ts');
  process.exit(1);
}
const activeLocales = (arrayMatch[1].match(/'([a-z]+)'/g) || []).map(s => s.replace(/'/g, ''));
if (activeLocales.length === 0) {
  console.error('ERROR: activeLocales array is empty in i18n.ts');
  process.exit(1);
}

// ── Recursively collect every dotted key path ─────────────────────────────────
function collectKeys(obj, prefix) {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ── Load reference (en.json) ──────────────────────────────────────────────────
const refPath = path.join(root, 'messages', 'en.json');
const reference = JSON.parse(fs.readFileSync(refPath, 'utf8'));
const refKeys = new Set(collectKeys(reference, ''));
console.log(`Reference: en.json  (${refKeys.size} keys)\n`);

// ── Check each non-English active locale ─────────────────────────────────────
let hasError = false;

for (const locale of activeLocales) {
  if (locale === 'en') continue;

  const msgPath = path.join(root, 'messages', `${locale}.json`);
  if (!fs.existsSync(msgPath)) {
    console.error(`✗  ${locale}  —  messages/${locale}.json not found`);
    hasError = true;
    continue;
  }

  const messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
  const keys = new Set(collectKeys(messages, ''));

  const missing = [...refKeys].filter(k => !keys.has(k));
  const extra   = [...keys].filter(k => !refKeys.has(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓  ${locale}  —  ${keys.size} keys, all present`);
  } else {
    hasError = true;
    if (missing.length) {
      console.error(`✗  ${locale}  —  ${missing.length} missing key(s):`);
      missing.forEach(k => console.error(`       - ${k}`));
    }
    if (extra.length) {
      console.error(`✗  ${locale}  —  ${extra.length} extra key(s) not in en.json:`);
      extra.forEach(k => console.error(`       + ${k}`));
    }
  }
}

console.log('');
if (hasError) {
  console.error('check:i18n FAILED — fix the issues above before activating a new locale.');
  process.exit(1);
} else {
  console.log('check:i18n passed — all active locale files are in sync with en.json.');
}
