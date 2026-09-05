/*
# Fix: divisions.region_id foreign key failures

The `upsert_division` RPC previously inserted `p_region_id` straight into
`divisions.region_id` (FK → `regions(id)`). When the frontend holds a stale
region id — or the migrations were applied to a different project/database
than the one the app reads, so the `regions` rows carry different UUIDs —
Postgres raised a cryptic:

    insert or update on table "divisions" violates foreign key constraint
    "divisions_region_id_fkey"

This migration replaces `upsert_division` with a self-healing version:

1. Resolves the region **by id first** (the common, fast path).
2. Falls back to resolving **by region_code** when the id is stale/unknown,
   so id-vs-code drift between app state and the database heals itself.
3. Raises a clear, actionable exception when no region can be resolved —
   never a raw FK violation.
4. Uses the resolved region id in the INSERT and in the
   `ON CONFLICT (division_code)` update, so existing divisions are moved to
   the resolved region instead of corrupting the FK.

Also reloads the PostgREST schema cache (project convention) so the new
signature is visible immediately after `supabase db push` / SQL Editor paste.
*/

-- Drop the old 5-arg signature so PostgREST never routes to it again.
DROP FUNCTION IF EXISTS public.upsert_division(uuid, uuid, text, text, jsonb);

-- ── upsert_division (self-healing) ──
CREATE OR REPLACE FUNCTION public.upsert_division(
  p_division_id uuid DEFAULT NULL,
  p_region_id uuid DEFAULT NULL,
  p_region_code text DEFAULT NULL,
  p_division_code text DEFAULT NULL,
  p_division_name text DEFAULT NULL,
  p_features jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
  v_region_id uuid;
  v_region_code text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;

  -- ── Resolve the region ───────────────────────────────────────────────────
  -- 1. By id (fast path — the app normally holds the real id).
  IF p_region_id IS NOT NULL AND EXISTS (SELECT 1 FROM regions WHERE id = p_region_id) THEN
    v_region_id := p_region_id;
    SELECT region_code INTO v_region_code FROM regions WHERE id = v_region_id;
  ELSE
    -- 2. By code (heals id drift — e.g. migrations re-created the table and
    --    generated fresh UUIDs while the app still holds the old id).
    v_region_code := upper(trim(COALESCE(p_region_code, '')));
    IF v_region_code <> '' THEN
      SELECT id INTO v_region_id FROM regions
      WHERE region_code = v_region_code
      ORDER BY sort_order, created_at
      LIMIT 1;
    END IF;

    -- 3. If the code matches, adopt the canonical id so the app and DB agree
    --    from here on. If nothing matches, fail with a clear message.
    IF v_region_id IS NULL THEN
      RAISE EXCEPTION 'Region not found (id: %, code: %). Create the region first, or refresh the page to reload the regions list.',
        COALESCE(p_region_id::text, '-'), COALESCE(v_region_code, '-');
    END IF;
  END IF;

  IF v_region_id IS NULL THEN
    RAISE EXCEPTION 'Region is required';
  END IF;

  -- ── Insert / update the division under the resolved region ──────────────
  INSERT INTO divisions (id, region_id, division_code, division_name, features)
  VALUES (
    COALESCE(p_division_id, gen_random_uuid()),
    v_region_id,
    upper(trim(COALESCE(p_division_code, ''))),
    trim(COALESCE(p_division_name, '')),
    COALESCE(p_features, '{}'::jsonb)
  )
  ON CONFLICT (division_code) DO UPDATE SET
    region_id = EXCLUDED.region_id,
    division_name = EXCLUDED.division_name,
    features = EXCLUDED.features,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'division_upsert', 'divisions', v_id::text,
    jsonb_build_object(
      'code', upper(trim(COALESCE(p_division_code, ''))),
      'name', trim(COALESCE(p_division_name, '')),
      'region_id', v_region_id,
      'region_code', v_region_code
    )
  );

  RETURN jsonb_build_object('success', true, 'id', v_id, 'region_id', v_region_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_division(uuid, uuid, text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_division(uuid, uuid, text, text, text, jsonb) TO authenticated;

-- Reload PostgREST's schema cache so the new signature is visible immediately.
NOTIFY pgrst, 'reload schema';
