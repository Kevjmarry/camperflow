-- =====================================================
-- STEP 1: Verify FK constraint details
-- =====================================================
SELECT
  tc.constraint_name,
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'vehicles'
  AND kcu.column_name = 'company_id';

-- Expected result:
-- vehicles.company_id -> companies.id


-- =====================================================
-- STEP 2: Check if default company exists
-- =====================================================
SELECT * FROM public.companies 
WHERE id = '00000000-0000-0000-0000-000000000001';

-- If this returns NO rows, run:
INSERT INTO public.companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Company')
ON CONFLICT (id) DO NOTHING;


-- =====================================================
-- STEP 3: Check existing vehicles missing company_id
-- =====================================================
SELECT id, name, registration, company_id
FROM public.vehicles
WHERE company_id IS NULL;


-- =====================================================
-- STEP 4: Backfill existing vehicles with default company_id
-- =====================================================
UPDATE public.vehicles
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Check how many rows were updated:
-- Should show: UPDATE X (where X is number of vehicles updated)


-- =====================================================
-- STEP 5: Verify all vehicles now have company_id
-- =====================================================
SELECT 
  COUNT(*) AS total_vehicles,
  COUNT(company_id) AS vehicles_with_company,
  COUNT(*) - COUNT(company_id) AS vehicles_missing_company
FROM public.vehicles;

-- Expected: vehicles_missing_company = 0


-- =====================================================
-- STEP 6: Test insert with company_id (verify FK works)
-- =====================================================
-- This should succeed:
INSERT INTO public.vehicles (name, registration, status, company_id)
VALUES ('Test Vehicle', 'TEST-999', 'available', '00000000-0000-0000-0000-000000000001');

-- Verify it was inserted:
SELECT * FROM public.vehicles WHERE registration = 'TEST-999';

-- Clean up test:
DELETE FROM public.vehicles WHERE registration = 'TEST-999';


-- =====================================================
-- STEP 7: Verify fix is complete
-- =====================================================
-- Run this after updating app code and testing:
SELECT 
  v.id,
  v.name,
  v.registration,
  v.company_id,
  c.name AS company_name
FROM public.vehicles v
LEFT JOIN public.companies c ON v.company_id = c.id
ORDER BY v.name;

-- All vehicles should show company_name = 'Default Company'