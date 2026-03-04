-- Migration: Allow NULL section in checklist_template_items (General section)
--
-- The existing trigger function raises:
--   'section_id is required or section text must be provided'
-- when both section_id IS NULL AND section IS NULL.
--
-- NULL section is the correct representation of the General (default) section
-- and must be accepted without a section_id.  Only named (non-NULL) sections
-- should ever need to reference section_id.
--
-- Strategy: locate the offending trigger function via pg_proc (its exact name
-- is not tracked in the local migration history), get its full definition with
-- pg_get_functiondef, surgically rewrite the guard condition, then re-execute
-- the patched definition.  All other logic in the function is left unchanged.

DO $$
DECLARE
  rec        record;
  full_def   text;
  fixed_def  text;
BEGIN
  -- ── 1. Find the function by its distinctive error message ──────────────────
  SELECT
    p.oid,
    n.nspname AS nsp,
    p.proname AS fname
  INTO rec
  FROM pg_proc     p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc ILIKE '%section_id is required or section text must be provided%'
  LIMIT 1;

  IF rec.oid IS NULL THEN
    RAISE NOTICE 'Function not found – nothing to patch.';
    RETURN;
  END IF;

  RAISE NOTICE 'Patching function: %.%', rec.nsp, rec.fname;

  -- ── 2. Retrieve the complete function definition ────────────────────────────
  full_def := pg_get_functiondef(rec.oid);

  -- ── 3. Rewrite the guard condition ─────────────────────────────────────────
  --
  -- Before (raises when section is NULL and no section_id supplied):
  --   NEW.section_id IS NULL AND (NEW.section IS NULL [OR NEW.section = ''])
  --
  -- After (raises only when section IS NOT NULL but section_id is missing):
  --   NEW.section IS NOT NULL AND NEW.section_id IS NULL
  --
  -- The regexp covers:
  --   • optional extra whitespace / newlines
  --   • optional parentheses around the rhs
  --   • optional OR NEW.section = '' / OR trim(NEW.section) = '' clause
  --   • case-insensitive keywords
  fixed_def := regexp_replace(
    full_def,
    'NEW\.section_id\s+IS\s+NULL\s+AND\s*\(?\s*NEW\.section\s+IS\s+NULL'
      '(\s+OR\s+(trim\s*\(\s*)?NEW\.section\s*(\))?\s*=\s*'''')?'
      '\s*\)?',
    'NEW.section IS NOT NULL AND NEW.section_id IS NULL',
    'gi'
  );

  IF fixed_def = full_def THEN
    -- Pattern did not match; emit the body so the developer can fix manually.
    RAISE WARNING
      'Pattern not matched in function %.% – manual review required.',
      rec.nsp, rec.fname;
    RAISE WARNING 'Function body: %', full_def;
    RETURN;
  END IF;

  -- ── 4. Ensure we use CREATE OR REPLACE (pg_get_functiondef emits CREATE) ───
  fixed_def := regexp_replace(
    fixed_def,
    '^CREATE FUNCTION\b',
    'CREATE OR REPLACE FUNCTION',
    'i'
  );

  -- ── 5. Execute the patched definition ──────────────────────────────────────
  EXECUTE fixed_def;

  RAISE NOTICE 'Function %.% patched successfully.', rec.nsp, rec.fname;
END;
$$;
