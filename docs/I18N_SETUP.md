# Internationalization (i18n) Setup

## Overview

CamperFlow uses `next-intl` for internationalization **without middleware**, providing a seamless multi-language experience with cookie-based persistence.

## Supported Locales

- **English** (`en`) - Default
- **German** (`de`)

## How It Works

### 1. Locale Detection Priority

The app detects the user's preferred language in this order:

1. **Cookie** (`NEXT_LOCALE`) - User's explicit choice (persists for 1 year)
2. **Accept-Language Header** - Browser's language preference
3. **Default** - English (`en`)

### 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│ app/layout.tsx (Server Component)                       │
│  ├─ getLocale() → Detects locale from cookie/header    │
│  ├─ getMessages(locale) → Loads translations           │
│  └─ NextIntlClientProvider → Wraps app with i18n       │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Client Components                                        │
│  ├─ useTranslations() → Access translations            │
│  └─ LocaleSwitcher → Change language                   │
└─────────────────────────────────────────────────────────┘
```

### 3. File Structure

```
/
├── app/
│   └── layout.tsx              # Root layout with locale detection
├── lib/
│   ├── locale.ts              # Locale detection utilities
│   └── actions/
│       └── locale.ts          # Server actions for cookie management
├── components/
│   └── LocaleSwitcher.tsx     # Language switcher component
├── messages/
│   ├── en.json                # English translations
│   └── de.json                # German translations
└── i18n.ts                    # i18n configuration
```

## Usage

### In Server Components

```tsx
import { useTranslations } from 'next-intl';

export default function MyPage() {
  const t = useTranslations('myNamespace');
  
  return <h1>{t('title')}</h1>;
}
```

### In Client Components

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function MyClientComponent() {
  const t = useTranslations('myNamespace');
  
  return <button>{t('clickMe')}</button>;
}
```

### Adding the Language Switcher

```tsx
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export default function Header() {
  return (
    <header>
      <nav>
        {/* Your navigation */}
        <LocaleSwitcher />
      </nav>
    </header>
  );
}
```

## Adding New Translations

1. Open the relevant locale file: `messages/en.json` or `messages/de.json`
2. Add your translation key in the appropriate namespace:

```json
{
  "myNamespace": {
    "myKey": "My translated text"
  }
}
```

3. Access it in your component:

```tsx
const t = useTranslations('myNamespace');
t('myKey'); // "My translated text"
```

## Adding a New Language

1. Add the locale to `lib/locale.ts`:

```ts
export const locales = ['en', 'de', 'fr'] as const;
```

2. Create the message file:

```bash
touch messages/fr.json
```

3. Add translations to `messages/fr.json`

4. Update `i18n.ts` with the locale name:

```ts
export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
};
```

## Key Features

✅ **No URL Locale Prefixes** - URLs remain clean (e.g., `/staff`, not `/en/staff`)  
✅ **Cookie Persistence** - Language choice persists across sessions  
✅ **Browser Detection** - Automatically detects user's preferred language  
✅ **Server Actions** - Secure cookie management via Next.js server actions  
✅ **Type-Safe** - Full TypeScript support for locales and translations  
✅ **No Middleware** - Simplified architecture without middleware complexity

## Troubleshooting

### Language not changing?

- Clear your browser cookies for `localhost`
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Check browser console for errors

### Missing translations showing keys?

- Verify the translation key exists in both `en.json` and `de.json`
- Check for typos in the namespace or key
- Ensure messages are properly nested

### TypeScript errors?

- Run `npm run build` to check for type issues
- Ensure all locale files have matching structure