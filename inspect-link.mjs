import { createClient } from '@supabase/supabase-js'
const admin = createClient('https://wcagbocahogggzxpkhnr.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjYWdib2NhaG9nZ2d6eHBraG5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODc5MzI4MCwiZXhwIjoyMDg0MzY5MjgwfQ.qGZBBCZEYUEZBNxTouU1nRQc79vof5AAse18jRz53DA', { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'kevjmarry@gmail.com' })
if (error) { console.error(error); process.exit(1) }
console.log('properties keys:', Object.keys(data.properties || {}))
console.log(JSON.stringify(data.properties, null, 2))
