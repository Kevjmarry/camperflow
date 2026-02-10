# i18n Refactoring Migration Guide

## What Changed?

### ❌ Removed (Old Approach)

1. **Middleware-based routing** - No longer using `next-intl/middleware`
2. **`getRequestConfig`** - Removed middleware-style configuration
3. **Complex middleware matcher** - No URL rewriting logic needed
4. **Locale URL prefixes** - URLs stay clean without `/en` or `/de`

### ✅ Added (New Approach)

1. **Cookie-based locale persistence** - User preferences saved for 1 year
2. **Server-side locale detection** - In `lib/locale.ts`
3. **Server actions** - Secure cookie management
4. **LocaleSwitcher component** - User-friendly language switcher
5. **Simplified configuration** - Cleaner, more maintainable

## File Changes

### Files Modified

| File | Status | Changes |
|------|--------|---------|
| `app/layout.tsx` | ✏️ Modified | Uses new `getLocale()` and `getMessages()` utilities |
| `i18n.ts` | ✏️ Modified | Simplified to just locale configuration |
| `next.config.ts` | ✏️ Modified | Removed i18n config (now empty) |

### Files Added

| File | Purpose |
|------|---------|
| `lib/locale.ts` | Locale detection logic (cookie → header → default) |
| `lib/actions/locale.ts` | Server action for setting locale cookie |
| `components/LocaleSwitcher.tsx` | Language switcher UI component |
| `docs/I18N_SETUP.md` | Complete documentation |

### Files to Remove (If Exists)

| File | Why |
|------|-----|
| `middleware.ts` | No longer using middleware |

## Migration Steps

### Step 1: Verify File Structure

Ensure your project has these files:

```
camperflow/
├── app/
│   └── layout.tsx              ✅ Already updated
├── lib/
│   ├── locale.ts              ✅ New file
│   └── actions/
│       └── locale.ts          ✅ New file
├── components/
│   └── LocaleSwitcher.tsx     ✅ New file
├── messages/
│   ├── en.json                ✅ Existing
│   └── de.json                ✅ Existing
├── i18n.ts                    ✅ Updated
├── next.config.ts             ✅ Updated
└── docs/
    └── I18N_SETUP.md          ✅ New file
```

### Step 2: Check for middleware.ts

Run this in your project root:

```bash
# Windows PowerShell
Get-ChildItem -Path . -Filter "middleware.ts" -Recurse

# If found, delete it:
Remove-Item middleware.ts
```

### Step 3: Update Dependencies (If Needed)

Verify `next-intl` is installed:

```bash
npm list next-intl
```

If not installed or outdated:

```bash
npm install next-intl@latest
```

### Step 4: Add Language Switcher to Your UI

Choose where you want users to change language. Common locations:

#### Option A: In Staff Dashboard Header

Edit `app/staff/layout.tsx` or your staff dashboard component:

```tsx
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export default function StaffLayout({ children }) {
  return (
    <div>
      <header className="flex justify-between items-center p-4">
        <h1>CamperFlow</h1>
        <LocaleSwitcher />
      </header>
      {children}
    </div>
  );
}
```

#### Option B: In Main Entry Page

Edit `app/page.tsx`:

```tsx
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export default function HomePage() {
  return (
    <div>
      <header>
        <LocaleSwitcher />
      </header>
      {/* Rest of your page */}
    </div>
  );
}
```

### Step 5: Test the Implementation

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Test locale detection:**
   - Open `http://localhost:3000` in a fresh incognito window
   - It should default to English
   - Check browser DevTools > Application > Cookies - should see no `NEXT_LOCALE` yet

3. **Test locale switching:**
   - Use the LocaleSwitcher to switch to German
   - Page should refresh with German translations
   - Check DevTools > Cookies - should now see `NEXT_LOCALE=de`

4. **Test persistence:**
   - Close the browser tab
   - Reopen `http://localhost:3000`
   - Should still be in German (cookie persisted)

5. **Test browser detection:**
   - Clear all cookies
   - Change your browser's language preference to German
   - Reload the page
   - Should automatically detect German from Accept-Language header

### Step 6: Verify TypeScript Compilation

```bash
npm run build
```

This should complete without errors. If you see TypeScript errors:

- Check that all imports are correct
- Ensure `lib/locale.ts` is properly typed
- Verify `messages/en.json` and `messages/de.json` have matching structures

## Breaking Changes

### ⚠️ URL Structure (No Breaking Changes)

Since you weren't using `[locale]` folder structure, there are **no URL changes**:

- ✅ `/staff` - Still works
- ✅ `/guest` - Still works  
- ✅ `/staff/bookings` - Still works

### ⚠️ Component Usage (No Breaking Changes)

All your existing `useTranslations()` calls work exactly the same:

```tsx
// This still works the same way
const t = useTranslations('staffDashboard');
t('title'); // "Staff dashboard" or "Mitarbeiter-Dashboard"
```

## Common Issues & Solutions

### Issue: "Cannot find module '@/lib/locale'"

**Solution:** Verify the file exists and your `tsconfig.json` has the `@` path alias:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Issue: Translations not loading

**Solution:** Check these:

1. Messages files are in `messages/` directory
2. Files are named exactly `en.json` and `de.json`
3. Files contain valid JSON

### Issue: Cookie not persisting

**Solution:** 

1. Check browser settings allow cookies
2. Verify you're not in Private/Incognito mode with strict cookie blocking
3. Check DevTools > Application > Cookies for `NEXT_LOCALE`

### Issue: Language not changing when switching

**Solution:**

1. Check browser console for errors
2. Verify the server action is being called (check Network tab)
3. Try hard refresh (Ctrl+Shift+R)

## Rollback Plan (If Needed)

If you need to rollback to the old setup:

1. Restore the old `app/layout.tsx`:
   ```tsx
   // Use the version from your git history
   git checkout HEAD~1 app/layout.tsx
   ```

2. Remove new files:
   ```bash
   rm -rf lib/locale.ts lib/actions/locale.ts components/LocaleSwitcher.tsx
   ```

3. Restore old `i18n.ts` if you had a backup

## Next Steps

1. ✅ Complete migration steps above
2. ✅ Test all pages with both locales
3. ✅ Add `LocaleSwitcher` to your preferred locations
4. ✅ Update any documentation for your team
5. 📝 Consider adding more languages in the future (see `docs/I18N_SETUP.md`)

## Questions?

- Check `docs/I18N_SETUP.md` for detailed usage guide
- Review the code in `lib/locale.ts` to understand detection logic
- Test with different browser language settings

---

**Migration completed!** 🎉

Your app now has:
- ✅ Clean URLs (no locale prefixes)
- ✅ Cookie-based persistence
- ✅ Browser language detection
- ✅ Simple, maintainable architecture