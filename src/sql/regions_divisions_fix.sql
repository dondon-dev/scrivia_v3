-- Fix: self-healing upsert_division (resolves the region by id, then by code)
-- This is a reference for the PocketBase hook implementation

-- In PocketBase, this is handled by the dashboard.js hook's upsertDivision RPC
-- which does the region lookup automatically.

-- The equivalent SQL function would be:
/*
CREATE FUNCTION upsert_division(
  p_division_code TEXT,
  p_division_name TEXT,
  p_region_id TEXT,
  p_region_code TEXT
) RETURNS TEXT AS $$
DECLARE
  v_region_id TEXT := p_region_id;
  v_division_id TEXT;
BEGIN
  -- If region_id not provided but region_code is, look it up
  IF v_region_id IS NULL AND p_region_code IS NOT NULL THEN
    SELECT id INTO v_region_id FROM regions WHERE region_code = p_region_code LIMIT 1;
  END IF;

  -- Try to find existing division
  SELECT id INTO v_division_id FROM divisions WHERE division_code = p_division_code LIMIT 1;

  IF v_division_id IS NOT NULL THEN
    -- Update existing
    UPDATE divisions SET
      division_name = p_division_name,
      region_id = v_region_id,
      updated_at = datetime('now')
    WHERE id = v_division_id;
  ELSE
    -- Insert new
    INSERT INTO divisions (id, division_code, division_name, region_id, created_at, updated_at)
    VALUES (lower(hex(randomblob(16))), p_division_code, p_division_name, v_region_id, datetime('now'), datetime('now'))
    RETURNING id INTO v_division_id;
  END IF;

  RETURN v_division_id;
END;
$$ LANGUAGE plpgsql;
*/

-- Note: PocketBase uses SQLite which doesn't support PL/pgSQL functions.
-- The logic is implemented in the PocketBase hook (dashboard.js) instead.