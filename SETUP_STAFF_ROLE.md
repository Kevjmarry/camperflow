# Staff Role Setup Guide

## How to Grant Staff Access

### Option 1: Via Supabase Dashboard (Recommended for development)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** > **Users**
3. Click on the user you want to make staff
4. Scroll to **User Metadata** section
5. Click **Edit** (pencil icon)
6. Add the following JSON:
   ```json
   {
     "role": "staff"
   }
   ```
7. Click **Save**

### Option 2: Via SQL (For production/automation)

Run this query in your Supabase SQL Editor:

```sql
-- Update user metadata to add staff role
UPDATE auth.users
SET raw_user_meta_data = 
  CASE 
    WHEN raw_user_meta_data IS NULL THEN '{"role": "staff"}'::jsonb
    ELSE raw_user_meta_data || '{"role": "staff"}'::jsonb
  END
WHERE email = 'staff@example.com';
```

### Option 3: During User Creation (Sign-up flow)

If you want to programmatically set this during sign-up:

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'staff@example.com',
  password: 'secure_password',
  options: {
    data: {
      role: 'staff'
    }
  }
})
```

## Testing

1. Create a test user without staff role
2. Try to access `/staff` - should redirect to `/`
3. Add `"role": "staff"` to user_metadata
4. Try to access `/staff` again - should work
5. Remove role or set to something else - access denied again

## Implementation Notes

- Role is stored in `user.user_metadata.role`
- Middleware checks role on every request to `/staff/*`
- Login page also checks role before allowing access
- Non-staff users are immediately signed out if they try to login
- This is a simple approach using user metadata
- For more complex needs, consider a dedicated `user_roles` table