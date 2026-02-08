# CamperFlow v1 Multi-Tenant Branding Setup

## Overview
This implements white-label branding for CamperFlow, allowing each company to customize:
- Company name
- Logo
- Primary, secondary, and accent colors

## Database Setup

### 1. Run SQL Migration
Execute `supabase/migrations/003_create_company_settings.sql` in your Supabase SQL Editor.

This creates:
- `company_settings` table
- `company-logos` storage bucket
- Row Level Security policies
- Default Epic Vans company record

### 2. Verify Default Company Exists
```sql
SELECT * FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001';
```

Should return:
```
id: 00000000-0000-0000-0000-000000000001
name: Epic Vans
primary_color: #368F8B
secondary_color: #BC8235
accent_color: #0A0A0A
```

## Files Changed

### New Files
1. **contexts/ThemeContext.tsx** - React context for company branding
2. **app/staff/company/page.tsx** - Company settings page (staff-only)
3. **supabase/migrations/003_create_company_settings.sql** - Database schema
4. **BRANDING_SETUP.md** - This file

### Modified Files
1. **app/layout.tsx** - Added ThemeProvider wrapper
2. **app/staff/page.tsx** - Added "Company Settings" card

## How It Works

### 1. Theme Loading
- `ThemeContext` fetches company settings on app load
- Applies colors to CSS variables (`--brand`, `--brand-2`, `--accent`)
- Makes company data available via `useTheme()` hook

### 2. Staff Settings Page
- Location: `/staff/company`
- Features:
  - Edit company name
  - Upload/change logo (stored in Supabase Storage)
  - Color pickers for primary, secondary, accent colors
  - Live preview of branding
  - Save changes

### 3. Brand Application
Colors are automatically applied to:
- Primary buttons (primary_color)
- Secondary buttons (border uses primary_color)
- Links (primary_color)
- Status badges (accent_color)
- Dashboard card icons (primary_color with light background)

### 4. Logo Display
- Uploaded to Supabase Storage bucket: `company-logos`
- Public read access for guests
- Staff-only write access
- Displayed in header preview on settings page

## Usage

### For Staff
1. Navigate to Staff Dashboard → Company Settings
2. Update company name, logo, and colors
3. Use live preview to see changes
4. Click "Save changes"
5. Changes apply immediately across the app

### For Developers
**Access company branding in any component:**
```typescript
import { useTheme } from '../contexts/ThemeContext';

function MyComponent() {
  const { company, loading } = useTheme();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <h1>{company?.name}</h1>
      {company?.logo_url && <img src={company.logo_url} alt="Logo" />}
    </div>
  );
}
```

## Security

### Row Level Security (RLS)
- **Read (SELECT)**: Anyone (authenticated + anonymous) can read company settings
  - Allows guests to see branding without logging in
- **Write (INSERT/UPDATE)**: Only staff users can modify settings
  - Checked via `user_metadata.role = 'staff'`

### Storage Security
- **Logos bucket**: Public read, staff-only write
- **File validation**: 
  - Max 2MB file size
  - Image types only (PNG, JPG, SVG)

## Multi-Tenancy Future

### V1 (Current)
- Single company (first row in `company_settings`)
- All users see the same branding
- Simple and fast

### V2 (Future Enhancement)
To support multiple companies:

1. **Add company_id to users table**
```sql
ALTER TABLE auth.users ADD COLUMN company_id UUID REFERENCES company_settings(id);
```

2. **Update ThemeContext to fetch user's company**
```typescript
// Instead of .limit(1).single()
const { data: { user } } = await supabase.auth.getUser();
const companyId = user?.user_metadata?.company_id;
const { data } = await supabase
  .from('company_settings')
  .select('*')
  .eq('id', companyId)
  .single();
```

3. **Add company filter to all queries**
- Vehicles: `WHERE company_id = user.company_id`
- Bookings: `WHERE company_id = user.company_id`
- Customers: `WHERE company_id = user.company_id`

## Testing

### Test Branding Changes
1. Log in as staff user
2. Go to `/staff/company`
3. Change primary color to `#FF0000` (red)
4. Save changes
5. Navigate to `/staff/vehicles`
6. Verify "Add vehicle" button is now red
7. Revert color to original

### Test Logo Upload
1. Go to `/staff/company`
2. Click "Upload logo"
3. Select an image file
4. Verify preview appears
5. Click "Save changes"
6. Check preview card shows logo
7. Logo should persist on page refresh

## Troubleshooting

### Colors Not Applying
- Check browser console for CSS variable errors
- Verify company settings exist in database
- Hard refresh browser (Ctrl+Shift+R)

### Logo Upload Fails
- Verify storage bucket exists: `company-logos`
- Check file size < 2MB
- Verify file is image type
- Check browser console for upload errors

### Settings Not Saving
- Verify user has staff role: `user_metadata.role = 'staff'`
- Check Supabase logs for RLS policy errors
- Verify company_id matches existing record

## Environment Variables
No additional environment variables required. Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`