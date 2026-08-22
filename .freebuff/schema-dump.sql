--
-- PostgreSQL database dump
--

\restrict oyv8Mwjj0LxiFicfq4LUg27WcI9jBZ5j3a8NHIJ6pEXsod9dXsGlluXjf9XB94N

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: _realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _realtime;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_functions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_functions;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

    REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
  END IF;
END;
$$;


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- Name: _pd_compute(numeric, jsonb, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._pd_compute(p_available numeric, p_sorted jsonb, p_mandatory_loans numeric, p_station text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_after numeric;
  v_capacity numeric;
  v_remaining numeric;
  v_actual numeric := 0;
  v_net numeric;
  v_status text;
  v_elem jsonb;
  v_amount numeric;
  v_unded jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;
  v_last jsonb;
  v_desc text;
BEGIN
  v_after := round(p_available - COALESCE(p_mandatory_loans, 0), 2);
  v_capacity := round(v_after - 5000, 2);

  IF v_capacity <= 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
    LOOP
      v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
      IF v_amount <= 0 THEN CONTINUE; END IF;
      v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END LOOP;
    v_net := v_after;
    v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
    RETURN jsonb_build_object(
      'availableBalance', v_after,
      'loanDeductionCapacity', v_capacity,
      'actualLoanDeductions', 0,
      'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
      'finalNetPay', v_net,
      'nthpStatus', v_status,
      'undeducted', v_unded,
      'deducted', '[]'::jsonb
    );
  END IF;

  -- Step 5 — process by priority/FIFO
  v_remaining := v_capacity;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_sorted)
  LOOP
    v_amount := round(COALESCE((v_elem->>'dedamt')::numeric, 0), 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_desc := COALESCE(v_elem->>'dedname', v_elem->>'dedcode');
    IF v_remaining >= v_amount THEN
      v_remaining := round(v_remaining - v_amount, 2);
      v_actual := round(v_actual + v_amount, 2);
      v_log := v_log || v_elem;
    ELSE
      v_unded := v_unded || jsonb_build_object(
        'deduction_code', v_elem->>'dedcode',
        'deduction_description', v_desc,
        'scheduled_amount', v_amount,
        'undeducted_amount', v_amount,
        'station_code', COALESCE(p_station, ''),
        'reason', 'NTHP Threshold Reached'
      );
    END IF;
  END LOOP;

  -- Step 7 — NTHP reversal
  v_net := round(v_after - v_actual, 2);
  WHILE v_net < 5000 AND jsonb_array_length(v_log) > 0 LOOP
    v_last := v_log->-1;
    v_log := v_log - jsonb_array_length(v_log) - 1;
    v_amount := round(COALESCE((v_last->>'dedamt')::numeric, 0), 2);
    v_actual := round(v_actual - v_amount, 2);
    v_unded := v_unded || jsonb_build_object(
      'deduction_code', v_last->>'dedcode',
      'deduction_description', COALESCE(v_last->>'dedname', v_last->>'dedcode'),
      'scheduled_amount', v_amount,
      'undeducted_amount', v_amount,
      'station_code', COALESCE(p_station, ''),
      'reason', 'NTHP Threshold Reached'
    );
    v_net := round(v_after - v_actual, 2);
  END LOOP;

  v_status := CASE WHEN v_net >= 5000 THEN 'PASS' ELSE 'FAIL' END;
  RETURN jsonb_build_object(
    'availableBalance', v_after,
    'loanDeductionCapacity', v_capacity,
    'actualLoanDeductions', v_actual,
    'mandatoryLoanDeductions', round(COALESCE(p_mandatory_loans, 0), 2),
    'finalNetPay', v_net,
    'nthpStatus', v_status,
    'undeducted', v_unded,
    'deducted', v_log
  );
END;
$$;


--
-- Name: _pd_mandatory(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._pd_mandatory(p_agency text, p_type text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    upper(COALESCE(p_agency, '')) = 'BIR'
    OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
    OR upper(COALESCE(p_agency, '')) = 'GSIS'
    OR (
      upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND (
        upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
        OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
      )
    );
$$;


--
-- Name: _pd_mandatory_loan(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._pd_mandatory_loan(p_agency text, p_type text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    upper(COALESCE(p_type, '')) IN ('L', 'LOAN')
    AND (
      upper(COALESCE(p_agency, '')) = 'BIR'
      OR upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH')
      OR upper(COALESCE(p_agency, '')) = 'GSIS'
      OR (
        upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
        AND (
          upper(COALESCE(p_type, '')) IN ('L', 'LOAN', 'MANDATORY')
          OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
        )
      )
    );
$$;


--
-- Name: _pd_priority(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._pd_priority(p_agency text, p_type text, p_dedcode text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN upper(COALESCE(p_agency, '')) = 'BIR' THEN 1
    WHEN upper(COALESCE(p_agency, '')) IN ('PHIC', 'PHILHEALTH') THEN 2
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 3
    WHEN upper(COALESCE(p_agency, '')) = 'GSIS'
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 4
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) NOT IN ('L', 'LOAN') THEN 5
    WHEN upper(COALESCE(p_agency, '')) IN ('HDMF', 'PAGIBIG', 'PAG-IBIG')
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 6
    WHEN upper(COALESCE(p_type, '')) IN ('C', 'COOPERATIVE') THEN 7
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%MBA%' THEN 8
    WHEN upper(COALESCE(p_dedcode, '')) LIKE '%PROVIDENT%'
      OR upper(COALESCE(p_dedcode, '')) LIKE '%PF%'
      OR upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 9
    WHEN upper(COALESCE(p_agency, '')) = 'DEPED'
      AND upper(COALESCE(p_type, '')) IN ('L', 'LOAN') THEN 9
    WHEN upper(COALESCE(p_type, '')) = 'INSURANCE'
      OR (upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS')
          AND upper(COALESCE(p_agency, '')) = 'OTHER') THEN 11
    WHEN upper(COALESCE(p_type, '')) IN ('L', 'LOAN')
      AND upper(COALESCE(p_agency, '')) = 'OTHER' THEN 13
    WHEN upper(COALESCE(p_type, '')) IN ('P', 'PROVIDENT', 'SAVINGS') THEN 11
    ELSE 13
  END;
$$;


--
-- Name: _trig_refresh_dashboard_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trig_refresh_dashboard_cache() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM refresh_dashboard_cache();
  RETURN NULL;
END;
$$;


--
-- Name: ai_copilot(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_copilot(p_question text, p_org jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  q text := lower(trim(p_question));
  answer text := '';
  regcode text := p_org->>'regcode';
  divcode text := p_org->>'divcode';
  division_name text := p_org->>'divisionName';
  region_name text := p_org->>'regionName';
  is_scoped boolean := (p_org->>'scoped')::boolean;
  v_count bigint;
  v_total numeric;
  result jsonb;
BEGIN
  -- ── Greeting ──────────────────────────────────────────────────────
  IF q SIMILAR TO '^(hi|hello|hey|good (morning|afternoon|evening)|howdy|yo)%' THEN
    answer := 'Hello! I am **SCRIVIA CLOUD Payroll Copilot**. I can help you with:

- **Payroll workflow** — running payroll, posting, locking periods
- **Employee masterfile** — querying, adding, and managing employees
- **Deductions** — GSIS, PhilHealth, Pag-IBIG, BIR Withholding Tax
- **Division scoping** — REGCODE/DIVCODE, how data is partitioned
- **Reports** — payroll registers, remittance summaries, analytics
- **Modules** — Organization, Salary Schedule, Plantilla, Initial Payroll

Ask me anything about SCRIVIA CLOUD!';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── System overview ───────────────────────────────────────────────
  IF q SIMILAR TO '%(what|which) (modules|features|pages|sections|menus) (are|is) (there|available|in|under)?%' OR
     q SIMILAR TO '%(what|tell me about) (scrivia|this system|the system|the app)%' OR
     q = 'overview' OR q = 'help' OR q = 'what can you do' THEN
    answer := '## SCRIVIA CLOUD Modules

SCRIVIA CLOUD is the **Workforce Intelligence, Payroll, Plantilla, Remittance, Compliance and Analytics** platform for the Philippine education sector.

### Core Modules
| Module | Purpose |
|--------|---------|
| **Dashboard** | Real-time payroll stats, pending approvals, loan summary |
| **Employee Management** | Masterfile of employees with STACODE, division scoping |
| **Payroll** | Monthly payroll processing — run, compute, post, lock |
| **Deductions & Loans** | GSIS, PhilHealth, Pag-IBIG, BIR W/Tax, loan deductions |
| **Initial Payroll** | Pre-regular-payroll processing and transfer |
| **Organization** | Regions, Divisions, Schools, Division Office settings |
| **Salary Schedule** | Salary grades, steps, NBC 601 (Third Tranche) |
| **Plantilla Positions** | PSIPOP PDF import, position management |
| **Reports** | Payroll registers, remittance, deduction summaries |
| **Audit & Monitoring** | Login tracking, security events, audit logs |
| **Administration** | Users & Roles, role permissions, MFA, system settings |
| **OmniDev AI** | This copilot — ask questions in natural language |

All data is **division-scoped** via REGCODE/DIVCODE so divisions only see their own records.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── REGCODE / DIVCODE scoping ────────────────────────────────────
  IF q SIMILAR TO '%(regcode|divcode|division.?code|region.?code|scoping|scoped|scope|partition|multi.?division|division.?filter|division.?access)%' OR
     q SIMILAR TO '%(how (does|do) (division|region|scope|scoping|access control|data.?separation))%' OR
     q SIMILAR TO '%explain.*(division|region|scope)' OR
     q LIKE '%how are divisions%' THEN
    answer := '## REGCODE / DIVCODE Scoping Model

SCRIVIA CLOUD uses a **two-level division scoping** system to partition data:

### Architecture
- **REGCODE** — Region code (e.g., `IV-A` for CALABARZON)
- **DIVCODE** — Division code (e.g., `1801` for Division of Calamba City)
- Every employee, payroll entry, deduction, and audit log carries `(regcode, divcode)` columns

### How it works
1. **Profile assignment**: Each user profile has a `division_id` and `region_id` linking to the Organization module
2. **Automatic stamping**: The `stamp_division_codes()` trigger fires on INSERT/UPDATE and fills `regcode`/`divcode` from the acting user profile
3. **Query scoping**: RPC functions like `query_employees()`, `get_dashboard_summary()`, and `get_payroll_history_by_month()` accept `p_regcode` and `p_divcodes` parameters
4. **Super Admin override**: Users with `role = super_admin` see ALL divisions; others see only their assigned division

### Tables with REGCODE/DIVCODE columns
`employees`, `pay_periods`, `payroll_entries`, `payroll_deductions`, `audit_logs`, `signatories`, `initial_payroll_records`, `non_plantilla_employees`

### Key rule
> A division user can NEVER see another division''s data. The super administrator can filter by division using the sidebar dropdown.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Payroll workflow ──────────────────────────────────────────────
  IF q SIMILAR TO '%(run|processing|process|computing|compute|execute) (the )?(regular )?payroll%' OR
     q SIMILAR TO '%(payroll )?(workflow|flow|steps|procedure|how to)' OR
     q SIMILAR TO '%(how do i|how to) (run|start|begin|process) (the )?(payroll|monthly payroll|payroll run)' OR
     q LIKE '%monthly payroll workflow%' OR
     q LIKE '%payroll cycle%' THEN
    answer := '## Monthly Payroll Workflow

### Step-by-step process
1. **Generate Pay Periods** — Go to Payroll → Pay Periods and click "Generate" for the fiscal year (scoped to your division)
2. **Import Employee Data** — Upload DBF files via Smart Import or manually add employees in the Masterfile
3. **Manage Deductions** — Go to Deductions & Loans to assign GSIS, PhilHealth, Pag-IBIG, and loan deductions to employees
4. **Run Payroll** — Click "Run Payroll" on the Dashboard or Payroll page. The engine computes gross pay, deductions, and net pay for each employee
5. **Review Entries** — Check the computed payroll entries for accuracy (gross, deductions, net pay)
6. **Post Payroll** — Once verified, post the payroll period. This locks the entries and prevents further edits
7. **Lock Period** — After posting, the period status changes to "closed" and cannot be reopened without a reverse operation

### Important rules
- Only **one payroll cycle** can be active at a time per division
- **Posting is final** for the period — reverse if corrections are needed
- The payroll engine respects **division scoping** — only your division''s employees are processed
- Posted entries trigger **NTHP validation** (Non-Taxable Highest Pay check)

### Quick actions from Dashboard
- **Run Payroll** → Opens the payroll processing workspace
- **Employees** → Opens the Masterfile for data management
- **Reports** → Generate payroll registers and remittance summaries';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Posting / locking ────────────────────────────────────────────
  IF q SIMILAR TO '%(post|lock|close|finalize) (the )?(payroll|period|pay period)' OR
     q SIMILAR TO '%(how do i|how to) (post|lock|close)' THEN
    answer := '## Posting & Locking a Pay Period

### Posting
Posting finalizes the payroll entries for a period. After posting:
- Entry status changes to **Posted**
- No further edits are allowed on posted entries
- The `prevent_posted_entry_modification()` trigger enforces this
- Posted entries are included in reports and remittance summaries

### Locking (Closing)
After posting, the period can be locked (status → `closed`):
- A locked period **cannot be reopened** without admin intervention
- The `prevent_closed_period_reopen()` trigger blocks reopen attempts
- Only a super admin can reverse a posted period

### How to post
1. Open **Payroll** → select the pay period
2. Review all entries (verify gross, deductions, net)
3. Click **Post** — this is irreversible for the period
4. The period status updates and entries are frozen

### Reversing a posted period
If mistakes are found after posting:
- Go to **Payroll** → select the locked period
- Click **Reverse** (requires super admin privileges)
- The period reopens and entries become editable again
- All changes are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── GSIS / PhilHealth / Pag-IBIG / BIR Tax ───────────────────────
  IF q SIMILAR TO '%(gsis|philhealth|pag.?ibig|bir|w/?tax|withholding tax|mandatory deduction|contribution)%' OR
     q SIMILAR TO '%(how (are|is)) (gsis|philhealth|pag.?ibig|bir|tax|contribution|deduction)s? (computed|calculated|computed)%' OR
     q LIKE '%computation%' OR q LIKE '%how are deductions%' THEN
    answer := '## Mandatory Deductions Computation

### GSIS (Government Service Insurance System)
- **Contribution**: Based on monthly salary credit (MSC) using the GSIS contribution table
- **Employee share**: ~9% of MSC
- **Employer share**: ~12% of MSC
- **Premium**: Computed on the gross basic salary
- **Loan deductions**: GSIS salary loan, policy loan, emergency loan (if applicable)
- Deduction code: `GSIS` (premium) + `GSISLN` (loan)

### PhilHealth
- **Contribution**: 5% of basic monthly salary (split 50/50 employee-employer)
- Floor: ₱10,000 | Ceiling: ₱100,000 monthly salary credit
- Employee share: 2.25% of MSC
- Employer share: 2.75% of MSC
- Deduction code: `PHIL`

### Pag-IBIG (HDMF)
- **Employee share**: 2% of monthly salary (capped at ₱2,000 for high earners)
- **Employer share**: 2% of monthly salary (capped at ₱2,000)
- Members earning ₱5,000 and below: mandatory 1% employee share
- Deduction code: `PAGIBIG` (regular) + `HDMF` (MP2 if applicable)

### BIR Withholding Tax
- Computed using the **TRAIN Law** tax table ( graduated rates)
- Taxable income = Gross pay − (GSIS + PhilHealth + Pag-IBIG)
- Applied per pay period based on the employee''s tax status (ME, ME1, ME2, S, S1, etc.)
- Deduction code: `TAX`

### Where to manage
- **Deduction Codes** menu: View/edit deduction codes and rates
- **Payroll → Run Payroll**: Engine auto-computes all deductions
- **Deduction Masterfile**: Assign specific deduction amounts per employee';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Employees / Masterfile ────────────────────────────────────────
  IF q SIMILAR TO '%(employee|masterfile|worker|personnel|staff|teacher)s?%' OR
     q SIMILAR TO '%(how (many|much)|count|list|show|find|search).*(employee|masterfile)' OR
     q LIKE '%employee management%' THEN
    -- Return live data
    SELECT count(*) INTO v_count FROM employees WHERE status = 'Active';
    answer := format('## Employee Masterfile

### Current Statistics
- **Active employees**: %s
- **Total employee records**: (query the Masterfile for full count)

### Key fields per employee
| Field | Description |
|-------|-------------|
| `empno` | Unique employee number |
| `stacode` | Station code (school/office identifier) |
| `regcode` / `divcode` | Division scope codes |
| `basic` / `basic_salary` | Monthly basic salary |
| `grade` / `step` | Salary grade and step |
| `status` | Active, Inactive, Resigned, Terminated |

### How to add employees
1. Go to **Employee Management** (Masterfile)
2. Click **+ Add Employee** or use **Smart Import** (DBF upload)
3. Fill in required fields: Empno, Last Name, First Name, STACODE
4. The employee is automatically stamped with your division codes

### STACODE validation
- STACODE must be numeric and fall within your division''s payroll group ranges
- Elementary: 001–499 | Junior HS: 500–699 | Senior HS: 700–701
- Invalid STACODEs are flagged in the Dashboard''s validation widget', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Deduction codes / masterfile ──────────────────────────────────
  IF q SIMILAR TO '%(deduction|deduction.?code|deduction.?masterfile|deduction.?list)%' THEN
    SELECT count(*) INTO v_count FROM deduction_codes WHERE active = true;
    answer := format('## Deduction Codes

### Active deduction codes: %s

### Common deduction codes
| Code | Type | Agency | Description |
|------|------|--------|-------------|
| GSIS | Mandatory | GSIS | GSIS premium contribution |
| GSISLN | Loan | GSIS | GSIS salary/policy loan |
| PHIL | Mandatory | PhilHealth | PhilHealth premium |
| PAGIBIG | Mandatory | PAGIBIG | Pag-IBIG regular contribution |
| HDMF | Mandatory | PAGIBIG | Pag-IBIG MP2 / Additional |
| TAX | Mandatory | BIR | Withholding tax |
| LIFE | Loan | INSURANCE | Life insurance |
| COOP | Loan | COOPERATIVE | Cooperative deduction |

### Managing deduction codes
- Go to **Deductions & Loans** → **Deduction Codes**
- You can add, edit, or deactivate deduction codes
- Each code has: `dedcode` (unique), `type` (Mandatory/Loan/Other), `agency`, `active` flag

### Assigning deductions to employees
- Go to **Deductions & Loans** → **Employee Deductions**
- Select employee → add deduction with amount and policy number
- Active deductions are automatically included in payroll runs', v_count);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Reports ───────────────────────────────────────────────────────
  IF q SIMILAR TO '%(report|analytics|summary|register|export|print)' OR
     q LIKE '%what reports%' OR q LIKE '%report center%' THEN
    answer := '## SCRIVIA Report Center

### Available Reports
| Report | Location | Description |
|--------|----------|-------------|
| **Payroll Register** | Reports → Payroll | Complete payroll breakdown per period |
| **Remittance Summary** | Reports → Remittance | GSIS/PhilHealth/Pag-IBIG/BIR totals |
| **Deduction Summary** | Reports → Deductions | All deductions by code and employee |
| **Employee List** | Reports → Employees | Masterfile export (Excel/PDF) |
| **NTHP Compliance** | Reports → Compliance | Non-Taxable Highest Pay validation |
| **Pay Slip** | Reports → Pay Slips | Individual employee pay slips |
| **Audit Trail** | Audit & Monitoring | System activity log |

### How to generate
1. Go to **SCRIVIA Report Center** in the sidebar
2. Select the report type
3. Choose the pay period and scope (division filter)
4. Click **Generate** — download as PDF or Excel

### Export options
- **PDF**: For official documents and printing
- **Excel**: For data analysis and further processing
- **DBF**: For legacy system compatibility

All reports respect **division scoping** — only your division''s data is included.';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Regions & Divisions (Organization) ────────────────────────────
  IF q SIMILAR TO '%(region|division|organization|org chart|organizational)' OR
     q LIKE '%regions and divisions%' THEN
    answer := '## Organization Module

### Structure
```
Region (REGCODE)
  └── Division (DIVCODE)
        └── Schools / Offices (STACODE)
```

### Regions
- Each region has a unique `region_code` (e.g., `IV-A`)
- Regions group divisions geographically
- Managed under **Organization → Regions & Divisions**

### Divisions
- Each division belongs to a region and has a unique `division_code` (e.g., `1801`)
- Divisions are the primary scoping unit for all data
- Each user profile is assigned to a division

### Schools / Organization Directory
- Schools are linked to divisions via `division_id`
- Each school has a `school_code` (STACODE) and `school_name`
- Used for employee assignment and STACODE validation

### Division Office Settings
- Configure the division office details (name, address, TIN, signatories)
- Used in payroll reports and remittance summaries
- Upload division logo for official documents';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Salary Schedule ──────────────────────────────────────────────
  IF q SIMILAR TO '%(salary|salary.?schedule|salary.?grade|step|nbc|tranche|compensation)' THEN
    answer := '## Salary Schedule

### Overview
SCRIVIA CLOUD uses the **NBC 601 Third Tranche** salary standardization table effective **January 1, 2026**.

### Structure
| Grade | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 |
|-------|--------|--------|--------|--------|--------|--------|--------|--------|
| 1 | ₱13,000 | ... | ... | ... | ... | ... | ... | ... |
| 11 | ₱30,028 | ... | ... | ... | ... | ... | ... | ... |
| 33 | ₱103,592 | ... | ... | ... | ... | ... | ... | ... |

- **33 salary grades** with **8 steps** each = 258 total entries
- **Third Tranche** is the final step of the SSL (Salary Standardization Law)

### How it connects to payroll
- Each employee has a `grade` and `step`
- The payroll engine looks up the corresponding salary from the schedule
- Monthly basic salary = the grade-step value from the schedule

### Managing
- Go to **Organization → Salary Schedule**
- View/edit salary grades and steps
- Import from Excel if needed';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Post a pay period ────────────────────────────────────────────
  IF q SIMILAR TO '%(posting|posted|post payroll|post the)' THEN
    answer := '## Posting Payroll Entries

### What happens when you post
1. All draft payroll entries for the period are marked as **Posted**
2. The `prevent_posted_entry_modification()` trigger prevents any UPDATE/DELETE on posted entries
3. The pay period status is updated to reflect the posting
4. Posted entries appear in reports and remittance summaries

### Can I undo a posting?
- Yes, but only via **Reverse Payroll Period** (requires super admin)
- Reversing changes all posted entries back to draft status
- The reversal is logged in the audit trail

### Safety checks
- NTHP (Non-Taxable Highest Pay) validation runs before posting
- Entries with validation errors are flagged and must be resolved first
- Only entries in "draft" status can be posted';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── DBF import ───────────────────────────────────────────────────
  IF q SIMILAR TO '%(dbf|psi pop|psipop|smart import|import|upload|file import)' THEN
    answer := '## DBF Import & Smart Import

### Smart Import (DBF Files)
SCRIVIA CLOUD can import data from legacy DepEd DBF files:

| DBF File | Table | Purpose |
|----------|-------|---------|
| MASTERFILE.DBF | `employees` | Employee records |
| PYENT.DBF | `dbf_pyent` | Payroll entries |
| PAYROLLS.DBF | `payrolls_dbf` | Payroll master |
| DIVTABLE.DBF | `dbf_divtable` | Division table |
| STNTABLE.DBF | `dbf_stntable` | Station table |
| EXCLUDED.DBF | `dbf_excluded` | Excluded employees |
| INCLUDED.DBF | `dbf_included` | Included employees |

### How to import
1. Go to **Employee Management** → **Smart Import**
2. Select the DBF file
3. Preview the records
4. Click **Import** — new employees are added, existing ones are updated

### PSIPOP PDF Import
- For plantilla positions from the PSIPOP PDF
- Go to **Plantilla Positions** → **Import PDF**
- The system extracts position data using OCR (Tesseract.js)

### Validation
- STACODE validation runs during import
- Invalid STACODEs are flagged for review
- Duplicate employee numbers are handled gracefully';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Current division stats (live data) ────────────────────────────
  IF q SIMILAR TO '%(dashboard|stats|statistics|summary|how (many|much) (employee|record|data))%' OR
     q LIKE '%current status%' OR q LIKE '%what is the current%' THEN
    SELECT count(*) INTO v_count FROM employees;
    SELECT COALESCE(sum(net_pay), 0) INTO v_total FROM payroll_entries WHERE status = 'Posted';
    answer := format('## Current System Status

### Database Summary
| Metric | Value |
|--------|-------|
| Total employees | %s |
| Active employees | (check Dashboard) |
| Posted payroll total | ₱%s |
| Pay periods | (check Payroll → Periods) |
| Deduction codes | (check Deduction Codes) |

### Quick health check
- Salary schedule: 258 entries (33 grades × 8 steps)
- Payroll groups: 3 configured (Elementary 001–499, Junior HS 500–699, Senior HS 700–701)
- Division scoping: %s

%s', v_count, to_char(v_total, 'FM999,999,999.00'),
  CASE WHEN is_scoped THEN format('Active — scoped to %s (%s)', COALESCE(division_name, region_name), COALESCE(divcode, regcode))
       ELSE 'Super Admin — full system access' END,
  CASE WHEN is_scoped THEN format('> Your division scope: **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, 'N/A'), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE '> You have full access to all divisions.' END);
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Users & Roles ────────────────────────────────────────────────
  IF q SIMILAR TO '%(user|role|permission|access|admin|super.?admin|approval|sign.?up|register)' OR
     q LIKE '%user management%' THEN
    answer := '## Users & Roles

### Available Roles
| Role | Access Level |
|------|-------------|
| `super_admin` | Full system access, all divisions |
| `payroll_admin` | Payroll management, reports |
| `payroll_processor` | Run payroll, compute entries |
| `hr_administrator` | Employee management |
| `school_coordinator` | School-level operations |
| `school_head` | School-level read/approve |
| `accounting_officer` | Financial reports |
| `division_finance` | Division financial ops |
| `auditor` | Read-only audit access |
| `read_only` | Basic read access |

### User approval workflow
1. New users register via the Sign Up page
2. Account starts as `pending_approval`
3. Admin approves via **Administration → Users & Roles**
4. Approved users get their assigned role

### MFA (Multi-Factor Authentication)
- Can be enabled per user
- Uses TOTP (Time-based One-Time Password)
- Admin can force MFA for all users

### Security
- Failed login attempts are tracked
- Account locks after 5 failed attempts (30-minute cooldown)
- Session timeout: 15 minutes of inactivity
- All actions are logged in the audit trail';
    RETURN jsonb_build_object('reply', answer);
  END IF;

  -- ── Default / fallback ───────────────────────────────────────────
  answer := format('I can help you with SCRIVIA CLOUD! Here are some things you can ask:

### Quick examples
- *"How do I run payroll?"* — Step-by-step payroll workflow
- *"How are GSIS deductions computed?"* — Mandatory deduction formulas
- *"Explain REGCODE/DIVCODE scoping"* — Division data partitioning
- *"What modules are in the system?"* — Full module overview
- *"How do I post a pay period?"* — Posting and locking workflow
- *"How many employees are there?"* — Live system stats
- *"What reports are available?"* — Report Center guide

### Your current scope
%s

> **Tip**: Be specific in your question for the best answer. For example, instead of "payroll", try "How do I run the monthly payroll for my division?"

> **Note**: This copilot has deep knowledge of SCRIVIA CLOUD''s modules, workflows, and data model. It can query live data when asked about counts, statuses, and summaries.',
  CASE WHEN is_scoped THEN format('Scoped to **%s** (REGCODE: %s, DIVCODE: %s)', COALESCE(division_name, region_name), COALESCE(regcode, 'N/A'), COALESCE(divcode, 'N/A'))
       ELSE 'You are logged in as **Super Admin** with access to all divisions.' END);

  RETURN jsonb_build_object('reply', answer);
END;
$$;


--
-- Name: approve_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_user(p_target_user uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can approve users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'approved',
        approved_by = caller_id,
        approved_at = now(),
        rejection_reason = NULL,
        rejected_by = NULL,
        rejected_at = NULL,
        disabled_by = NULL,
        disabled_at = NULL
    WHERE id = p_target_user
      AND status IN ('pending_approval', 'rejected', 'disabled')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not in an approvable state';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_approved', 'profiles', p_target_user::text,
          jsonb_build_object('approved_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


--
-- Name: assign_schools_to_division(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_schools_to_division(p_division_id uuid, p_school_ids uuid[]) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_assigned int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = p_division_id, updated_at = now()
  WHERE id = ANY(p_school_ids);
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_assigned', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_assigned));

  RETURN jsonb_build_object('success', true, 'assigned', v_assigned);
END;
$$;


--
-- Name: cleanup_expired_otps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_otps() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now() OR used = true;
END;
$$;


--
-- Name: clear_schools_from_division(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_schools_from_division(p_division_id uuid, p_school_ids uuid[]) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_cleared int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign schools';
  END IF;

  UPDATE schools SET division_id = NULL, updated_at = now()
  WHERE id = ANY(p_school_ids) AND division_id = p_division_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_schools_cleared', 'divisions', p_division_id::text,
    jsonb_build_object('school_count', v_cleared));

  RETURN jsonb_build_object('success', true, 'cleared', v_cleared);
END;
$$;


--
-- Name: delete_division(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_division(p_division_id uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_emp_count int;
  v_school_count int;
  v_user_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage divisions';
  END IF;

  SELECT count(*) INTO v_emp_count FROM employees WHERE division_id = p_division_id;
  SELECT count(*) INTO v_school_count FROM schools WHERE division_id = p_division_id;
  SELECT count(*) INTO v_user_count FROM profiles WHERE division_id = p_division_id;
  IF v_emp_count + v_school_count + v_user_count > 0 THEN
    RAISE EXCEPTION 'Division still has data assigned (% employees, % schools, % users). Reassign or remove it first.',
      v_emp_count, v_school_count, v_user_count;
  END IF;

  DELETE FROM divisions WHERE id = p_division_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_delete', 'divisions', p_division_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: delete_region(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_region(p_region_id uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_division_count int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  SELECT count(*) INTO v_division_count FROM divisions WHERE region_id = p_region_id;
  IF v_division_count > 0 THEN
    RAISE EXCEPTION 'Region has % division(s). Remove them first.', v_division_count;
  END IF;

  DELETE FROM regions WHERE id = p_region_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'region_delete', 'regions', p_region_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: delete_role_permission(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_role_permission(p_role text, p_permission text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_removed boolean;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.role_permissions
  WHERE role = p_role AND permission = p_permission
  RETURNING true INTO v_removed;

  IF v_removed THEN
    INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
    SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
           jsonb_build_object('role', p_role, 'permission', p_permission, 'restored_default', true)
    FROM profiles u WHERE u.id = auth.uid();
  END IF;
END;
$$;


--
-- Name: disable_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_user(p_target_user uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can disable users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'disabled',
        disabled_by = caller_id,
        disabled_at = now()
    WHERE id = p_target_user
      AND status IN ('approved', 'rejected', 'pending_approval')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or already disabled';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_disabled', 'profiles', p_target_user::text,
          jsonb_build_object('disabled_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


--
-- Name: enable_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_user(p_target_user uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can enable users';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'approved',
        disabled_by = NULL,
        disabled_at = NULL
    WHERE id = p_target_user
      AND status = 'disabled'
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not disabled';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_enabled', 'profiles', p_target_user::text,
          jsonb_build_object('enabled_email', target_email));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


--
-- Name: enforce_posted_entry_invariants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_posted_entry_invariants() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_period_status text;
BEGIN
  IF NEW.status = 'Posted' THEN
    IF COALESCE(NEW.net_pay, 0) < 5000 THEN
      RAISE EXCEPTION 'NTHP violation: an entry cannot be posted with net pay below 5000';
    END IF;

    IF NEW.pay_period_id IS NOT NULL THEN
      SELECT status INTO v_period_status FROM pay_periods WHERE id = NEW.pay_period_id;
      IF v_period_status = 'closed' THEN
        RAISE EXCEPTION 'Pay period is closed; entries cannot be posted into it';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_non_plantilla_before_upsert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_non_plantilla_before_upsert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Auto-generate complete_name: "SURNAME, FIRST_NAME MIDDLE_NAME"
  NEW.complete_name = trim(
    coalesce(NEW.surname, '') || ', ' ||
    coalesce(NEW.first_name, '') ||
    CASE WHEN coalesce(NEW.middle_name, '') <> '' THEN ' ' || NEW.middle_name ELSE '' END
  );

  -- Normalize empty strings for unique-constrained optional fields
  NEW.tin = nullif(trim(coalesce(NEW.tin, '')), '');
  NEW.pagibig_number = nullif(trim(coalesce(NEW.pagibig_number, '')), '');
  NEW.philhealth = nullif(trim(coalesce(NEW.philhealth, '')), '');
  NEW.landbank = nullif(trim(coalesce(NEW.landbank, '')), '');

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: generate_monthly_periods(integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_monthly_periods(p_year integer, p_regcode text DEFAULT NULL::text, p_divcode text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int := 0;
  v_month int;
  v_start date;
  v_end date;
  v_pay_date date;
  v_period_name text;
BEGIN
  FOR v_month IN 1..12 LOOP
    v_start := make_date(p_year, v_month, 1);
    v_end := (make_date(p_year, v_month, 1) + interval '1 month' - interval '1 day')::date;
    v_pay_date := (make_date(p_year, v_month, 1) + interval '1 month' + interval '14 days')::date;
    v_period_name := to_char(v_start, 'Month') || ' ' || p_year::text;

    INSERT INTO pay_periods (period_name, start_date, end_date, pay_date, frequency, status, month, year, period_number, regcode, divcode)
    SELECT v_period_name, v_start, v_end, v_pay_date, 'Monthly', 'draft', v_month, p_year, v_month, p_regcode, p_divcode
    WHERE NOT EXISTS (
      SELECT 1 FROM pay_periods
      WHERE year = p_year
        AND month = v_month
        AND regcode IS NOT DISTINCT FROM p_regcode
        AND divcode IS NOT DISTINCT FROM p_divcode
    );

    v_count := v_count + (ROW_COUNT() > 0)::int;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: get_current_user_division_codes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_division_codes() RETURNS text[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT ARRAY[r.region_code, d.division_code]
  FROM profiles p
  JOIN divisions d ON d.id = p.division_id
  JOIN regions r ON r.id = d.region_id
  WHERE p.id = auth.uid();
$$;


--
-- Name: get_current_user_empno(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_empno() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT COALESCE(employee_number, username) FROM profiles WHERE id = auth.uid();
$$;


--
-- Name: get_current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT lower(btrim(role)) FROM profiles
  WHERE id = auth.uid() AND status = 'approved';
$$;


--
-- Name: get_current_user_stacode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_stacode() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT assigned_stacode FROM profiles WHERE id = auth.uid();
$$;


--
-- Name: get_dashboard_summary(text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_summary(category text DEFAULT NULL::text, p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[]) RETURNS json
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
WITH caller AS MATERIALIZED (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS MATERIALIZED (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
scope_div_ids AS MATERIALIZED (
  -- division uuid(s) implied by the selected REGCODE/DIVCODE scope
  SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
),
scoped_emps AS MATERIALIZED (
  SELECT id, stacode, status, empno, employee_number, regcode, divcode, created_at,
         fname, first_name, lname, last_name, poscode, position, basic, basic_salary,
         (CASE WHEN stacode ~ '^[0-9]+$' THEN NULLIF(stacode, '')::int END) AS stacode_num
  FROM employees
  WHERE
    CASE
      WHEN category = 'elementary' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 1 AND 499
      WHEN category = 'highschool' THEN stacode ~ '^[0-9]+$' AND stacode::int BETWEEN 500 AND 701
      ELSE true
    END
    AND (
      -- super_admin: follow the selected REGCODE/DIVCODE scope (or division ids)
      ((SELECT role FROM caller) = 'super_admin' AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
        OR division_id IN (SELECT id FROM scope_div_ids)
        OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
      ))
      OR
      -- everyone else: clamped to their own division (if assigned) — by id OR
      -- by REGCODE/DIVCODE so imported legacy rows stay visible
      ((SELECT role FROM caller) <> 'super_admin' AND (
        (SELECT division_id FROM caller) IS NULL
        OR division_id = (SELECT division_id FROM caller)
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE employees.regcode = cc.region_code AND employees.divcode = cc.division_code
        )
      ))
    )
),
active_emps AS MATERIALIZED (
  SELECT * FROM scoped_emps WHERE status = 'Active'
),
-- One pass over payroll_entries for all entry-based KPIs. Using
-- employee_id = ANY(<scoped ids>) instead of a JOIN forces the planner
-- to scan payroll_entries ONCE (index-accelerated) rather than once per
-- scoped employee.
entry_agg AS MATERIALIZED (
  SELECT
    COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
    COALESCE(SUM(pe.net_pay), 0) AS total_net,
    COALESCE(SUM(pe.dedlnr + pe.dedmed + pe.dedpag + pe.dedtax), 0) AS total_mandatory,
    COALESCE(SUM(pe.other_deductions), 0) AS total_loan_deds,
    COUNT(*) FILTER (WHERE pe.status = 'Posted') AS processed_count,
    COUNT(*) FILTER (WHERE pe.status = 'Computed') AS pending_count
  FROM payroll_entries pe
  WHERE pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
-- The division's own current period: same scope rules as scoped_emps,
-- applied to pay_periods via REGCODE/DIVCODE (plus legacy uncoded
-- periods for callers with no assigned division).
current_period AS MATERIALIZED (
  SELECT * FROM pay_periods
  WHERE (
    ((SELECT role FROM caller) = 'super_admin' AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
      OR (regcode = p_regcode AND divcode = ANY(p_divcodes))
    ))
    OR
    ((SELECT role FROM caller) <> 'super_admin' AND (
      (SELECT division_id FROM caller) IS NULL
      OR (regcode IS NULL AND divcode IS NULL)
      OR EXISTS (
        SELECT 1 FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = pay_periods.regcode
          AND d.division_code = pay_periods.divcode
          AND d.id = (SELECT division_id FROM caller)
      )
    ))
  )
  ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
  LIMIT 1
),
group_counts AS MATERIALIZED (
  SELECT g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max,
    COUNT(e.id) AS emp_count
  FROM payroll_groups g
  LEFT JOIN active_emps e ON
    g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
    AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL
  GROUP BY g.id, g.group_code, g.group_name, g.stacode_min, g.stacode_max
),
unassigned AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM active_emps e
  WHERE e.stacode_num IS NULL
     OR NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode_num BETWEEN g.stacode_min AND g.stacode_max
    )
),
ded_totals AS MATERIALIZED (
  SELECT pd.dedcode, COALESCE(dc.dedname, pd.dedcode) AS dedname,
    COUNT(*) AS cnt, SUM(pd.dedamt) AS total
  FROM payroll_deductions pd
  LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  WHERE pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
  GROUP BY pd.dedcode, dc.dedname
  ORDER BY total DESC
  LIMIT 8
),
loan_accounts AS MATERIALIZED (
  SELECT COUNT(*) AS cnt FROM payroll_deductions pd
  WHERE pd.type = 'Loan' AND pd.status = 'Active'
    AND pd.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
),
recent_emps AS MATERIALIZED (
  SELECT e.id, e.empno, e.employee_number, e.fname, e.first_name, e.lname, e.last_name,
         e.poscode, e.position, e.regcode, e.basic, e.basic_salary
  FROM scoped_emps e
  ORDER BY e.created_at DESC
  LIMIT 5
)
SELECT json_build_object(
  'totalRecords', (SELECT COUNT(*) FROM scoped_emps),
  'activeEmployees', (SELECT COUNT(*) FROM active_emps),
  'totalGross', (SELECT total_gross FROM entry_agg),
  'totalNet', (SELECT total_net FROM entry_agg),
  'totalMandatory', (SELECT total_mandatory FROM entry_agg),
  'totalLoanDeds', (SELECT total_loan_deds FROM entry_agg),
  'processedCount', (SELECT processed_count FROM entry_agg),
  'pendingCount', (SELECT pending_count FROM entry_agg),
  'currentPeriod', (SELECT to_json(cp) FROM current_period cp),
  'periodNet', COALESCE((SELECT SUM(pe.net_pay)
    FROM payroll_entries pe
    WHERE pe.pay_period_id = (SELECT id FROM current_period)
      AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))), 0),
  'groupStats', COALESCE((SELECT json_agg(json_build_object(
    'id', gc.id, 'group_code', gc.group_code, 'group_name', gc.group_name,
    'stacode_min', gc.stacode_min, 'stacode_max', gc.stacode_max, 'count', gc.emp_count
  ) ORDER BY gc.stacode_min) FROM group_counts gc), '[]'::json),
  'unassignedCount', (SELECT cnt FROM unassigned),
  'activeLoanAccounts', (SELECT cnt FROM loan_accounts),
  'dedTotalsByCode', COALESCE((SELECT json_agg(json_build_object(
    'code', dt.dedcode, 'name', dt.dedname, 'count', dt.cnt, 'total', dt.total
  )) FROM ded_totals dt), '[]'::json),
  'recentEmployees', COALESCE((SELECT json_agg(json_build_object(
    'id', re.id, 'empno', re.empno, 'employee_number', re.employee_number,
    'fname', re.fname, 'first_name', re.first_name,
    'lname', re.lname, 'last_name', re.last_name,
    'poscode', re.poscode, 'position', re.position,
    'regcode', re.regcode, 'basic', re.basic, 'basic_salary', re.basic_salary
  )) FROM recent_emps re), '[]'::json)
);
$_$;


--
-- Name: get_dbf_table_counts_by_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dbf_table_counts_by_category() RETURNS TABLE(table_name text, total bigint, elementary bigint, highschool bigint)
    LANGUAGE sql
    SET search_path TO 'public'
    AS $_$
  -- Tables with a direct stacode column (text, numeric-only codes)
  SELECT 'dbf_stntable'::text AS table_name,
    count(*)::bigint AS total,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint AS elementary,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint AS highschool
  FROM dbf_stntable
  UNION ALL
  SELECT 'dbf_divtable',
    count(*)::bigint, NULL::bigint, NULL::bigint
  FROM dbf_divtable
  UNION ALL
  SELECT 'dbf_included',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_included
  UNION ALL
  SELECT 'dbf_excluded',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_excluded
  UNION ALL
  SELECT 'dbf_payrolls',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_payrolls
  UNION ALL
  SELECT 'dbf_pyent',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent
  UNION ALL
  SELECT 'dbf_pyent1',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent1
  UNION ALL
  SELECT 'dbf_pyent2',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM dbf_pyent2
  -- MASTFILE: employees.stacode
  UNION ALL
  SELECT 'employees',
    count(*)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE stacode ~ '^\d+$' AND stacode::int BETWEEN 500 AND 701)::bigint
  FROM employees
  -- DEDFILE: payroll_deductions joined to employees for stacode
  UNION ALL
  SELECT 'payroll_deductions',
    count(*)::bigint,
    count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 1 AND 499)::bigint,
    count(*) FILTER (WHERE e.stacode ~ '^\d+$' AND e.stacode::int BETWEEN 500 AND 701)::bigint
  FROM payroll_deductions pd
  LEFT JOIN employees e ON e.id = pd.employee_id
$_$;


--
-- Name: get_deduction_engine_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_deduction_engine_stats() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  WITH active_deds AS (
    SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status, dc.type, dc.agency, dc.active AS code_active
    FROM payroll_deductions pd
    LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
  ),
  emp_gross AS (
    SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
    FROM employees WHERE status = 'Active'
  )
  SELECT jsonb_build_object(
    'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'grossPay', (SELECT total FROM emp_gross),
    'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'groupTotals', (
      SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT
          CASE
            WHEN agency = 'GSIS' THEN 'gsis'
            WHEN agency = 'BIR' THEN 'bir'
            WHEN agency = 'PHILHEALTH' THEN 'philhealth'
            WHEN agency = 'PAGIBIG' THEN 'pagibig'
            WHEN agency = 'DEPED' THEN 'deped'
            WHEN agency = 'INSURANCE' THEN 'insurance'
            WHEN agency = 'BANK' THEN 'banks'
            WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
            WHEN agency = 'ASSOCIATION' THEN 'associations'
            WHEN type = 'Loan' THEN 'loans'
            ELSE 'others'
          END AS group_id,
          COUNT(*) AS count,
          SUM(dedamt) AS amount
        FROM active_deds
        WHERE ded_status = 'Active' AND code_active = true
        GROUP BY 1
      ) g
    )
  );
$$;


--
-- Name: get_deduction_engine_stats(text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_deduction_engine_stats(p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  WITH scoped_emps AS (
    SELECT id, empno, status, basic, basic_salary, pera
      FROM employees
     WHERE (p_regcode IS NULL OR regcode = p_regcode)
       AND (p_divcodes IS NULL OR divcode = ANY(p_divcodes))
  ),
  scoped_deds AS (
    SELECT pd.dedamt, pd.dedcode, pd.status AS ded_status,
           dc.type, dc.agency, dc.active AS code_active
      FROM payroll_deductions pd
      LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
     WHERE p_regcode IS NULL AND p_divcodes IS NULL
        OR pd.employee_id IN (SELECT id FROM scoped_emps)
        OR pd.empno IN (SELECT empno FROM scoped_emps WHERE empno IS NOT NULL AND empno <> '')
  ),
  active_deds AS (
    SELECT * FROM scoped_deds
  ),
  emp_gross AS (
    SELECT COALESCE(SUM(COALESCE(basic, 0) + COALESCE(basic_salary, 0) + COALESCE(pera, 0)), 0) AS total
      FROM scoped_emps
     WHERE status = 'Active'
  )
  SELECT jsonb_build_object(
    'totalDeductions', (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'grossPay', (SELECT total FROM emp_gross),
    'netPay', (SELECT total FROM emp_gross) - (SELECT COALESCE(SUM(dedamt), 0) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'activeCount', (SELECT COUNT(*) FROM active_deds WHERE ded_status = 'Active' AND code_active = true),
    'groupTotals', (
      SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT
          CASE
            WHEN agency = 'GSIS' THEN 'gsis'
            WHEN agency = 'BIR' THEN 'bir'
            WHEN agency = 'PHILHEALTH' THEN 'philhealth'
            WHEN agency = 'PAGIBIG' THEN 'pagibig'
            WHEN agency = 'DEPED' THEN 'deped'
            WHEN agency = 'INSURANCE' THEN 'insurance'
            WHEN agency = 'BANK' THEN 'banks'
            WHEN agency = 'COOPERATIVE' THEN 'cooperatives'
            WHEN agency = 'ASSOCIATION' THEN 'associations'
            WHEN type = 'Loan' THEN 'loans'
            ELSE 'others'
          END AS group_id,
          COUNT(*) AS count,
          SUM(dedamt) AS amount
        FROM active_deds
        WHERE ded_status = 'Active' AND code_active = true
        GROUP BY 1
      ) g
    )
  );
$$;


--
-- Name: get_deductions_summary(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_deductions_summary(p_period_id uuid, p_emp_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'totalCount', COUNT(*),
    'totalAmount', COALESCE(SUM(amount), 0),
    'codeCount', COUNT(DISTINCT deduction_code),
    'empCount', COUNT(DISTINCT employee_id)
  )
  FROM deductions
  WHERE pay_period_id = p_period_id
    AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;


--
-- Name: get_payroll_group_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_payroll_group_counts() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT payroll_group_id AS group_id, COUNT(*) AS count
    FROM employees
    WHERE status = 'Active' AND payroll_group_id IS NOT NULL
    GROUP BY payroll_group_id
  ) row;
$$;


--
-- Name: get_payroll_history_by_month(integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_payroll_history_by_month(p_year integer, p_regcode text DEFAULT NULL::text, p_divcode text DEFAULT NULL::text) RETURNS TABLE(period_id uuid, month integer, year integer, period_name text, status text, pay_date date, employee_count bigint, total_gross numeric, total_deductions numeric, total_net numeric, total_undeducted numeric, nthp_pass_count bigint, nthp_fail_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH caller AS MATERIALIZED (
  SELECT role, division_id FROM profiles WHERE id = auth.uid()
),
caller_codes AS MATERIALIZED (
  SELECT r.region_code, d.division_code
  FROM divisions d JOIN regions r ON d.region_id = r.id
  WHERE d.id = (SELECT division_id FROM caller)
),
is_super AS MATERIALIZED (
  SELECT (SELECT role FROM caller) = 'super_admin' AS v
),
-- Employees in scope: super_admin follows the requested REGCODE/DIVCODE
-- (global when null); everyone else is clamped to their own division (by
-- id, by legacy codes, or all when no division is assigned).
scoped_emps AS MATERIALIZED (
  SELECT e.id FROM employees e
  WHERE
    ((SELECT v FROM is_super) AND (
      (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
      OR e.regcode = p_regcode AND e.divcode = p_divcode
      OR e.division_id IN (
        SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = p_regcode AND d.division_code = p_divcode
      )
    ))
    OR
    (NOT (SELECT v FROM is_super) AND (
      (SELECT division_id FROM caller) IS NULL
      OR e.division_id = (SELECT division_id FROM caller)
      OR EXISTS (
        SELECT 1 FROM caller_codes cc
        WHERE e.regcode = cc.region_code AND e.divcode = cc.division_code
      )
    ))
),
scoped_periods AS MATERIALIZED (
  SELECT pp.id, pp.month, pp.year, pp.period_name, pp.status, pp.pay_date
  FROM pay_periods pp
  WHERE pp.year = p_year
    AND (
      ((SELECT v FROM is_super) AND (
        (p_regcode IS NULL OR p_regcode = '' OR p_divcode IS NULL OR p_divcode = '')
        OR pp.regcode = p_regcode AND pp.divcode = p_divcode
      ))
      OR
      (NOT (SELECT v FROM is_super) AND (
        (SELECT division_id FROM caller) IS NULL
        OR pp.regcode IS NULL OR pp.divcode IS NULL
        OR EXISTS (
          SELECT 1 FROM caller_codes cc
          WHERE pp.regcode = cc.region_code AND pp.divcode = cc.division_code
        )
      ))
    )
)
SELECT
  p.id, p.month, p.year, p.period_name, p.status, p.pay_date,
  COUNT(pe.id) AS employee_count,
  COALESCE(SUM(pe.gross_pay), 0) AS total_gross,
  COALESCE(SUM(pe.total_deductions), 0) AS total_deductions,
  COALESCE(SUM(pe.net_pay), 0) AS total_net,
  COALESCE(SUM(pe.undeducted_amount), 0) AS total_undeducted,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'PASS') AS nthp_pass_count,
  COUNT(pe.id) FILTER (WHERE pe.nthp_status = 'FAIL') AS nthp_fail_count
FROM scoped_periods p
LEFT JOIN payroll_entries pe
  ON pe.pay_period_id = p.id
 AND pe.employee_id = ANY(ARRAY(SELECT id FROM scoped_emps))
GROUP BY p.id, p.month, p.year, p.period_name, p.status, p.pay_date
ORDER BY p.month ASC;
$$;


--
-- Name: get_payroll_register_totals(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_payroll_register_totals(p_period_id uuid DEFAULT NULL::uuid, p_emp_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'totalGross', COALESCE(SUM(gross_pay), 0),
    'totalDedlnr', COALESCE(SUM(dedlnr), 0),
    'totalDedmed', COALESCE(SUM(dedmed), 0),
    'totalDedpag', COALESCE(SUM(dedpag), 0),
    'totalDedtax', COALESCE(SUM(dedtax), 0),
    'totalOtherDeds', COALESCE(SUM(COALESCE(actual_loan_deductions, other_deductions, 0)), 0),
    'totalDeductions', COALESCE(SUM(total_deductions), 0),
    'totalNet', COALESCE(SUM(net_pay), 0),
    'totalUndeducted', COALESCE(SUM(COALESCE(undeducted_amount, 0)), 0),
    'nthpFails', COUNT(*) FILTER (WHERE nthp_status = 'FAIL'),
    'entryCount', COUNT(*)
  )
  FROM payroll_entries
  WHERE (p_period_id IS NULL OR pay_period_id = p_period_id)
    AND (p_emp_ids IS NULL OR employee_id = ANY(p_emp_ids));
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role text NOT NULL,
    permission text NOT NULL,
    granted boolean NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_permissions_permission_check CHECK ((permission = ANY (ARRAY['dashboard'::text, 'employees'::text, 'groups'::text, 'salary'::text, 'deductions'::text, 'dedmaster'::text, 'dedengine'::text, 'payroll'::text, 'taxcalc'::text, 'reports'::text, 'stacode'::text, 'user_management'::text, 'audit_logs'::text, 'system_settings'::text, 'dbf_restore'::text, 'comm_allowance'::text]))),
    CONSTRAINT role_permissions_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text, 'payroll_processor'::text, 'accounting_officer'::text, 'hr_administrator'::text, 'school_coordinator'::text, 'division_finance'::text, 'auditor'::text, 'school_head'::text, 'ess'::text, 'read_only'::text])))
);


--
-- Name: get_role_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_role_permissions() RETURNS SETOF public.role_permissions
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT * FROM public.role_permissions;
$$;


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(user_uuid uuid DEFAULT auth.uid()) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = user_uuid;
  RETURN COALESCE(user_role, 'viewer');
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  user_count int;
  assigned_role text;
  assigned_status text;
BEGIN
  SELECT count(*) INTO user_count FROM profiles;
  IF user_count = 0 THEN
    assigned_role := 'super_admin';
    assigned_status := 'approved';
  ELSE
    assigned_role := 'read_only';
    assigned_status := 'pending_approval';
  END IF;

  INSERT INTO public.profiles (
    id, email, first_name, last_name, mobile_number, username,
    role, email_verified, status,
    office_assignment, position_designation, employee_number
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    assigned_role,
    false,
    assigned_status,
    NULLIF(NEW.raw_user_meta_data->>'office_assignment', ''),
    NULLIF(NEW.raw_user_meta_data->>'position_designation', ''),
    NULLIF(NEW.raw_user_meta_data->>'employee_number', '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: has_role_level(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role_level(p_min_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH role_rank(rn, role_name) AS (
    VALUES
      (1, 'read_only'),
      (2, 'ess'),
      (3, 'school_head'),
      (4, 'school_coordinator'),
      (5, 'auditor'),
      (6, 'division_finance'),
      (7, 'hr_administrator'),
      (8, 'accounting_officer'),
      (9, 'payroll_processor'),
      (10, 'payroll_admin'),
      (11, 'super_admin')
  )
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_rank caller ON caller.role_name = lower(btrim(p.role))
    JOIN role_rank minimum ON minimum.role_name = lower(btrim(p_min_role))
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND caller.rn >= minimum.rn
  );
$$;


--
-- Name: hash_otp(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_otp(otp_code text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN crypt(otp_code, gen_salt('bf'));
END;
$$;


--
-- Name: is_data_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_data_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT get_current_user_role() IN (
  'super_admin', 'payroll_admin', 'payroll_processor',
  'accounting_officer', 'hr_administrator',
  'division_finance', 'auditor', 'read_only'
);
$$;


--
-- Name: is_data_writer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_data_writer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT get_current_user_role() IN (
  'super_admin',
  'payroll_admin',
  'payroll_processor',
  'payroll_officer',
  'hr_administrator'
);
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(btrim(role)) = 'super_admin'
  );
$$;


--
-- Name: issue_mfa_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_mfa_code(p_email text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_code text;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    -- Do not reveal whether the account exists.
    RETURN true;
  END IF;

  -- Invalidate any outstanding code, then issue exactly one new one.
  UPDATE otp_codes SET used = true
  WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false;

  v_code := lpad(((floor(random() * 900000) + 100000))::bigint::text, 6, '0');

  INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
  VALUES (v_user_id, crypt(v_code, gen_salt('bf')), 'mfa', now() + interval '5 minutes');

  RETURN true;
END;
$$;


--
-- Name: log_table_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_table_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_action text;
  v_user_email text;
  v_record_id text;
BEGIN
  -- Bulk payroll runs (run_payroll_bulk) suppress per-row audit
  -- rows and write one summary row instead; see the migration
  -- 20260818_optimize_payroll_run_bulk_audit.sql.
  IF current_setting('app.skip_audit', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_action := TG_ARGV[0];
  v_record_id := COALESCE(NEW.id::text, OLD.id::text);

  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    v_user_email,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'new', CASE WHEN TG_OP IN ('Insert','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: mark_email_verified(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_email_verified() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Email not confirmed by auth provider';
  END IF;

  UPDATE profiles SET email_verified = true WHERE id = auth.uid();
END;
$$;


--
-- Name: post_payroll(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_payroll(p_pay_period_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_violation_count integer;
  v_entry_count integer;
  v_employee_ids uuid[];
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized to post payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period_status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is already closed';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period posting (closes the shared period).
    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries SET status = 'Posted' WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'closed' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped posting: only the given employees' entries are posted.
    -- The shared pay period is left open so other divisions post independently.
    v_employee_ids := p_employee_ids;
    IF v_caller_role <> 'super_admin' THEN
      -- Server-enforced clamp: non-super-admins can only post their own
      -- division's employees (defense in depth against crafted ids). Matches
      -- by division_id first, then by REGCODE + DIVCODE for legacy rows.
      SELECT array_agg(e.id) INTO v_employee_ids
        FROM employees e
        JOIN profiles p ON p.id = auth.uid()
        LEFT JOIN divisions d ON d.id = p.division_id
        LEFT JOIN regions r ON r.id = d.region_id
        WHERE e.id = ANY(p_employee_ids)
          AND (
            e.division_id = p.division_id
            OR (
              r.region_code IS NOT NULL AND d.division_code IS NOT NULL
              AND e.regcode = r.region_code AND e.divcode = d.division_code
            )
          );
    END IF;
    IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    SELECT count(*) INTO v_violation_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids)
        AND net_pay < 5000;
    IF v_violation_count > 0 THEN
      RAISE EXCEPTION 'NTHP violation: % entries have net pay below 5000', v_violation_count;
    END IF;

    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No payroll entries to post';
    END IF;

    UPDATE payroll_entries
      SET status = 'Posted'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(v_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_approve', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_posted', v_entry_count);
END;
$$;


--
-- Name: prevent_closed_period_reopen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_closed_period_reopen() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot reopen a closed pay period';
END;
$$;


--
-- Name: prevent_posted_entry_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_posted_entry_modification() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role = 'super_admin' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF v_caller_role = 'super_admin' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
         OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
         OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
         OR NEW.dedlnr IS DISTINCT FROM OLD.dedlnr
         OR NEW.dedmed IS DISTINCT FROM OLD.dedmed
         OR NEW.dedpag IS DISTINCT FROM OLD.dedpag
         OR NEW.dedtax IS DISTINCT FROM OLD.dedtax
         OR NEW.actual_loan_deductions IS DISTINCT FROM OLD.actual_loan_deductions
         OR NEW.undeducted_amount IS DISTINCT FROM OLD.undeducted_amount
         OR NEW.nthp_status IS DISTINCT FROM OLD.nthp_status THEN
        RAISE EXCEPTION 'Cannot modify financial data on a posted entry';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot modify a posted payroll entry without changing status';
  END IF;

  RAISE EXCEPTION 'Posted payroll entries are locked';
END;
$$;


--
-- Name: protect_profile_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_is_self_update boolean;
BEGIN
  SELECT p.role INTO v_role
  FROM profiles p
  WHERE p.id = auth.uid() AND p.status = 'approved';

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  v_is_self_update := (auth.uid() = NEW.id AND auth.uid() = OLD.id);

  -- Columns nobody except an approved super_admin may change, on any row.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change role';
  END IF;
  IF NEW.assigned_stacode IS DISTINCT FROM OLD.assigned_stacode THEN
    RAISE EXCEPTION 'Not authorized to change assigned STACODE';
  END IF;
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Not authorized to change employee number';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not authorized to change account status';
  END IF;
  IF NEW.division_code IS DISTINCT FROM OLD.division_code THEN
    RAISE EXCEPTION 'Not authorized to change division code';
  END IF;

  IF v_is_self_update THEN
    -- Login tracking, email_verified and mfa_enabled remain self-writable so
    -- record_successful_login / mark_email_verified keep working.
    RETURN NEW;
  END IF;

  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    RAISE EXCEPTION 'Not authorized to change MFA settings';
  END IF;
  -- Email verification: false -> true is allowed for ANY row whose auth user
  -- has actually confirmed the email (auth.users.email_confirmed_at). This
  -- lets the sync trigger below (no JWT in context) and the RPC both work,
  -- without allowing anyone to flip verification for an unconfirmed account.
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified
     AND NOT (OLD.email_verified = false AND NEW.email_verified = true
              AND EXISTS (
                SELECT 1 FROM auth.users u
                WHERE u.id = NEW.id AND u.email_confirmed_at IS NOT NULL
              )) THEN
    RAISE EXCEPTION 'Not authorized to change email verification status';
  END IF;
  IF NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts THEN
    RAISE EXCEPTION 'Not authorized to change login attempt count';
  END IF;
  IF NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN
    RAISE EXCEPTION 'Not authorized to unlock accounts';
  END IF;
  IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'Not authorized to change login timestamp';
  END IF;
  IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN
    RAISE EXCEPTION 'Not authorized to change login IP';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: query_dedfile(text, text, text, text, text, integer, integer, text, text, integer, integer, boolean, uuid[], text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.query_dedfile(p_search text DEFAULT NULL::text, p_stacode text DEFAULT NULL::text, p_dedcode text DEFAULT NULL::text, p_empno text DEFAULT NULL::text, p_period text DEFAULT NULL::text, p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_sort_key text DEFAULT 'empno'::text, p_sort_dir text DEFAULT 'asc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_count_only boolean DEFAULT false, p_division_ids uuid[] DEFAULT NULL::uuid[], p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_sort_col text;
  v_sort_dir_clause text;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));

  -- Build WHERE clause
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L OR e.stacode ILIKE %L OR e.regcode ILIKE %L OR e.divcode ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows — by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
  END IF;

  IF p_stacode IS NOT NULL AND p_stacode != 'All' AND p_stacode != '' THEN
    v_where := v_where || format(' AND e.stacode = %L', p_stacode);
  END IF;

  IF p_dedcode IS NOT NULL AND p_dedcode != 'All' AND p_dedcode != '' THEN
    v_where := v_where || format(' AND pd.dedcode = %L', p_dedcode);
  END IF;

  IF p_empno IS NOT NULL AND trim(p_empno) != '' THEN
    v_where := v_where || format(' AND pd.empno ILIKE %L', '%'||trim(p_empno)||'%');
  END IF;

  IF p_period IS NOT NULL AND trim(p_period) != '' THEN
    v_where := v_where || format(' AND lpad(pd.effyy::text, 4, ''0'') || lpad(pd.effmm::text, 2, ''0'') ILIKE %L', '%'||trim(p_period)||'%');
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND e.stacode_num >= %s AND e.stacode_num <= %s', p_stacode_min, p_stacode_max);
  END IF;

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
    v_where := v_where || format(' AND e.division_id = ANY(%L::uuid[])', p_division_ids);
  END IF;

  -- Determine sort column
  v_sort_col := CASE lower(coalesce(p_sort_key, 'empno'))
    WHEN 'empno' THEN 'pd.empno'
    WHEN 'dedcode' THEN 'pd.dedcode'
    WHEN 'dedamt' THEN 'pd.dedamt'
    WHEN 'policyno' THEN 'pd.policyno'
    WHEN 'agency' THEN 'pd.agency'
    WHEN 'status' THEN 'pd.status'
    WHEN 'type' THEN 'pd.type'
    WHEN 'lname' THEN 'e.lname'
    WHEN 'stacode' THEN 'e.stacode'
    WHEN 'effyy' THEN 'pd.effyy'
    WHEN 'effmm' THEN 'pd.effmm'
    WHEN 'principal' THEN 'pd.principal'
    WHEN 'netpay' THEN 'e.netpay'
    ELSE 'pd.empno'
  END;

  v_sort_dir_clause := CASE lower(coalesce(p_sort_dir, 'asc'))
    WHEN 'desc' THEN 'DESC'
    ELSE 'ASC'
  END;

  -- Count total
  EXECUTE format(
    'SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s',
    v_where
  ) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno,
             pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             pd.agency, pd.status, pd.type,
             pd.created_by, pd.created_at, pd.updated_by, pd.updated_at,
             e.lname, e.last_name, e.fname, e.first_name, e.mi, e.appel,
             e.stacode, e.regcode, e.divcode, e.netpay, e.updcode, e.update,
             e.paydate, e.editor, e.hiredate, e.hire_date, e.birthdate, e.gsis_pn
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY %s %s, pd.dedcode ASC
      LIMIT %s OFFSET %s
    ) r',
    v_where, v_sort_col, v_sort_dir_clause, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;


--
-- Name: query_employees(text, integer, integer, text, uuid, text, integer, integer, boolean, text, text, uuid, uuid[], text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.query_employees(p_search text DEFAULT NULL::text, p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_group_id uuid DEFAULT NULL::uuid, p_stacode text DEFAULT NULL::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10, p_count_only boolean DEFAULT false, p_scope_column text DEFAULT NULL::text, p_scope_value text DEFAULT NULL::text, p_division_id uuid DEFAULT NULL::uuid, p_division_ids uuid[] DEFAULT NULL::uuid[], p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (empno ILIKE %L OR employee_number ILIKE %L OR lname ILIKE %L OR last_name ILIKE %L OR fname ILIKE %L OR first_name ILIKE %L OR mi ILIKE %L OR middle_name ILIKE %L OR poscode ILIKE %L OR department ILIKE %L OR stacode ILIKE %L OR empname ILIKE %L OR account ILIKE %L OR banker ILIKE %L OR tin ILIKE %L OR gsis_id ILIKE %L OR gsis_pn ILIKE %L OR hdmf_id ILIKE %L OR phic_id ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  -- Division scoping (server-enforced): super_admin may filter by the selected
  -- division(s). REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows that
  -- were mapped after import but carry no codes. Everyone else is clamped to
  -- their own division — by id OR by the division's REGCODE/DIVCODE so
  -- imported legacy rows without a stamped division_id stay visible.
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
      v_where := v_where || format(
        ' AND (division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (regcode = %L AND divcode = ANY(%L::text[])))',
        p_regcode, p_divcodes, p_regcode, p_divcodes
      );
    ELSIF p_division_ids IS NOT NULL AND cardinality(p_division_ids) > 0 THEN
      v_where := v_where || format(' AND division_id = ANY(%L::uuid[])', p_division_ids);
    ELSIF p_division_id IS NOT NULL THEN
      v_where := v_where || format(' AND division_id = %L', p_division_id::text);
    END IF;
  ELSIF v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (division_id = %L OR (regcode = (get_current_user_division_codes())[1] AND divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
  END IF;

  -- Scope filter for role-based data segregation
  IF p_scope_column IS NOT NULL AND p_scope_value IS NOT NULL AND p_scope_column != '' THEN
    IF p_scope_column = 'stacode' THEN
      v_where := v_where || format(' AND stacode = %L', p_scope_value);
    ELSIF p_scope_column = 'empno' THEN
      v_where := v_where || format(' AND (empno = %L OR employee_number = %L)', p_scope_value, p_scope_value);
    END IF;
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(' AND stacode_num >= %s AND stacode_num <= %s', p_stacode_min, p_stacode_max);
  ELSIF p_stacode IS NOT NULL AND p_stacode != '' THEN
    v_where := v_where || format(' AND stacode = %L', p_stacode);
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    v_where := v_where || format(' AND status = %L', p_status);
  END IF;

  IF p_group_id IS NOT NULL THEN
    v_where := v_where || format(' AND payroll_group_id = %L', p_group_id::text);
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM employees WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(e)), ''[]''::jsonb) FROM (SELECT * FROM employees WHERE true %s ORDER BY lname, fname LIMIT %s OFFSET %s) e',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;


--
-- Name: query_payroll_deductions(text, text, text, text, text[], integer, integer, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.query_payroll_deductions(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_type_filter text DEFAULT NULL::text, p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[], p_stacode_min integer DEFAULT NULL::integer, p_stacode_max integer DEFAULT NULL::integer, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10, p_count_only boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_where text := '';
  v_search text;
  v_total int;
  v_rows jsonb;
  v_offset int;
  v_caller_role text;
  v_my_division uuid;
BEGIN
  v_search := trim(coalesce(p_search, ''));
  IF v_search != '' THEN
    v_where := v_where || format(
      ' AND (pd.empno ILIKE %L OR pd.dedcode ILIKE %L OR pd.policyno ILIKE %L OR pd.dedid ILIKE %L OR pd.agency ILIKE %L OR e.lname ILIKE %L OR e.last_name ILIKE %L OR e.fname ILIKE %L OR e.first_name ILIKE %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != 'All' THEN
    v_where := v_where || format(' AND pd.status = %L', p_status_filter);
  END IF;

  IF p_type_filter IS NOT NULL AND p_type_filter != 'All' THEN
    v_where := v_where || format(' AND pd.type = %L', p_type_filter);
  END IF;

  IF p_stacode_min IS NOT NULL AND p_stacode_max IS NOT NULL THEN
    v_where := v_where || format(
      ' AND e.stacode IS NOT NULL AND e.stacode ~ %L AND substring(e.stacode from %s)::int BETWEEN %s AND %s',
      '^[0-9]+$', '1', p_stacode_min, p_stacode_max
    );
  END IF;

  -- Server-enforced clamp: non-super_admins can only ever see their own
  -- division's deduction rows — by division_id OR by the division's
  -- REGCODE/DIVCODE (imported legacy rows may carry codes but no division_id).
  SELECT role, division_id INTO v_caller_role, v_my_division FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'super_admin' AND v_my_division IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (e.division_id = %L OR (e.regcode = (get_current_user_division_codes())[1] AND e.divcode = (get_current_user_division_codes())[2]))',
      v_my_division::text
    );
  END IF;

  -- Division scoping: REGCODE + DIVCODE codes are the unique reference for a
  -- division's payroll; division_id (uuid) is kept as a fallback for rows
  -- that were mapped after import but carry no codes.
  IF p_regcode IS NOT NULL AND p_regcode != '' AND p_divcodes IS NOT NULL AND cardinality(p_divcodes) > 0 THEN
    v_where := v_where || format(
      ' AND (e.division_id IN (SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id WHERE r.region_code = %L AND d.division_code = ANY(%L::text[])) OR (e.regcode = %L AND e.divcode = ANY(%L::text[])))',
      p_regcode, p_divcodes, p_regcode, p_divcodes
    );
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM payroll_deductions pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE true %s', v_where) INTO v_total;

  IF p_count_only THEN
    RETURN jsonb_build_object('total', v_total, 'rows', '[]'::jsonb);
  END IF;

  v_offset := GREATEST(p_page, 0) * p_page_size;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (
      SELECT pd.id, pd.employee_id, pd.empno, pd.dedcode, pd.dedid, pd.policyno, pd.agency,
             pd.type, pd.status, pd.effmm, pd.effyy, pd.termm, pd.teryy,
             pd.dedamt, pd.principal, pd.interest, pd.charges, pd.proceeds,
             e.lname, e.last_name, e.fname, e.first_name, e.mi
      FROM payroll_deductions pd
      LEFT JOIN employees e ON pd.employee_id = e.id
      WHERE true %s
      ORDER BY pd.empno, pd.dedcode
      LIMIT %s OFFSET %s
    ) r',
    v_where, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$_$;


--
-- Name: query_schools_with_stats(text, uuid[], text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.query_schools_with_stats(p_school_type text DEFAULT NULL::text, p_division_ids uuid[] DEFAULT NULL::uuid[], p_regcode text DEFAULT NULL::text, p_divcodes text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, school_code text, school_name text, school_type text, cluster text, address text, school_head text, contact_number text, email text, status text, total_employees bigint, teaching_personnel bigint, non_teaching_personnel bigint, active_payroll_employees bigint)
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  SELECT
    s.id,
    s.school_code,
    s.school_name,
    s.school_type,
    s.cluster,
    s.address,
    s.school_head,
    s.contact_number,
    s.email,
    s.status,
    COALESCE(st.total, 0) AS total_employees,
    COALESCE(st.teaching, 0) AS teaching_personnel,
    COALESCE(st.non_teaching, 0) AS non_teaching_personnel,
    COALESCE(st.active, 0) AS active_payroll_employees
  FROM schools s
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE e.poscode ~ '^[12]') AS teaching,
      COUNT(*) FILTER (WHERE e.poscode IS NOT NULL AND e.poscode <> '' AND e.poscode !~ '^[12]') AS non_teaching,
      COUNT(*) FILTER (WHERE e.status = 'Active') AS active
    FROM employees e
    WHERE e.stacode = s.school_code
  ) st ON true
  WHERE (p_school_type IS NULL OR s.school_type = p_school_type)
    AND (
      -- Unscoped
      (p_division_ids IS NULL OR cardinality(p_division_ids) = 0)
      AND (p_regcode IS NULL OR p_regcode = '' OR p_divcodes IS NULL OR cardinality(p_divcodes) = 0)
      OR
      -- Scoped: school mapped to the selected division(s)…
      s.division_id = ANY(p_division_ids)
      OR s.division_id IN (
        SELECT d.id FROM divisions d JOIN regions r ON d.region_id = r.id
        WHERE r.region_code = p_regcode AND d.division_code = ANY(p_divcodes)
      )
      OR
      -- …or its employees carry the selected REGCODE/DIVCODE (STACODE = school code)
      EXISTS (
        SELECT 1 FROM employees e
        WHERE e.stacode = s.school_code
          AND e.regcode = p_regcode
          AND e.divcode = ANY(p_divcodes)
      )
    )
  ORDER BY s.school_code;
$$;


--
-- Name: record_failed_login(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_login(p_email text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile record;
  v_attempts integer;
  v_caller_email text;
BEGIN
  -- If the caller is authenticated, they may only record failed logins
  -- for their own email. This prevents an authenticated user from
  -- locking out another user's account by calling this RPC with a
  -- different email.
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_caller_email FROM profiles WHERE id = auth.uid();
    IF v_caller_email IS NOT NULL AND v_caller_email != lower(p_email) THEN
      RAISE EXCEPTION 'Not authorized to record login attempts for another user';
    END IF;
  END IF;

  SELECT id, failed_login_attempts INTO v_profile
  FROM profiles WHERE email = lower(p_email);
  IF v_profile IS NULL THEN RETURN; END IF;

  v_attempts := COALESCE(v_profile.failed_login_attempts, 0) + 1;

  IF v_attempts >= 5 THEN
    UPDATE profiles
    SET failed_login_attempts = v_attempts,
        locked_until = now() + interval '30 minutes'
    WHERE id = v_profile.id;
  ELSE
    UPDATE profiles
    SET failed_login_attempts = v_attempts
    WHERE id = v_profile.id;
  END IF;
END;
$$;


--
-- Name: record_successful_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_successful_login() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = 0,
      locked_until = NULL,
      last_login_at = now()
  WHERE id = auth.uid();
END;
$$;


--
-- Name: refresh_dashboard_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_dashboard_cache() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_total_records        int;
  v_active_employees     int;
  v_total_gross          numeric;
  v_total_net            numeric;
  v_total_mandatory      numeric;
  v_total_loan_deds      numeric;
  v_processed_count      int;
  v_pending_count        int;
  v_period_net           numeric;
  v_active_loan_accounts int;
  v_unassigned_count     int;
  v_group_stats          jsonb;
  v_ded_totals           jsonb;
  v_recent_employees     jsonb;
  v_current_period       jsonb;
  v_current_period_id    uuid;
BEGIN
  -- Employee counts
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Active')
  INTO v_total_records, v_active_employees
  FROM employees;

  -- Payroll entry aggregates
  SELECT
    COALESCE(SUM(gross_pay), 0),
    COALESCE(SUM(net_pay), 0),
    COALESCE(SUM(dedlnr + dedmed + dedpag + dedtax), 0),
    COALESCE(SUM(other_deductions), 0),
    COUNT(*) FILTER (WHERE status = 'Posted'),
    COUNT(*) FILTER (WHERE status = 'Computed')
  INTO v_total_gross, v_total_net, v_total_mandatory, v_total_loan_deds,
       v_processed_count, v_pending_count
  FROM payroll_entries;

  -- Current period
  SELECT id, to_jsonb(p)
  INTO v_current_period_id, v_current_period
  FROM pay_periods p
  ORDER BY CASE WHEN status != 'closed' THEN 0 ELSE 1 END, start_date DESC
  LIMIT 1;

  -- Net pay for current period
  SELECT COALESCE(SUM(net_pay), 0)
  INTO v_period_net
  FROM payroll_entries
  WHERE pay_period_id = v_current_period_id;

  -- Active loan accounts
  SELECT COUNT(*)
  INTO v_active_loan_accounts
  FROM payroll_deductions
  WHERE type = 'Loan' AND status = 'Active';

  -- Payroll group counts
  SELECT COALESCE(json_agg(json_build_object(
    'id', g.id, 'group_code', g.group_code, 'group_name', g.group_name,
    'stacode_min', g.stacode_min, 'stacode_max', g.stacode_max,
    'count', (
      SELECT COUNT(*) FROM employees e
      WHERE e.status = 'Active'
        AND e.stacode ~ '^[0-9]+$'
        AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
    )
  ) ORDER BY g.stacode_min)::jsonb, '[]')
  INTO v_group_stats
  FROM payroll_groups g
  WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL;

  -- Unassigned count
  SELECT COUNT(*)
  INTO v_unassigned_count
  FROM employees e
  WHERE e.status = 'Active'
    AND NOT EXISTS (
      SELECT 1 FROM payroll_groups g
      WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
        AND e.stacode ~ '^[0-9]+$'
        AND e.stacode::int BETWEEN g.stacode_min AND g.stacode_max
    );

  -- Top 8 deduction codes by total
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'total' DESC), '[]')
  INTO v_ded_totals
  FROM (
    SELECT jsonb_build_object(
      'code', pd.dedcode,
      'name', COALESCE(dc.dedname, pd.dedcode),
      'count', COUNT(*),
      'total', SUM(pd.dedamt)
    ) AS row
    FROM payroll_deductions pd
    LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode
    WHERE pd.status = 'Active'
    GROUP BY pd.dedcode, dc.dedname
    ORDER BY SUM(pd.dedamt) DESC
    LIMIT 8
  ) sub;

  -- 5 most recently added employees
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'empno', e.empno, 'employee_number', e.employee_number,
    'fname', e.fname, 'first_name', e.first_name,
    'lname', e.lname, 'last_name', e.last_name,
    'poscode', e.poscode, 'position', e.position,
    'regcode', e.regcode, 'basic', e.basic, 'basic_salary', e.basic_salary
  )), '[]')
  INTO v_recent_employees
  FROM (SELECT * FROM employees ORDER BY created_at DESC LIMIT 5) e;

  -- Write to cache (upsert the singleton row)
  INSERT INTO dashboard_stats_cache (
    id, total_records, active_employees, total_gross, total_net,
    total_mandatory, total_loan_deds, processed_count, pending_count,
    period_net, active_loan_accounts, unassigned_count,
    group_stats, ded_totals_by_code, recent_employees, current_period, refreshed_at
  ) VALUES (
    1, v_total_records, v_active_employees, v_total_gross, v_total_net,
    v_total_mandatory, v_total_loan_deds, v_processed_count, v_pending_count,
    v_period_net, v_active_loan_accounts, v_unassigned_count,
    v_group_stats, v_ded_totals, v_recent_employees, v_current_period, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    total_records        = EXCLUDED.total_records,
    active_employees     = EXCLUDED.active_employees,
    total_gross          = EXCLUDED.total_gross,
    total_net            = EXCLUDED.total_net,
    total_mandatory      = EXCLUDED.total_mandatory,
    total_loan_deds      = EXCLUDED.total_loan_deds,
    processed_count      = EXCLUDED.processed_count,
    pending_count        = EXCLUDED.pending_count,
    period_net           = EXCLUDED.period_net,
    active_loan_accounts = EXCLUDED.active_loan_accounts,
    unassigned_count     = EXCLUDED.unassigned_count,
    group_stats          = EXCLUDED.group_stats,
    ded_totals_by_code   = EXCLUDED.ded_totals_by_code,
    recent_employees     = EXCLUDED.recent_employees,
    current_period       = EXCLUDED.current_period,
    refreshed_at         = EXCLUDED.refreshed_at;
END;
$_$;


--
-- Name: reject_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_user(p_target_user uuid, p_reason text) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_email text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can reject users';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  caller_id := auth.uid();

  UPDATE profiles
    SET status = 'rejected',
        rejection_reason = p_reason,
        rejected_by = caller_id,
        rejected_at = now()
    WHERE id = p_target_user
      AND status IN ('pending_approval', 'approved')
    RETURNING email INTO target_email;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'User not found or not in a rejectable state';
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (caller_id, (SELECT email FROM profiles WHERE id = caller_id),
          'user_rejected', 'profiles', p_target_user::text,
          jsonb_build_object('rejected_email', target_email, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'email', target_email);
END;
$$;


--
-- Name: request_dashboard_refresh(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_dashboard_refresh() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT refresh_dashboard_cache(); $$;


--
-- Name: reverse_payroll(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reverse_payroll(p_pay_period_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_entry_count integer;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  IF p_employee_ids IS NULL OR cardinality(p_employee_ids) = 0 THEN
    -- Legacy whole-period reversal (requires a closed period).
    IF v_period_status <> 'closed' THEN
      RAISE EXCEPTION 'Pay period is not posted — nothing to reverse';
    END IF;
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries WHERE pay_period_id = p_pay_period_id;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id;
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  ELSE
    -- Division-scoped reversal: un-post only the given employees' entries and
    -- leave the shared period status untouched (other divisions may still be
    -- working on the same period).
    SELECT count(*) INTO v_entry_count
      FROM payroll_entries
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
    IF v_entry_count = 0 THEN
      RAISE EXCEPTION 'No posted entries to reverse for the selected division';
    END IF;
    UPDATE payroll_entries
      SET status = 'Computed'
      WHERE pay_period_id = p_pay_period_id
        AND employee_id = ANY(p_employee_ids);
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_entry_count)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_entry_count);
END;
$$;


--
-- Name: reverse_payroll_period(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reverse_payroll_period(p_pay_period_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_period_status text;
  v_reversed int;
BEGIN
  SELECT lower(trim(role)) INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized to reverse payroll';
  END IF;

  SELECT status INTO v_period_status FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;

  UPDATE payroll_entries
    SET status = 'Computed'
    WHERE pay_period_id = p_pay_period_id AND status = 'Posted';
  GET DIAGNOSTICS v_reversed = ROW_COUNT;

  -- A closed (fully posted) period is reopened so it can be edited/run again.
  IF v_period_status = 'closed' THEN
    UPDATE pay_periods SET status = 'draft' WHERE id = p_pay_period_id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_reverse', 'pay_period', p_pay_period_id::text,
         jsonb_build_object('entries_reversed', v_reversed, 'whole_period', true)
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object('success', true, 'entries_reversed', v_reversed);
END;
$$;


--
-- Name: run_payroll_engine(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_payroll_engine(p_pay_period_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_caller_role text;
  v_period record;
  v_employee_ids uuid[];
  v_payyy int;
  v_paymm int;
  v_payym int;
  v_unassigned int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_unded_written int := 0;
  v_deleted int := 0;
  v_ded_lines_written int := 0;
  v_unded_total numeric := 0;
  v_rowcount int;
  r_emp record;
  v_basic numeric; v_pera numeric; v_long numeric;
  v_gross numeric; v_dedlnr numeric; v_dedmed numeric; v_dedpag numeric; v_dedtax numeric;
  v_govtlnr numeric; v_govtecc numeric; v_govtmed numeric; v_govtpag numeric;
  v_taxable numeric; v_mandatory numeric; v_available numeric;
  v_deds jsonb;
  v_sorted jsonb;
  v_mandatory_loans numeric;
  v_loan_lines jsonb;
  v_nthp jsonb;
  v_entry_id uuid;
  v_actual_total numeric;
  v_unded_amount numeric;
  v_paydate timestamptz;
BEGIN
  -- Large runs exceed the caller's (30s) statement_timeout — give this engine
  -- room to finish. Bounded so a genuinely stuck run still aborts.
  SET LOCAL statement_timeout = '10 min';

  SELECT lower(btrim(role)) INTO v_caller_role
  FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor',
    'payroll_officer', 'hr_administrator'
  ) THEN
    RAISE EXCEPTION 'Not authorized to run payroll';
  END IF;

  SELECT * INTO v_period FROM pay_periods WHERE id = p_pay_period_id;
  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'Pay period not found';
  END IF;
  IF v_period.status = 'closed' THEN
    RAISE EXCEPTION 'Pay period is closed';
  END IF;

  -- Division scope (same clamp as run_payroll_bulk / post_payroll)
  IF v_caller_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_employee_ids FROM employees WHERE status = 'Active';
  ELSE
    SELECT array_agg(e.id) INTO v_employee_ids
    FROM employees e
    JOIN profiles p ON p.id = auth.uid()
    LEFT JOIN divisions d ON d.id = p.division_id
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE (
      e.division_id = p.division_id
      OR (
        r.region_code IS NOT NULL AND d.division_code IS NOT NULL
        AND e.regcode = r.region_code AND e.divcode = d.division_code AND e.status = 'Active'
      )
    );
  END IF;

  IF v_employee_ids IS NULL OR cardinality(v_employee_ids) = 0 THEN
    RAISE EXCEPTION 'No employees found in your division scope';
  END IF;

  -- Never clear already-posted entries for this period
  IF EXISTS (
    SELECT 1 FROM payroll_entries
    WHERE pay_period_id = p_pay_period_id
      AND employee_id = ANY(v_employee_ids)
      AND status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Cannot overwrite posted payroll entries; reverse the posted pay period first';
  END IF;

  -- STACODE validation (same gate as the client's Unassigned STACODE check)
  SELECT count(*) INTO v_unassigned
  FROM employees e
  WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
    AND (
      e.stacode IS NULL
      OR btrim(e.stacode) = ''
      OR e.stacode !~ '^[0-9]+$'
      OR NOT EXISTS (
        SELECT 1 FROM payroll_groups g
        WHERE g.status = 'Active' AND g.stacode_min IS NOT NULL AND g.stacode_max IS NOT NULL
          AND (CASE WHEN e.stacode ~ '^[0-9]+$' THEN e.stacode::int BETWEEN g.stacode_min AND g.stacode_max ELSE false END)
      )
    );
  IF v_unassigned > 0 THEN
    RAISE EXCEPTION 'Cannot generate payroll: % employee(s) have invalid or unassigned STACODE. Please fix their STACODE or review the Unassigned STACODE Report before running payroll.', v_unassigned;
  END IF;

  v_payyy := v_period.year;
  v_paymm := v_period.month;
  v_paydate := v_period.pay_date;

  -- Pay period key for deduction effectivity filtering
  v_payym := (CASE WHEN v_payyy < 100 THEN 2000 + v_payyy ELSE v_payyy END) * 100 + v_paymm;

  -- Pre-load active deductions once (effectivity depends only on the pay
  -- period), so the per-employee loop is an indexed temp-table probe instead
  -- of a correlated payroll_deductions query per employee.
  CREATE TEMP TABLE _active_deds ON COMMIT DROP AS
  SELECT
    e.id AS emp_id,
    d.dedcode,
    round(COALESCE(d.dedamt, 0), 2) AS dedamt,
    COALESCE(d.effyy, 0) AS effyy,
    COALESCE(d.effmm, 0) AS effmm,
    COALESCE(c.agency, '') AS agency,
    COALESCE(c.type, '') AS type,
    COALESCE(c.dedname, d.dedcode) AS dedname
  FROM payroll_deductions d
  LEFT JOIN deduction_codes c ON c.dedcode = d.dedcode
  JOIN employees e ON (d.employee_id IS NOT NULL AND e.id = d.employee_id)
                   OR (d.employee_id IS NULL
                       AND btrim(COALESCE(d.empno, '')) = btrim(COALESCE(e.empno, e.employee_number, ''))
                       AND btrim(COALESCE(e.empno, e.employee_number, '')) <> '')
  WHERE e.id = ANY(v_employee_ids)
    AND upper(COALESCE(d.status, '')) NOT IN ('TERMINATED', 'T')
    AND ((CASE WHEN COALESCE(d.effyy,0) < 100 THEN 2000 + d.effyy ELSE d.effyy END) * 100 + COALESCE(d.effmm, 0)) <= v_payym
    AND NOT (
      COALESCE(d.teryy, 0) > 0 AND COALESCE(d.termm, 0) > 0
      AND ((CASE WHEN d.teryy < 100 THEN 2000 + d.teryy ELSE d.teryy END) * 100 + d.termm) < v_payym
    );
  CREATE INDEX _active_deds_emp_idx ON _active_deds (emp_id);

  -- Suppress per-row audit + per-statement dashboard refreshes for this run
  PERFORM set_config('app.skip_audit', 'on', true);

  -- 1) Clear this division's previous computed entries, undeducted rows and
  --    run/INCLUDED-derived itemized deduction lines (manual lines are kept)
  DELETE FROM undeducted_obligations
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  DELETE FROM payroll_entries
  WHERE pay_period_id = p_pay_period_id AND employee_id = ANY(v_employee_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM deductions
  WHERE pay_period_id = p_pay_period_id
    AND employee_id = ANY(v_employee_ids)
    AND source IN ('Payroll Run', 'INCLUDED');

  -- 2) Compute every employee's entry
  FOR r_emp IN
    SELECT e.id,
           btrim(COALESCE(e.empno, e.employee_number, '')) AS empno,
           round(COALESCE(COALESCE(e.basic, e.basic_salary), 0), 2) AS basic,
           round(COALESCE(e.pera, 0), 2) AS pera,
           round(COALESCE(e.long, 0), 2) AS long,
           COALESCE(e.stacode, '') AS stacode
    FROM employees e
    WHERE e.id = ANY(v_employee_ids) AND e.status = 'Active'
    ORDER BY e.id
  LOOP
    v_basic := r_emp.basic;
    v_pera := r_emp.pera;
    v_long := r_emp.long;

    -- STEP 1 — gross
    v_gross := round(v_basic + v_pera + v_long, 2);

    -- STEP 2 — statutory mandatory deductions
    v_dedlnr := round(v_basic * 0.09, 2);
    v_dedmed := round(v_basic * 0.0249998422961678, 2);
    v_dedpag := 200;
    v_govtlnr := round(v_basic * 0.12, 2);
    v_govtecc := 100;
    v_govtmed := round(v_basic * 0.0250001577038322, 2);
    v_govtpag := 200;
    v_taxable := greatest(0, v_basic - v_dedlnr - v_dedmed - v_dedpag);
    v_dedtax := round(CASE
      WHEN v_taxable <= 20833 THEN 0
      WHEN v_taxable <= 33333 THEN (v_taxable - 20833) * 0.15
      WHEN v_taxable <= 66667 THEN 1875 + (v_taxable - 33333) * 0.20
      WHEN v_taxable <= 166667 THEN 8541.67 + (v_taxable - 66667) * 0.25
      WHEN v_taxable <= 666667 THEN 33541.67 + (v_taxable - 166667) * 0.30
      ELSE 183541.67 + (v_taxable - 666667) * 0.35
    END, 2);
    v_mandatory := round(v_dedlnr + v_dedmed + v_dedpag + v_dedtax, 2);
    v_available := round(v_gross - v_mandatory, 2);

    -- active deductions for this employee (pre-loaded temp-table lookup)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', d.dedcode,
             'dedamt', d.dedamt,
             'effyy', d.effyy,
             'effmm', d.effmm,
             'agency', d.agency,
             'type', d.type,
             'dedname', d.dedname
           )), '[]'::jsonb)
    INTO v_deds
    FROM _active_deds d
    WHERE d.emp_id = r_emp.id;

    -- mandatory loans total + their lines (deducted unconditionally)
    SELECT COALESCE(sum(round(COALESCE((x->>'dedamt')::numeric, 0), 2)), 0)
    INTO v_mandatory_loans
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dedcode', x->>'dedcode',
             'dedname', COALESCE(x->>'dedname', x->>'dedcode'),
             'dedamt', round(COALESCE((x->>'dedamt')::numeric, 0), 2)
           )), '[]'::jsonb)
    INTO v_loan_lines
    FROM jsonb_array_elements(v_deds) x
    WHERE _pd_mandatory_loan(x->>'agency', x->>'type');

    -- APDS deductions sorted by priority, then FIFO (effective date), then code
    SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_sorted
    FROM (
      SELECT jsonb_build_object(
        'dedcode', x.dedcode,
        'dedamt', x.dedamt,
        'agency', x.agency,
        'type', x.type,
        'dedname', x.dedname
      ) AS j
      FROM jsonb_to_recordset(v_deds) AS x(
        dedcode text, dedamt numeric, effyy int, effmm int,
        agency text, type text, dedname text
      )
      WHERE NOT _pd_mandatory(x.agency, x.type)
        AND NOT _pd_mandatory_loan(x.agency, x.type)
      ORDER BY
        _pd_priority(x.agency, x.type, x.dedcode),
        ((CASE WHEN x.effyy < 100 THEN 2000 + x.effyy ELSE x.effyy END) * 100 + x.effmm),
        x.dedcode
    ) s;

    v_nthp := public._pd_compute(v_available, v_sorted, v_mandatory_loans, r_emp.stacode);

    v_entry_id := gen_random_uuid();
    v_actual_total := round(
      COALESCE((v_nthp->>'actualLoanDeductions')::numeric, 0)
      + COALESCE((v_nthp->>'mandatoryLoanDeductions')::numeric, 0), 2);
    v_unded_amount := 0;
    SELECT COALESCE(sum(round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2)), 0)
    INTO v_unded_amount
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    v_unded_total := round(v_unded_total + v_unded_amount, 2);

    -- entry row
    INSERT INTO payroll_entries (
      id, employee_id, pay_period_id, gross_pay, total_deductions, net_pay,
      status, processed_at, dedlnr, dedmed, dedpag, dedtax,
      govtlnr, govtecc, govtmed, govtpag,
      other_deductions, nthp_status, undeducted_amount, actual_loan_deductions,
      available_balance, mandatory_deductions, loan_deduction_capacity
    ) VALUES (
      v_entry_id, r_emp.id, p_pay_period_id,
      v_gross,
      round(v_mandatory + v_actual_total, 2),
      round((v_nthp->>'finalNetPay')::numeric, 2),
      'Computed', now(),
      v_dedlnr, v_dedmed, v_dedpag, v_dedtax,
      v_govtlnr, v_govtecc, v_govtmed, v_govtpag,
      v_actual_total,
      v_nthp->>'nthpStatus',
      v_unded_amount,
      v_actual_total,
      round((v_nthp->>'availableBalance')::numeric, 2),
      v_mandatory,
      round((v_nthp->>'loanDeductionCapacity')::numeric, 2)
    );
    v_inserted := v_inserted + 1;

    -- undeducted obligations for this employee
    INSERT INTO undeducted_obligations (
      payroll_entry_id, employee_id, pay_period_id,
      deduction_code, deduction_description,
      undeducted_amount, scheduled_amount, station_code, reason
    )
    SELECT
      v_entry_id, r_emp.id, p_pay_period_id,
      u->>'deduction_code',
      u->>'deduction_description',
      round(COALESCE((u->>'undeducted_amount')::numeric, 0), 2),
      round(COALESCE((u->>'scheduled_amount')::numeric, 0), 2),
      COALESCE(u->>'station_code', ''),
      u->>'reason'
    FROM jsonb_array_elements(v_nthp->'undeducted') u;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_unded_written := v_unded_written + v_rowcount;

    -- 2b) Materialize the itemized deduction lines for this employee —
    --     statutory mandatory lines, mandatory loan lines, then the APDS
    --     loans actually deducted (FIFO stored order). created_at is
    --     stamped monotonically so the report engine renders them in
    --     exactly this sequence (FOXPRO: no sorting on render).
    INSERT INTO deductions (
      employee_id, pay_period_id, deduction_code, deduction_name, category,
      amount, source, reference, created_at
    )
    SELECT
      r_emp.id, p_pay_period_id, x.dedcode, x.dedname, x.category,
      round(x.amount, 2), 'Payroll Run', v_entry_id::text,
      now() + (x.ord * interval '1 microsecond')
    FROM (
      SELECT '0003' AS dedcode, 'GSIS PERSONAL SHARE' AS dedname, 'Mandatory' AS category, v_dedlnr AS amount, 1 AS ord
      UNION ALL SELECT '0036', 'WITHHOLDING TAX', 'Mandatory', v_dedtax, 2
      UNION ALL SELECT '0111', 'PHILHEALTH', 'Mandatory', v_dedmed, 3
      UNION ALL SELECT '0222', 'PAGIBIG FUND', 'Mandatory', v_dedpag, 4
      UNION ALL SELECT m->>'dedcode', COALESCE(m->>'dedname', m->>'dedcode'), 'Loan',
                    round(COALESCE((m->>'dedamt')::numeric, 0), 2), 5
               FROM jsonb_array_elements(v_loan_lines) m
      UNION ALL SELECT d->>'dedcode', COALESCE(d->>'dedname', d->>'dedcode'), 'Loan',
                    round(COALESCE((d->>'dedamt')::numeric, 0), 2), 6
               FROM jsonb_array_elements(COALESCE(v_nthp->'deducted', '[]'::jsonb)) d
    ) x
    WHERE x.amount > 0
    ORDER BY x.ord;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_ded_lines_written := v_ded_lines_written + v_rowcount;

    -- employee summary fields
    UPDATE employees e SET
      dedlnr = v_dedlnr, dedmed = v_dedmed, dedpag = v_dedpag, dedtax = v_dedtax,
      govtlnr = v_govtlnr, govtecc = v_govtecc, govtmed = v_govtmed, govtpag = v_govtpag,
      netpay = round((v_nthp->>'finalNetPay')::numeric, 2),
      paydate = v_paydate
    WHERE e.id = r_emp.id;
    v_updated := v_updated + 1;
  END LOOP;

  -- 3) Open the period
  UPDATE pay_periods SET status = 'open' WHERE id = p_pay_period_id;

  -- 4) Refresh the dashboard once + single summary audit row
  PERFORM refresh_dashboard_cache();
  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'payroll_generate', 'pay_period', p_pay_period_id::text,
         jsonb_build_object(
           'entries', v_inserted,
           'employees_updated', v_updated,
           'undeducted', v_unded_written,
           'deduction_lines', v_ded_lines_written,
           'deleted', v_deleted,
           'engine', 'run_payroll_engine'
         )
  FROM profiles u WHERE u.id = auth.uid();

  RETURN jsonb_build_object(
    'entries', v_inserted,
    'employees_updated', v_updated,
    'undeducted', v_unded_written,
    'deduction_lines', v_ded_lines_written,
    'deleted', v_deleted,
    'undeducted_amount', v_unded_total
  );
END;
$_$;


--
-- Name: set_assigned_stacode(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_assigned_stacode(p_target_user uuid, p_stacode text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'payroll_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Payroll Administrators may only assign schools to school-scoped accounts
  -- (School Head / School Payroll Coordinator).
  IF v_caller_role = 'payroll_admin'
     AND v_target_role NOT IN ('school_coordinator', 'school_head') THEN
    RAISE EXCEPTION 'Payroll Administrators can only assign a school to School Head and School Payroll Coordinator accounts';
  END IF;

  UPDATE profiles SET assigned_stacode = NULLIF(btrim(p_stacode), '') WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_stacode_assignment', 'profile', p_target_user,
  jsonb_build_object('assigned_stacode', p_stacode)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: set_employee_number(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_employee_number(p_target_user uuid, p_employee_number text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_old_emp_no text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT employee_number INTO v_old_emp_no FROM profiles WHERE id = p_target_user;

  UPDATE profiles
  SET employee_number = NULLIF(btrim(p_employee_number), '')
  WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_employee_number_change', 'profile', p_target_user,
  jsonb_build_object('old_employee_number', v_old_emp_no, 'new_employee_number', NULLIF(btrim(p_employee_number), ''))
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: set_payroll_def_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_payroll_def_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_user_division(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_division(p_target_user uuid, p_region_id uuid DEFAULT NULL::uuid, p_division_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign regions and divisions';
  END IF;

  UPDATE profiles
    SET region_id = p_region_id,
        division_id = p_division_id,
        updated_at = now()
    WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'user_division_change', 'profiles', p_target_user::text,
    jsonb_build_object('region_id', p_region_id, 'division_id', p_division_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: set_user_mfa(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_mfa(p_target_user uuid, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'Cannot toggle your own MFA';
  END IF;

  UPDATE profiles SET mfa_enabled = p_enabled WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_mfa_toggle', 'profile', p_target_user,
         jsonb_build_object('mfa_enabled', p_enabled)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: set_user_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_role(p_target_user uuid, p_new_role text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_target_current_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_new_role NOT IN (
    'super_admin', 'payroll_admin', 'payroll_processor', 'accounting_officer',
    'hr_administrator', 'school_coordinator', 'division_finance', 'auditor',
    'school_head', 'ess', 'read_only'
  ) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role INTO v_target_current_role FROM profiles WHERE id = p_target_user;
  IF v_target_current_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_target_user = auth.uid() AND p_new_role != 'super_admin' THEN
    RAISE EXCEPTION 'Cannot demote yourself';
  END IF;

  UPDATE profiles SET role = p_new_role WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_role_change', 'profile', p_target_user,
  jsonb_build_object('old_role', v_target_current_role, 'new_role', p_new_role)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: stamp_division_codes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_division_codes() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_division_id uuid;
  v_regcode text;
  v_divcode text;
BEGIN
  SELECT division_id INTO v_division_id
    FROM profiles
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_division_id IS NOT NULL THEN
    SELECT r.region_code, d.division_code
      INTO v_regcode, v_divcode
      FROM divisions d
      LEFT JOIN regions r ON r.id = d.region_id
     WHERE d.id = v_division_id
     LIMIT 1;

    IF v_regcode IS NOT NULL THEN
      NEW.regcode := COALESCE(NEW.regcode, v_regcode);
      NEW.divcode := COALESCE(NEW.divcode, v_divcode);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_email_verified_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_email_verified_from_auth() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
       SET email_verified = true
     WHERE id = NEW.id AND email_verified = false;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_employees_to_division(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_employees_to_division(p_division_id uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_updated int;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can assign employees';
  END IF;

  UPDATE employees e
    SET division_id = p_division_id
    FROM schools s
    WHERE s.division_id = p_division_id
      AND s.school_code = e.stacode
      AND (e.division_id IS DISTINCT FROM p_division_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (auth.uid(), (SELECT email FROM profiles WHERE id = auth.uid()), 'division_employees_synced', 'divisions', p_division_id::text,
    jsonb_build_object('employee_count', v_updated));

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: unlock_user_account(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlock_user_account(p_target_user uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE profiles
    SET failed_login_attempts = 0, locked_until = NULL
    WHERE id = p_target_user;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'user_account_unlock', 'profile', p_target_user, NULL
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: update_schools_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_schools_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: upsert_division(uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_division(p_division_id uuid DEFAULT NULL::uuid, p_region_id uuid DEFAULT NULL::uuid, p_region_code text DEFAULT NULL::text, p_division_code text DEFAULT NULL::text, p_division_name text DEFAULT NULL::text, p_features jsonb DEFAULT NULL::jsonb) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


--
-- Name: upsert_region(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_region(p_region_id uuid DEFAULT NULL::uuid, p_region_code text DEFAULT NULL::text, p_region_name text DEFAULT NULL::text, p_sort_order integer DEFAULT 0) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super administrators can manage regions';
  END IF;

  INSERT INTO regions (id, region_code, region_name, sort_order)
  VALUES (
    COALESCE(p_region_id, gen_random_uuid()),
    upper(trim(COALESCE(p_region_code, ''))),
    trim(COALESCE(p_region_name, '')),
    COALESCE(p_sort_order, 0)
  )
  ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM profiles WHERE id = auth.uid()),
    'region_upsert', 'regions', v_id::text,
    jsonb_build_object('code', upper(trim(COALESCE(p_region_code, ''))), 'name', trim(COALESCE(p_region_name, '')))
  );

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;


--
-- Name: upsert_role_permission(text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_role_permission(p_role text, p_permission text, p_granted boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Never allow locking the system out.
  IF p_role = 'super_admin' AND p_permission = 'user_management' AND p_granted = false THEN
    RAISE EXCEPTION 'The super_admin role must always have user_management access';
  END IF;

  INSERT INTO public.role_permissions (role, permission, granted, updated_by, updated_at)
  VALUES (p_role, p_permission, p_granted, auth.uid(), now())
  ON CONFLICT (role, permission)
  DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = now();

  INSERT INTO audit_logs (user_id, user_email, action, record_type, record_id, details)
  SELECT auth.uid(), u.email, 'role_permission_change', 'role_permissions', p_role || ':' || p_permission,
         jsonb_build_object('role', p_role, 'permission', p_permission, 'granted', p_granted)
  FROM profiles u WHERE u.id = auth.uid();
END;
$$;


--
-- Name: validate_employee_for_approval(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_employee_for_approval(p_employee_number text) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  emp_record record;
  stacode_num int;
  group_exists boolean;
BEGIN
  IF p_employee_number IS NULL OR btrim(p_employee_number) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Employee number is required');
  END IF;

  -- Look up employee by employee_number
  SELECT employee_number, status, stacode, first_name, last_name
    INTO emp_record
  FROM employees
  WHERE employee_number = btrim(p_employee_number)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Employee number not found in Masterfile');
  END IF;

  IF emp_record.status IS NULL OR emp_record.status <> 'Active' THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'Employee status is not Active (current: ' || COALESCE(emp_record.status, 'NULL') || ')');
  END IF;

  -- Validate stacode is numeric and within a known payroll group range
  IF emp_record.stacode IS NULL OR btrim(emp_record.stacode) = '' OR NOT (btrim(emp_record.stacode) ~ '^[0-9]+$') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'STACODE is missing or invalid');
  END IF;

  stacode_num := CAST(btrim(emp_record.stacode) AS int);

  SELECT EXISTS(
    SELECT 1 FROM payroll_groups
    WHERE status = 'Active'
      AND stacode_min IS NOT NULL
      AND stacode_max IS NOT NULL
      AND stacode_num >= stacode_min
      AND stacode_num <= stacode_max
  ) INTO group_exists;

  IF NOT group_exists THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'STACODE ' || stacode_num || ' does not belong to any active payroll group');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'employee_name', emp_record.first_name || ' ' || emp_record.last_name,
    'stacode', emp_record.stacode,
    'status', emp_record.status
  );
END;
$_$;


--
-- Name: verify_mfa_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_mfa_code(p_email text, p_code text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_otp record;
  v_claimed integer;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE email = lower(btrim(p_email));
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT * INTO v_otp
  FROM otp_codes
  WHERE user_id = v_user_id AND purpose = 'mfa' AND used = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_otp.id IS NULL OR v_otp.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_otp.attempts >= v_otp.max_attempts THEN
    UPDATE otp_codes SET used = true WHERE id = v_otp.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  END IF;

  IF crypt(p_code, v_otp.code_hash) <> v_otp.code_hash THEN
    UPDATE otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_code',
      'remaining', v_otp.max_attempts - (v_otp.attempts + 1)
    );
  END IF;

  -- Atomic single-use claim: only the first concurrent caller wins.
  UPDATE otp_codes SET used = true WHERE id = v_otp.id AND used = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: verify_otp(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_otp(otp_code text, stored_hash text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN crypt(otp_code, stored_hash) = stored_hash;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: http_request(); Type: FUNCTION; Schema: supabase_functions; Owner: -
--

CREATE FUNCTION supabase_functions.http_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'supabase_functions'
    AS $$
  DECLARE
    request_id bigint;
    payload jsonb;
    url text := TG_ARGV[0]::text;
    method text := TG_ARGV[1]::text;
    headers jsonb DEFAULT '{}'::jsonb;
    params jsonb DEFAULT '{}'::jsonb;
    timeout_ms integer DEFAULT 1000;
  BEGIN
    IF url IS NULL OR url = 'null' THEN
      RAISE EXCEPTION 'url argument is missing';
    END IF;

    IF method IS NULL OR method = 'null' THEN
      RAISE EXCEPTION 'method argument is missing';
    END IF;

    IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
      headers = '{"Content-Type": "application/json"}'::jsonb;
    ELSE
      headers = TG_ARGV[2]::jsonb;
    END IF;

    IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
      params = '{}'::jsonb;
    ELSE
      params = TG_ARGV[3]::jsonb;
    END IF;

    IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
      timeout_ms = 1000;
    ELSE
      timeout_ms = TG_ARGV[4]::integer;
    END IF;

    CASE
      WHEN method = 'GET' THEN
        SELECT http_get INTO request_id FROM net.http_get(
          url,
          params,
          headers,
          timeout_ms
        );
      WHEN method = 'POST' THEN
        payload = jsonb_build_object(
          'old_record', OLD,
          'record', NEW,
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA
        );

        SELECT http_post INTO request_id FROM net.http_post(
          url,
          payload,
          params,
          headers,
          timeout_ms
        );
      ELSE
        RAISE EXCEPTION 'method argument % is invalid', method;
    END CASE;

    INSERT INTO supabase_functions.hooks
      (hook_table_id, hook_name, request_id)
    VALUES
      (TG_RELID, TG_NAME, request_id);

    RETURN NEW;
  END
$$;


--
-- Name: extensions; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.extensions (
    id uuid NOT NULL,
    type text,
    settings jsonb,
    tenant_external_id text,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- Name: feature_flags; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.feature_flags (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    rollout_percentage integer DEFAULT 100 NOT NULL,
    bucket_key character varying(255),
    CONSTRAINT rollout_percentage_must_be_between_0_and_100 CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: tenants; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.tenants (
    id uuid NOT NULL,
    name text,
    external_id text,
    jwt_secret text,
    max_concurrent_users integer DEFAULT 200 NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    max_events_per_second integer DEFAULT 100 NOT NULL,
    postgres_cdc_default text DEFAULT 'postgres_cdc_rls'::text,
    max_bytes_per_second integer DEFAULT 100000 NOT NULL,
    max_channels_per_client integer DEFAULT 100 NOT NULL,
    max_joins_per_second integer DEFAULT 500 NOT NULL,
    suspend boolean DEFAULT false,
    jwt_jwks jsonb,
    notify_private_alpha boolean DEFAULT false,
    private_only boolean DEFAULT false NOT NULL,
    migrations_ran integer DEFAULT 0,
    broadcast_adapter character varying(255) DEFAULT 'gen_rpc'::character varying,
    max_presence_events_per_second integer DEFAULT 1000,
    max_payload_size_in_kb integer DEFAULT 3000,
    max_client_presence_events_per_window integer,
    client_presence_window_ms integer,
    presence_enabled boolean DEFAULT false NOT NULL,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    gcm_migrated_at timestamp(0) without time zone,
    CONSTRAINT jwt_secret_or_jwt_jwks_required CHECK (((jwt_secret IS NOT NULL) OR (jwt_jwks IS NOT NULL)))
);


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    record_type text,
    record_id text,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text,
    divcode text
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: ca_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ca_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_no text NOT NULL,
    last_name text NOT NULL,
    first_name text NOT NULL,
    middle_initial text DEFAULT ''::text,
    position_title text DEFAULT ''::text,
    school_name text DEFAULT ''::text,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    CONSTRAINT ca_employees_category_check CHECK ((category = ANY (ARRAY[''::text, 'Division Office'::text, 'Elementary'::text, 'Secondary'::text, 'LBA & LSA Teachers'::text, 'Utility Workers'::text, 'Without ATM'::text, 'Separated Employees'::text, 'Non-Plantilla'::text]))),
    CONSTRAINT ca_employees_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


--
-- Name: ca_payroll_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ca_payroll_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    line_no integer DEFAULT 0 NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    deduction numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount_due numeric(14,2) DEFAULT 0 NOT NULL,
    signature_image text,
    remarks text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ca_payroll_details_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT ca_payroll_details_deduction_check CHECK ((deduction >= (0)::numeric))
);


--
-- Name: ca_payroll_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ca_payroll_headers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_no text NOT NULL,
    payroll_type text DEFAULT 'Communication Allowance'::text NOT NULL,
    payroll_title text DEFAULT 'Communication Allowance'::text NOT NULL,
    agency text DEFAULT 'Department of Education'::text NOT NULL,
    division text DEFAULT 'Division of Calamba City'::text NOT NULL,
    school_name text DEFAULT ''::text NOT NULL,
    covered_period text DEFAULT ''::text NOT NULL,
    total_employees integer DEFAULT 0 NOT NULL,
    gross_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    alobs_no text DEFAULT ''::text,
    jev_no text DEFAULT ''::text,
    eo_no text DEFAULT ''::text,
    date date,
    payroll_ref_no text DEFAULT ''::text,
    remarks text DEFAULT ''::text,
    created_by text DEFAULT ''::text NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ca_payroll_headers_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Generated'::text, 'Reviewed'::text, 'Approved'::text, 'Posted'::text, 'Paid'::text, 'Archived'::text])))
);


--
-- Name: ca_payroll_signatories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ca_payroll_signatories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_id uuid NOT NULL,
    signatory_type text NOT NULL,
    name text DEFAULT ''::text,
    "position" text DEFAULT ''::text,
    sequence_no integer DEFAULT 0 NOT NULL
);


--
-- Name: dashboard_stats_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_stats_cache (
    id integer DEFAULT 1 NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    active_employees integer DEFAULT 0 NOT NULL,
    total_gross numeric DEFAULT 0 NOT NULL,
    total_net numeric DEFAULT 0 NOT NULL,
    total_mandatory numeric DEFAULT 0 NOT NULL,
    total_loan_deds numeric DEFAULT 0 NOT NULL,
    processed_count integer DEFAULT 0 NOT NULL,
    pending_count integer DEFAULT 0 NOT NULL,
    period_net numeric DEFAULT 0 NOT NULL,
    active_loan_accounts integer DEFAULT 0 NOT NULL,
    unassigned_count integer DEFAULT 0 NOT NULL,
    group_stats jsonb DEFAULT '[]'::jsonb NOT NULL,
    ded_totals_by_code jsonb DEFAULT '[]'::jsonb NOT NULL,
    recent_employees jsonb DEFAULT '[]'::jsonb NOT NULL,
    current_period jsonb,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_stats_cache_id_check CHECK ((id = 1))
);


--
-- Name: dbf_divtable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_divtable (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    divcode text NOT NULL,
    divname text DEFAULT ''::text NOT NULL,
    regcode text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    chief text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dbf_excluded; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_excluded (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text DEFAULT ''::text
);


--
-- Name: dbf_included; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_included (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text DEFAULT ''::text
);


--
-- Name: dbf_payrolls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_payrolls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    basic numeric DEFAULT 0 NOT NULL,
    trans numeric DEFAULT 0 NOT NULL,
    pera numeric DEFAULT 0 NOT NULL,
    gross numeric DEFAULT 0 NOT NULL,
    dedlnr numeric DEFAULT 0 NOT NULL,
    dedmed numeric DEFAULT 0 NOT NULL,
    dedtax numeric DEFAULT 0 NOT NULL,
    dedpag numeric DEFAULT 0 NOT NULL,
    totded numeric DEFAULT 0 NOT NULL,
    netpay numeric DEFAULT 0 NOT NULL,
    paydate date,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text DEFAULT ''::text,
    aca numeric DEFAULT 0,
    rata numeric DEFAULT 0,
    ontop numeric DEFAULT 0,
    clothing numeric DEFAULT 0,
    cashallow numeric DEFAULT 0
);


--
-- Name: dbf_pyent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_pyent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    itemcode text DEFAULT ''::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dbf_pyent1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_pyent1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    itemcode text DEFAULT ''::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dbf_pyent2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_pyent2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empno text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    payperiod text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    itemcode text DEFAULT ''::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dbf_restore_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_restore_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    original_filename text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    checksum text,
    dbf_version smallint,
    header_size smallint,
    record_size smallint,
    field_count smallint,
    record_count integer DEFAULT 0 NOT NULL,
    code_page smallint,
    sidecar_files jsonb DEFAULT '[]'::jsonb,
    user_id uuid DEFAULT auth.uid(),
    user_email text,
    restored_at timestamp with time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: dbf_stntable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_stntable (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stacode text NOT NULL,
    staname text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    regcode text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    cluster text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    munic text DEFAULT ''::text NOT NULL,
    province text DEFAULT ''::text NOT NULL,
    zipcode text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dbf_sync_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbf_sync_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_label text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    files_uploaded text[] DEFAULT '{}'::text[] NOT NULL,
    total_inserted integer DEFAULT 0 NOT NULL,
    total_updated integer DEFAULT 0 NOT NULL,
    total_skipped integer DEFAULT 0 NOT NULL,
    total_errors integer DEFAULT 0 NOT NULL,
    error_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    per_file jsonb DEFAULT '{}'::jsonb NOT NULL,
    performed_by text,
    user_id uuid,
    rollback_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_rolled_back boolean DEFAULT false NOT NULL,
    category text,
    CONSTRAINT dbf_sync_sessions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'rolled_back'::text])))
);


--
-- Name: deduction_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deduction_codes (
    dedcode text NOT NULL,
    type text DEFAULT 'Other'::text NOT NULL,
    agency text DEFAULT 'OTHER'::text NOT NULL,
    dedname text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deduction_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deduction_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deduction_id uuid,
    stacode text DEFAULT ''::text NOT NULL,
    empno text DEFAULT ''::text NOT NULL,
    dedcode text DEFAULT ''::text NOT NULL,
    policyno text DEFAULT ''::text NOT NULL,
    action text NOT NULL,
    prev_dedamt numeric(12,2),
    new_dedamt numeric(12,2),
    prev_status text,
    new_status text,
    prev_principal numeric(12,2),
    new_principal numeric(12,2),
    prev_interest numeric(12,2),
    new_interest numeric(12,2),
    prev_charges numeric(12,2),
    new_charges numeric(12,2),
    changed_by text DEFAULT ''::text NOT NULL,
    payroll_period text,
    source text DEFAULT 'MANUAL'::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deduction_history_action_check CHECK ((action = ANY (ARRAY['ADD'::text, 'UPDATE'::text, 'TERMINATE'::text])))
);


--
-- Name: deductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    pay_period_id uuid NOT NULL,
    deduction_code text DEFAULT 'MISC'::text NOT NULL,
    deduction_name text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'Mandatory'::text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    source text DEFAULT 'Manual'::text,
    reference text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.deductions FORCE ROW LEVEL SECURITY;


--
-- Name: division_office; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.division_office (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    division_name text DEFAULT ''::text NOT NULL,
    region text DEFAULT ''::text,
    division_code text DEFAULT ''::text,
    address text DEFAULT ''::text,
    zip_code text DEFAULT ''::text,
    contact_number text DEFAULT ''::text,
    official_email text DEFAULT ''::text,
    website text DEFAULT ''::text,
    tin_number text DEFAULT ''::text,
    agency_code text DEFAULT ''::text,
    uacs_code text DEFAULT ''::text,
    sds_name text DEFAULT ''::text,
    sds_position text DEFAULT ''::text,
    sds_email text DEFAULT ''::text,
    sds_contact text DEFAULT ''::text,
    sds_signature text DEFAULT ''::text,
    sds_effective_date date,
    asds_name text DEFAULT ''::text,
    asds_position text DEFAULT ''::text,
    asds_email text DEFAULT ''::text,
    asds_contact text DEFAULT ''::text,
    asds_signature text DEFAULT ''::text,
    asds_effective_date date,
    hrmo_name text DEFAULT ''::text,
    hrmo_position text DEFAULT ''::text,
    hrmo_contact text DEFAULT ''::text,
    hrmo_email text DEFAULT ''::text,
    hrmo_signature text DEFAULT ''::text,
    payroll_officer_name text DEFAULT ''::text,
    payroll_officer_position text DEFAULT ''::text,
    payroll_officer_contact text DEFAULT ''::text,
    payroll_officer_email text DEFAULT ''::text,
    payroll_officer_signature text DEFAULT ''::text,
    division_logo text DEFAULT ''::text,
    show_division_logo boolean DEFAULT true NOT NULL,
    show_deped_logo boolean DEFAULT true NOT NULL,
    show_sds_name boolean DEFAULT true NOT NULL,
    show_payroll_signature boolean DEFAULT true NOT NULL,
    show_hrmo_signature boolean DEFAULT true NOT NULL,
    show_address boolean DEFAULT true NOT NULL,
    show_tin boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    division_id uuid
);


--
-- Name: divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region_id uuid NOT NULL,
    division_code text NOT NULL,
    division_name text DEFAULT ''::text NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT divisions_division_code_check CHECK ((division_code <> ''::text)),
    CONSTRAINT divisions_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


--
-- Name: earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    pay_period_id uuid NOT NULL,
    earning_type text DEFAULT 'Basic'::text NOT NULL,
    hours numeric(8,2) DEFAULT 0,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_number text NOT NULL,
    last_name text NOT NULL,
    first_name text NOT NULL,
    middle_name text DEFAULT ''::text,
    "position" text DEFAULT ''::text,
    department text DEFAULT ''::text,
    bank_name text DEFAULT ''::text,
    bank_account text DEFAULT ''::text,
    basic_salary numeric(14,2) DEFAULT 0 NOT NULL,
    hourly_rate numeric(14,2) DEFAULT 0 NOT NULL,
    tax_status text DEFAULT 'ME1'::text,
    sss_number text DEFAULT ''::text,
    philhealth_number text DEFAULT ''::text,
    pagibig_number text DEFAULT ''::text,
    tin text DEFAULT ''::text,
    status text DEFAULT 'Active'::text NOT NULL,
    hire_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    regcode text DEFAULT ''::text,
    divcode text DEFAULT ''::text,
    stacode text DEFAULT ''::text,
    empno text DEFAULT ''::text,
    account text DEFAULT ''::text,
    empname text DEFAULT ''::text,
    fname text DEFAULT ''::text,
    mi text DEFAULT ''::text,
    lname text DEFAULT ''::text,
    appel text DEFAULT ''::text,
    poscode text DEFAULT ''::text,
    paymode text DEFAULT 'ATM'::text,
    grade integer DEFAULT 0,
    step integer DEFAULT 0,
    basic numeric(14,2) DEFAULT 0,
    trans numeric(14,2) DEFAULT 0,
    pera numeric(14,2) DEFAULT 0,
    aca numeric(14,2) DEFAULT 0,
    rata numeric(14,2) DEFAULT 0,
    ontop numeric(14,2) DEFAULT 0,
    long numeric(14,2) DEFAULT 0,
    clothing numeric(14,2) DEFAULT 0,
    cashallow numeric(14,2) DEFAULT 0,
    dedlnr numeric(14,2) DEFAULT 0,
    dedmed numeric(14,2) DEFAULT 0,
    dedtax numeric(14,2) DEFAULT 0,
    dedpag numeric(14,2) DEFAULT 0,
    netpay numeric(14,2) DEFAULT 0,
    govtlnr numeric(14,2) DEFAULT 0,
    govtecc numeric(14,2) DEFAULT 0,
    govtmed numeric(14,2) DEFAULT 0,
    govtpag numeric(14,2) DEFAULT 0,
    pagcode text DEFAULT ''::text,
    taxcode text DEFAULT 'ME1'::text,
    civilstat text DEFAULT ''::text,
    attend text DEFAULT ''::text,
    sex text DEFAULT ''::text,
    exposcode text DEFAULT ''::text,
    updcode text DEFAULT ''::text,
    gsis_pn text DEFAULT ''::text,
    gsis_id text DEFAULT ''::text,
    hdmf_id text DEFAULT ''::text,
    phic_id text DEFAULT ''::text,
    pib text DEFAULT ''::text,
    banker text DEFAULT ''::text,
    birthdate date,
    update date,
    paydate date,
    hiredate date,
    mid_bonus numeric(14,2) DEFAULT 0,
    mid_cash numeric(14,2) DEFAULT 0,
    end_bonus numeric(14,2) DEFAULT 0,
    end_cash numeric(14,2) DEFAULT 0,
    add_bonus numeric(14,2) DEFAULT 0,
    taxref numeric(14,2) DEFAULT 0,
    special numeric(14,2) DEFAULT 0,
    over_wheld numeric(14,2) DEFAULT 0,
    exgrade integer DEFAULT 0,
    exstep integer DEFAULT 0,
    exbasic numeric(14,2) DEFAULT 0,
    exlnr numeric(14,2) DEFAULT 0,
    exmed numeric(14,2) DEFAULT 0,
    expag numeric(14,2) DEFAULT 0,
    extax numeric(14,2) DEFAULT 0,
    exglnr numeric(14,2) DEFAULT 0,
    exgmed numeric(14,2) DEFAULT 0,
    exgpag numeric(14,2) DEFAULT 0,
    exgecc numeric(14,2) DEFAULT 0,
    saldiff numeric(14,2) DEFAULT 0,
    lnrdiff numeric(14,2) DEFAULT 0,
    meddiff numeric(14,2) DEFAULT 0,
    pagdiff numeric(14,2) DEFAULT 0,
    taxdiff numeric(14,2) DEFAULT 0,
    glnrdiff numeric(14,2) DEFAULT 0,
    gmeddiff numeric(14,2) DEFAULT 0,
    gpagdiff numeric(14,2) DEFAULT 0,
    geccdiff numeric(14,2) DEFAULT 0,
    editor text DEFAULT ''::text,
    payroll_group_id uuid,
    distcode text DEFAULT ''::text NOT NULL,
    depname1 text DEFAULT ''::text,
    depname2 text DEFAULT ''::text,
    depname3 text DEFAULT ''::text,
    depname4 text DEFAULT ''::text,
    depdate1 date,
    depdate2 date,
    depdate3 date,
    depdate4 date,
    stacode_num integer GENERATED ALWAYS AS (
CASE
    WHEN (stacode ~ '^[0-9]+$'::text) THEN (stacode)::integer
    ELSE NULL::integer
END) STORED,
    payroll_status text DEFAULT 'Regular Payroll'::text NOT NULL,
    req_appointment_validated boolean DEFAULT false NOT NULL,
    req_tin_submitted boolean DEFAULT false NOT NULL,
    req_philhealth_submitted boolean DEFAULT false NOT NULL,
    req_pagibig_submitted boolean DEFAULT false NOT NULL,
    req_atm_submitted boolean DEFAULT false NOT NULL,
    division_id uuid,
    CONSTRAINT chk_employees_basic CHECK ((basic >= (0)::numeric)),
    CONSTRAINT chk_employees_netpay CHECK ((netpay >= (0)::numeric))
);

ALTER TABLE ONLY public.employees FORCE ROW LEVEL SECURITY;


--
-- Name: gsis_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gsis_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploaded_by text DEFAULT ''::text NOT NULL,
    uploaded_by_id uuid DEFAULT auth.uid() NOT NULL,
    filename text DEFAULT ''::text NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    matched_records integer DEFAULT 0 NOT NULL,
    new_deductions integer DEFAULT 0 NOT NULL,
    updated_deductions integer DEFAULT 0 NOT NULL,
    failed_records integer DEFAULT 0 NOT NULL,
    processing_time_ms integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dbf_filename text,
    file_content text,
    remark text
);


--
-- Name: initial_payroll_absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.initial_payroll_absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    date_of_absence date NOT NULL,
    number_of_days integer DEFAULT 1 NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: initial_payroll_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.initial_payroll_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    item_no text,
    employee_number text,
    surname text,
    first_name text,
    middle_name text,
    school text,
    position_title text,
    salary_grade integer,
    salary_step integer,
    monthly_salary numeric(14,2),
    days_worked numeric(5,1) DEFAULT 0 NOT NULL,
    daily_rate numeric(14,2) DEFAULT 0 NOT NULL,
    gross_salary numeric(14,2) DEFAULT 0 NOT NULL,
    basic_salary numeric(14,2) DEFAULT 0 NOT NULL,
    pera numeric(14,2) DEFAULT 0 NOT NULL,
    mid_year_bonus numeric(14,2) DEFAULT 0 NOT NULL,
    cash_gift numeric(14,2) DEFAULT 0 NOT NULL,
    clothing_allowance numeric(14,2) DEFAULT 0 NOT NULL,
    cna_incentive numeric(14,2) DEFAULT 0 NOT NULL,
    other_earnings numeric(14,2) DEFAULT 0 NOT NULL,
    total_earnings numeric(14,2) DEFAULT 0 NOT NULL,
    gsis numeric(14,2) DEFAULT 0 NOT NULL,
    philhealth numeric(14,2) DEFAULT 0 NOT NULL,
    pagibig numeric(14,2) DEFAULT 0 NOT NULL,
    withholding_tax numeric(14,2) DEFAULT 0 NOT NULL,
    loans numeric(14,2) DEFAULT 0 NOT NULL,
    other_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    net_pay numeric(14,2) DEFAULT 0 NOT NULL,
    tin text,
    philhealth_no text,
    hdmf_no text,
    atm_account_no text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stacode text,
    effectivity_date date,
    calendar_days numeric(5,1) DEFAULT 22 NOT NULL,
    additional_adjustments numeric(14,2) DEFAULT 0 NOT NULL,
    adjustment_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    annual_income numeric(14,2) DEFAULT 0 NOT NULL,
    annual_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    taxable_income numeric(14,2) DEFAULT 0 NOT NULL,
    annual_tax numeric(14,2) DEFAULT 0 NOT NULL,
    amount_due numeric(14,2) DEFAULT 0 NOT NULL,
    total_due numeric(14,2) DEFAULT 0 NOT NULL,
    school_group text,
    absences numeric DEFAULT 0 NOT NULL,
    period_from date,
    period_to date
);


--
-- Name: initial_payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.initial_payroll_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_no text NOT NULL,
    payroll_date date,
    period_from date,
    period_to date,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_gross numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    total_net numeric(14,2) DEFAULT 0 NOT NULL,
    employee_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text,
    divcode text
);


--
-- Name: initial_payroll_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.initial_payroll_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    employee_name text NOT NULL,
    employee_number text,
    transferred_at timestamp with time zone DEFAULT now() NOT NULL,
    payroll_no text,
    processed_by uuid,
    processed_by_name text
);


--
-- Name: ips_absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ips_absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    date_of_absence date NOT NULL,
    number_of_days integer DEFAULT 1 NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ips_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ips_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id text,
    action text NOT NULL,
    changed_by text,
    old_values jsonb,
    new_values jsonb,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ips_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ips_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    last_name text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    "position" text,
    department text,
    employment_status text DEFAULT 'Active'::text NOT NULL,
    salary_rate numeric(12,2) DEFAULT 0 NOT NULL,
    date_hired date,
    effectivity_date date DEFAULT CURRENT_DATE NOT NULL,
    tin text,
    gsis_number text,
    philhealth_number text,
    pagibig_number text,
    email text,
    contact_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ips_payroll_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ips_payroll_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    period_id uuid,
    effectivity_date date NOT NULL,
    actual_working_days integer DEFAULT 0 NOT NULL,
    adjustment integer DEFAULT 0 NOT NULL,
    csc_days_present integer DEFAULT 0 NOT NULL,
    calendar_days integer DEFAULT 0 NOT NULL,
    absences_deducted integer DEFAULT 0 NOT NULL,
    final_csc_days_present integer DEFAULT 0 NOT NULL,
    gross_salary numeric(12,2) DEFAULT 0 NOT NULL,
    pera numeric(12,2) DEFAULT 0 NOT NULL,
    gsis numeric(12,2) DEFAULT 0 NOT NULL,
    philhealth numeric(12,2) DEFAULT 0 NOT NULL,
    pagibig numeric(12,2) DEFAULT 0 NOT NULL,
    withholding_tax numeric(12,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(12,2) DEFAULT 0 NOT NULL,
    net_pay numeric(12,2) DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ips_payroll_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ips_payroll_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_name text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_type text DEFAULT '1st'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    user_id uuid,
    success boolean NOT NULL,
    ip_address text,
    user_agent text,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.login_attempts FORCE ROW LEVEL SECURITY;


--
-- Name: non_plantilla_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.non_plantilla_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    surname character varying(100) NOT NULL,
    first_name character varying(100) NOT NULL,
    middle_name character varying(100) DEFAULT ''::character varying,
    complete_name character varying(255) DEFAULT ''::character varying,
    school character varying(255) NOT NULL,
    designation character varying(255) NOT NULL,
    pagibig_number character varying(50) DEFAULT ''::character varying,
    philhealth character varying(50) DEFAULT ''::character varying,
    landbank character varying(50) DEFAULT ''::character varying,
    first_day_of_service date,
    contact_number character varying(30) DEFAULT ''::character varying,
    birthday date,
    sex character varying(20) DEFAULT ''::character varying,
    address text DEFAULT ''::text,
    civil_status character varying(50) DEFAULT ''::character varying,
    tin character varying(50) DEFAULT ''::character varying,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text,
    divcode text
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    purpose text DEFAULT 'mfa'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT otp_codes_purpose_check CHECK ((purpose = ANY (ARRAY['mfa'::text, 'email_verification'::text])))
);

ALTER TABLE ONLY public.otp_codes FORCE ROW LEVEL SECURITY;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.password_reset_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: pay_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    cutoff_date date,
    pay_date date,
    frequency text DEFAULT 'Semi-Monthly'::text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    month integer,
    year integer,
    period_number integer,
    regcode text,
    divcode text,
    CONSTRAINT pay_periods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text])))
);


--
-- Name: payent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    empno text NOT NULL,
    pay_period_id uuid,
    payperiod text DEFAULT ''::text NOT NULL,
    half text DEFAULT 'full'::text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    regcode text DEFAULT ''::text NOT NULL,
    acct_no text DEFAULT ''::text NOT NULL,
    acct_name text DEFAULT ''::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    branch_cd text DEFAULT ''::text NOT NULL,
    batch_no text DEFAULT ''::text NOT NULL,
    itemcode text DEFAULT ''::text NOT NULL,
    paytype text DEFAULT ''::text NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payent_half_check CHECK ((half = ANY (ARRAY['full'::text, 'first'::text, 'second'::text]))),
    CONSTRAINT payent_source_check CHECK ((source = ANY (ARRAY['PYENT'::text, 'PYENT1'::text, 'PYENT2'::text, ''::text])))
);


--
-- Name: payroll_deductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    empno text DEFAULT ''::text NOT NULL,
    dedcode text DEFAULT ''::text NOT NULL,
    dedid text DEFAULT ''::text,
    policyno text DEFAULT ''::text,
    effmm smallint DEFAULT 1 NOT NULL,
    effyy smallint DEFAULT 0 NOT NULL,
    termm smallint,
    teryy smallint,
    dedamt numeric(12,2) DEFAULT 0 NOT NULL,
    principal numeric(12,2) DEFAULT 0,
    interest numeric(12,2) DEFAULT 0,
    charges numeric(12,2) DEFAULT 0,
    proceeds numeric(12,2) DEFAULT 0,
    agency text DEFAULT ''::text,
    status text DEFAULT 'Active'::text NOT NULL,
    type text DEFAULT 'Other'::text NOT NULL,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stacode text DEFAULT '0'::text NOT NULL,
    CONSTRAINT payroll_deductions_dedamt_check CHECK ((dedamt >= (0)::numeric)),
    CONSTRAINT payroll_deductions_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Suspended'::text, 'Terminated'::text]))),
    CONSTRAINT payroll_deductions_type_check CHECK ((type = ANY (ARRAY['Loan'::text, 'Insurance'::text, 'Membership'::text, 'Savings'::text, 'Other'::text])))
);

ALTER TABLE ONLY public.payroll_deductions FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    field_code text NOT NULL,
    field_label text NOT NULL,
    field_type text DEFAULT 'currency'::text NOT NULL,
    field_category text DEFAULT 'earnings'::text NOT NULL,
    description text,
    default_value numeric,
    is_required boolean DEFAULT false NOT NULL,
    is_computed boolean DEFAULT false NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT payroll_definitions_field_category_check CHECK ((field_category = ANY (ARRAY['earnings'::text, 'mandatory_deductions'::text, 'voluntary_deductions'::text, 'government_share'::text, 'tax'::text, 'net_pay'::text, 'metadata'::text, 'adjustments'::text]))),
    CONSTRAINT payroll_definitions_field_type_check CHECK ((field_type = ANY (ARRAY['currency'::text, 'number'::text, 'text'::text, 'date'::text, 'percentage'::text, 'computed'::text]))),
    CONSTRAINT payroll_definitions_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


--
-- Name: payroll_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    pay_period_id uuid NOT NULL,
    gross_pay numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    net_pay numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'Computed'::text NOT NULL,
    processed_at timestamp with time zone DEFAULT now(),
    dedlnr numeric(14,2) DEFAULT 0,
    dedmed numeric(14,2) DEFAULT 0,
    dedpag numeric(14,2) DEFAULT 0,
    dedtax numeric(14,2) DEFAULT 0,
    govtlnr numeric(14,2) DEFAULT 0,
    govtecc numeric(14,2) DEFAULT 0,
    govtmed numeric(14,2) DEFAULT 0,
    govtpag numeric(14,2) DEFAULT 0,
    other_deductions numeric(14,2) DEFAULT 0,
    nthp_status text DEFAULT 'PASS'::text NOT NULL,
    undeducted_amount numeric DEFAULT 0 NOT NULL,
    actual_loan_deductions numeric DEFAULT 0 NOT NULL,
    gsis_policy_loan numeric DEFAULT 0 NOT NULL,
    gsis_emergency_loan numeric DEFAULT 0 NOT NULL,
    pagibig_mpl numeric DEFAULT 0 NOT NULL,
    pagibig_calamity_loan numeric DEFAULT 0 NOT NULL,
    hazard_pay numeric DEFAULT 0 NOT NULL,
    salary_differential numeric DEFAULT 0 NOT NULL,
    other_compensation numeric DEFAULT 0 NOT NULL,
    other_earnings numeric DEFAULT 0 NOT NULL,
    available_balance numeric DEFAULT 0 NOT NULL,
    mandatory_deductions numeric DEFAULT 0 NOT NULL,
    loan_deduction_capacity numeric DEFAULT 0 NOT NULL,
    CONSTRAINT chk_payroll_actual_loans CHECK ((actual_loan_deductions >= (0)::numeric)),
    CONSTRAINT chk_payroll_gross CHECK ((gross_pay >= (0)::numeric)),
    CONSTRAINT chk_payroll_net CHECK ((net_pay >= (0)::numeric)),
    CONSTRAINT chk_payroll_total_ded CHECK ((total_deductions >= (0)::numeric)),
    CONSTRAINT chk_payroll_undeducted CHECK ((undeducted_amount >= (0)::numeric)),
    CONSTRAINT payroll_entries_status_check CHECK ((status = ANY (ARRAY['Computed'::text, 'Posted'::text, 'Reversed'::text])))
);

ALTER TABLE ONLY public.payroll_entries FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_formulas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_formulas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formula_name text NOT NULL,
    output_field_code text NOT NULL,
    expression text NOT NULL,
    description text,
    computation_order integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text
);


--
-- Name: payroll_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_code text NOT NULL,
    group_name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text DEFAULT 'system'::text NOT NULL,
    stacode_min integer,
    stacode_max integer
);


--
-- Name: payroll_number_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_number_counter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: payrolls_dbf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payrolls_dbf (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paycode numeric(1,0) DEFAULT 0 NOT NULL,
    regcode text DEFAULT ''::text NOT NULL,
    divcode text DEFAULT ''::text NOT NULL,
    stacode text DEFAULT ''::text NOT NULL,
    empno text DEFAULT ''::text NOT NULL,
    fname text DEFAULT ''::text NOT NULL,
    mi text DEFAULT ''::text NOT NULL,
    lname text DEFAULT ''::text NOT NULL,
    appel text DEFAULT ''::text NOT NULL,
    basic numeric(8,2) DEFAULT 0 NOT NULL,
    trans numeric(8,2) DEFAULT 0 NOT NULL,
    dedlnr numeric(8,2) DEFAULT 0 NOT NULL,
    dedmed numeric(6,2) DEFAULT 0 NOT NULL,
    dedpag numeric(6,2) DEFAULT 0 NOT NULL,
    dedtax numeric(8,2) DEFAULT 0 NOT NULL,
    otherded numeric(8,2) DEFAULT 0 NOT NULL,
    office text DEFAULT ''::text NOT NULL,
    ending text DEFAULT ''::text NOT NULL,
    issue text DEFAULT ''::text NOT NULL,
    chkno bigint DEFAULT 0 NOT NULL,
    ontop numeric(7,2) DEFAULT 0 NOT NULL,
    long numeric(7,2) DEFAULT 0 NOT NULL,
    rata numeric(7,2) DEFAULT 0 NOT NULL,
    pera numeric(7,2) DEFAULT 0 NOT NULL,
    aca numeric(8,2) DEFAULT 0 NOT NULL,
    takehome numeric(8,2) DEFAULT 0 NOT NULL,
    poscode text DEFAULT ''::text NOT NULL,
    grade text DEFAULT ''::text NOT NULL,
    step text DEFAULT ''::text NOT NULL,
    govtlnr numeric(8,2) DEFAULT 0 NOT NULL,
    govtecc numeric(8,2) DEFAULT 0 NOT NULL,
    govtpag numeric(8,2) DEFAULT 0 NOT NULL,
    govtmed numeric(8,2) DEFAULT 0 NOT NULL,
    taxcode text DEFAULT ''::text NOT NULL,
    paymode text DEFAULT ''::text NOT NULL,
    bank text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plantilla_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_headers (
    id text NOT NULL,
    fiscal_year integer DEFAULT 2025 NOT NULL,
    department text DEFAULT 'Department of Education'::text NOT NULL,
    bureau_agency text DEFAULT 'Office of the Secretary'::text NOT NULL,
    division_office text DEFAULT 'Division of Calamba City'::text NOT NULL,
    total_positions integer DEFAULT 0 NOT NULL,
    filled_positions integer DEFAULT 0 NOT NULL,
    unfilled_positions integer DEFAULT 0 NOT NULL,
    authorized_amount numeric DEFAULT 0 NOT NULL,
    actual_amount numeric DEFAULT 0 NOT NULL,
    source_pdf text,
    imported_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: plantilla_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_import_logs (
    id text NOT NULL,
    imported_by text DEFAULT 'System'::text NOT NULL,
    import_date text NOT NULL,
    pdf_filename text NOT NULL,
    fiscal_year integer DEFAULT 2025,
    positions_added integer DEFAULT 0 NOT NULL,
    positions_updated integer DEFAULT 0 NOT NULL,
    positions_vacated integer DEFAULT 0 NOT NULL,
    positions_filled integer DEFAULT 0 NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Completed'::text NOT NULL,
    import_batch_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: plantilla_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_positions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    position_code text DEFAULT ''::text,
    position_title text DEFAULT ''::text,
    salary_grade integer DEFAULT 0,
    monthly_salary numeric DEFAULT 0,
    level text DEFAULT ''::text,
    category text DEFAULT ''::text,
    stacode text DEFAULT ''::text,
    item_number text DEFAULT ''::text,
    status text DEFAULT 'Active'::text,
    salary_step integer,
    step integer,
    authorized_salary numeric DEFAULT 0,
    actual_salary numeric DEFAULT 0,
    annual_salary numeric DEFAULT 0,
    area text,
    type text,
    ppa_attribution text,
    employee_name text,
    sex text,
    birth_date text,
    date_of_birth text,
    tin text,
    appointment_date text,
    original_appointment_date text,
    last_promotion_date text,
    civil_service_eligibility text,
    employment_status text,
    appointment_type text,
    occupation_code text,
    personnel_category text,
    position_status text DEFAULT 'Filled'::text,
    school_id text,
    school_name text,
    school_type text,
    office_assignment text,
    organizational_unit text,
    department text,
    bureau text,
    fiscal_year integer,
    source_pdf text,
    import_batch_id text,
    approval_status text DEFAULT 'Approved'::text,
    employee_id text,
    header_id text,
    imported_by text,
    education text,
    eligibility text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pli_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pli_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploaded_by text DEFAULT ''::text NOT NULL,
    uploaded_by_id uuid DEFAULT auth.uid() NOT NULL,
    add_filename text DEFAULT ''::text NOT NULL,
    del_filename text,
    dbf_filename text,
    total_records integer DEFAULT 0 NOT NULL,
    add_records integer DEFAULT 0 NOT NULL,
    del_records integer DEFAULT 0 NOT NULL,
    new_deductions integer DEFAULT 0 NOT NULL,
    updated_deductions integer DEFAULT 0 NOT NULL,
    terminated_deductions integer DEFAULT 0 NOT NULL,
    failed_records integer DEFAULT 0 NOT NULL,
    processing_time_ms integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_content text,
    remark text
);


--
-- Name: position_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.position_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploaded_by text DEFAULT ''::text NOT NULL,
    uploaded_by_id uuid DEFAULT auth.uid() NOT NULL,
    filename text DEFAULT ''::text NOT NULL,
    import_mode text DEFAULT 'add_new'::text NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    new_records integer DEFAULT 0 NOT NULL,
    updated_records integer DEFAULT 0 NOT NULL,
    skipped_records integer DEFAULT 0 NOT NULL,
    error_records integer DEFAULT 0 NOT NULL,
    processing_time_ms integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: position_management; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.position_management (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_code text NOT NULL,
    old_position_code text DEFAULT ''::text,
    position_title text DEFAULT ''::text,
    position_name text DEFAULT ''::text,
    salary_grade integer DEFAULT 0,
    step1 numeric(14,2) DEFAULT 0,
    step2 numeric(14,2) DEFAULT 0,
    step3 numeric(14,2) DEFAULT 0,
    step4 numeric(14,2) DEFAULT 0,
    step5 numeric(14,2) DEFAULT 0,
    step6 numeric(14,2) DEFAULT 0,
    step7 numeric(14,2) DEFAULT 0,
    step8 numeric(14,2) DEFAULT 0,
    personnel_category text DEFAULT 'Non-Teaching'::text NOT NULL,
    position_category_code text DEFAULT ''::text,
    remarks text DEFAULT ''::text,
    status text DEFAULT 'Active'::text NOT NULL,
    last_imported_at timestamp with time zone,
    last_updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT position_management_personnel_category_check CHECK ((personnel_category = ANY (ARRAY['Teaching'::text, 'Teaching Related'::text, 'Non-Teaching'::text]))),
    CONSTRAINT position_management_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    email text NOT NULL,
    mobile_number text DEFAULT ''::text NOT NULL,
    username text,
    role text DEFAULT 'viewer'::text NOT NULL,
    mfa_enabled boolean DEFAULT false NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    last_login_ip text,
    email_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    office_assignment text,
    position_designation text,
    employee_number text,
    rejection_reason text,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    disabled_by uuid,
    disabled_at timestamp with time zone,
    assigned_stacode text,
    region_id uuid,
    division_id uuid,
    division_code text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text, 'hr_administrator'::text, 'school_coordinator'::text, 'school_head'::text, 'loan_verifier'::text, 'payroll_officer'::text, 'payroll_processor'::text, 'accounting_officer'::text, 'division_finance'::text, 'treasury_disbursement'::text, 'auditor'::text, 'ess'::text, 'read_only'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text, 'disabled'::text])))
);

ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region_code text NOT NULL,
    region_name text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regions_region_code_check CHECK ((region_code <> ''::text)),
    CONSTRAINT regions_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])))
);


--
-- Name: salary_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tranche text DEFAULT 'Third Tranche'::text NOT NULL,
    circular_no text DEFAULT 'NBC 601'::text NOT NULL,
    effective_date date DEFAULT '2026-01-01'::date NOT NULL,
    grade integer NOT NULL,
    step integer NOT NULL,
    monthly_salary numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_code text NOT NULL,
    school_name text DEFAULT ''::text NOT NULL,
    school_type text DEFAULT 'Elementary'::text NOT NULL,
    cluster text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    school_head text DEFAULT ''::text NOT NULL,
    contact_number text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    division_id uuid
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    detail text DEFAULT ''::text NOT NULL,
    source text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_settings (
    id integer DEFAULT 1 NOT NULL,
    lockdown_enabled boolean DEFAULT false NOT NULL,
    lockdown_reason text,
    lockdown_at timestamp with time zone,
    locked_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT security_settings_id_check CHECK ((id = 1)),
    CONSTRAINT security_settings_singleton CHECK ((id = 1))
);


--
-- Name: signatories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signatories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    name text NOT NULL,
    "position" text,
    office text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    regcode text,
    divcode text
);


--
-- Name: stacode_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stacode_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    employee_no text DEFAULT ''::text NOT NULL,
    old_stacode text DEFAULT ''::text NOT NULL,
    new_stacode text DEFAULT ''::text NOT NULL,
    old_group_code text DEFAULT 'Unassigned'::text NOT NULL,
    new_group_code text DEFAULT 'Unassigned'::text NOT NULL,
    changed_by text DEFAULT 'system'::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now(),
    reason text DEFAULT ''::text NOT NULL
);


--
-- Name: undeducted_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.undeducted_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_entry_id uuid,
    employee_id uuid,
    pay_period_id uuid,
    deduction_code text DEFAULT ''::text NOT NULL,
    deduction_description text DEFAULT ''::text NOT NULL,
    undeducted_amount numeric DEFAULT 0 NOT NULL,
    reason text DEFAULT 'NTHP BELOW ₱5,000.00'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    station_code text,
    scheduled_amount numeric DEFAULT 0 NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_08_20; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_08_20 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_08_21; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_08_21 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_08_22; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_08_22 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_08_23; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_08_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_08_24; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_08_24 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone DEFAULT now()
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: iceberg_namespaces; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_namespaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    catalog_id uuid NOT NULL
);


--
-- Name: iceberg_tables; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    namespace_id uuid NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    location text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    remote_table_id text,
    shard_key text,
    shard_id text,
    catalog_id uuid NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hooks; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.hooks (
    id bigint NOT NULL,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id bigint
);


--
-- Name: hooks_id_seq; Type: SEQUENCE; Schema: supabase_functions; Owner: -
--

CREATE SEQUENCE supabase_functions.hooks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hooks_id_seq; Type: SEQUENCE OWNED BY; Schema: supabase_functions; Owner: -
--

ALTER SEQUENCE supabase_functions.hooks_id_seq OWNED BY supabase_functions.hooks.id;


--
-- Name: migrations; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.migrations (
    version text NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: messages_2026_08_20; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_20 FOR VALUES FROM ('2026-08-20 00:00:00') TO ('2026-08-21 00:00:00');


--
-- Name: messages_2026_08_21; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_21 FOR VALUES FROM ('2026-08-21 00:00:00') TO ('2026-08-22 00:00:00');


--
-- Name: messages_2026_08_22; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_22 FOR VALUES FROM ('2026-08-22 00:00:00') TO ('2026-08-23 00:00:00');


--
-- Name: messages_2026_08_23; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_23 FOR VALUES FROM ('2026-08-23 00:00:00') TO ('2026-08-24 00:00:00');


--
-- Name: messages_2026_08_24; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_08_24 FOR VALUES FROM ('2026-08-24 00:00:00') TO ('2026-08-25 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: hooks id; Type: DEFAULT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks ALTER COLUMN id SET DEFAULT nextval('supabase_functions.hooks_id_seq'::regclass);


--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ca_employees ca_employees_account_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_employees
    ADD CONSTRAINT ca_employees_account_no_key UNIQUE (account_no);


--
-- Name: ca_employees ca_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_employees
    ADD CONSTRAINT ca_employees_pkey PRIMARY KEY (id);


--
-- Name: ca_payroll_details ca_payroll_details_payroll_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_details
    ADD CONSTRAINT ca_payroll_details_payroll_id_employee_id_key UNIQUE (payroll_id, employee_id);


--
-- Name: ca_payroll_details ca_payroll_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_details
    ADD CONSTRAINT ca_payroll_details_pkey PRIMARY KEY (id);


--
-- Name: ca_payroll_headers ca_payroll_headers_payroll_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_headers
    ADD CONSTRAINT ca_payroll_headers_payroll_no_key UNIQUE (payroll_no);


--
-- Name: ca_payroll_headers ca_payroll_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_headers
    ADD CONSTRAINT ca_payroll_headers_pkey PRIMARY KEY (id);


--
-- Name: ca_payroll_signatories ca_payroll_signatories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_signatories
    ADD CONSTRAINT ca_payroll_signatories_pkey PRIMARY KEY (id);


--
-- Name: dashboard_stats_cache dashboard_stats_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_stats_cache
    ADD CONSTRAINT dashboard_stats_cache_pkey PRIMARY KEY (id);


--
-- Name: dbf_divtable dbf_divtable_divcode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_divtable
    ADD CONSTRAINT dbf_divtable_divcode_unique UNIQUE (divcode);


--
-- Name: dbf_divtable dbf_divtable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_divtable
    ADD CONSTRAINT dbf_divtable_pkey PRIMARY KEY (id);


--
-- Name: dbf_excluded dbf_excluded_empno_payperiod_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_excluded
    ADD CONSTRAINT dbf_excluded_empno_payperiod_unique UNIQUE (empno, payperiod);


--
-- Name: dbf_excluded dbf_excluded_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_excluded
    ADD CONSTRAINT dbf_excluded_pkey PRIMARY KEY (id);


--
-- Name: dbf_included dbf_included_empno_payperiod_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_included
    ADD CONSTRAINT dbf_included_empno_payperiod_unique UNIQUE (empno, payperiod);


--
-- Name: dbf_included dbf_included_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_included
    ADD CONSTRAINT dbf_included_pkey PRIMARY KEY (id);


--
-- Name: dbf_payrolls dbf_payrolls_empno_payperiod_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_payrolls
    ADD CONSTRAINT dbf_payrolls_empno_payperiod_unique UNIQUE (empno, payperiod);


--
-- Name: dbf_payrolls dbf_payrolls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_payrolls
    ADD CONSTRAINT dbf_payrolls_pkey PRIMARY KEY (id);


--
-- Name: dbf_pyent1 dbf_pyent1_empno_payperiod_itemcode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent1
    ADD CONSTRAINT dbf_pyent1_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode);


--
-- Name: dbf_pyent1 dbf_pyent1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent1
    ADD CONSTRAINT dbf_pyent1_pkey PRIMARY KEY (id);


--
-- Name: dbf_pyent2 dbf_pyent2_empno_payperiod_itemcode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent2
    ADD CONSTRAINT dbf_pyent2_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode);


--
-- Name: dbf_pyent2 dbf_pyent2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent2
    ADD CONSTRAINT dbf_pyent2_pkey PRIMARY KEY (id);


--
-- Name: dbf_pyent dbf_pyent_empno_payperiod_itemcode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent
    ADD CONSTRAINT dbf_pyent_empno_payperiod_itemcode_unique UNIQUE (empno, payperiod, itemcode);


--
-- Name: dbf_pyent dbf_pyent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_pyent
    ADD CONSTRAINT dbf_pyent_pkey PRIMARY KEY (id);


--
-- Name: dbf_restore_history dbf_restore_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_restore_history
    ADD CONSTRAINT dbf_restore_history_pkey PRIMARY KEY (id);


--
-- Name: dbf_stntable dbf_stntable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_stntable
    ADD CONSTRAINT dbf_stntable_pkey PRIMARY KEY (id);


--
-- Name: dbf_stntable dbf_stntable_stacode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_stntable
    ADD CONSTRAINT dbf_stntable_stacode_unique UNIQUE (stacode);


--
-- Name: dbf_sync_sessions dbf_sync_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_sync_sessions
    ADD CONSTRAINT dbf_sync_sessions_pkey PRIMARY KEY (id);


--
-- Name: deduction_codes deduction_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_codes
    ADD CONSTRAINT deduction_codes_pkey PRIMARY KEY (dedcode);


--
-- Name: deduction_history deduction_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_history
    ADD CONSTRAINT deduction_history_pkey PRIMARY KEY (id);


--
-- Name: deductions deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deductions
    ADD CONSTRAINT deductions_pkey PRIMARY KEY (id);


--
-- Name: division_office division_office_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.division_office
    ADD CONSTRAINT division_office_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_division_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_division_code_key UNIQUE (division_code);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: earnings earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_pkey PRIMARY KEY (id);


--
-- Name: employees employees_employee_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_number_key UNIQUE (employee_number);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: gsis_import_logs gsis_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gsis_import_logs
    ADD CONSTRAINT gsis_import_logs_pkey PRIMARY KEY (id);


--
-- Name: initial_payroll_absences initial_payroll_absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_absences
    ADD CONSTRAINT initial_payroll_absences_pkey PRIMARY KEY (id);


--
-- Name: initial_payroll_entries initial_payroll_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_entries
    ADD CONSTRAINT initial_payroll_entries_pkey PRIMARY KEY (id);


--
-- Name: initial_payroll_records initial_payroll_records_payroll_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_records
    ADD CONSTRAINT initial_payroll_records_payroll_no_key UNIQUE (payroll_no);


--
-- Name: initial_payroll_records initial_payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_records
    ADD CONSTRAINT initial_payroll_records_pkey PRIMARY KEY (id);


--
-- Name: initial_payroll_transfers initial_payroll_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_transfers
    ADD CONSTRAINT initial_payroll_transfers_pkey PRIMARY KEY (id);


--
-- Name: ips_absences ips_absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_absences
    ADD CONSTRAINT ips_absences_pkey PRIMARY KEY (id);


--
-- Name: ips_audit_logs ips_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_audit_logs
    ADD CONSTRAINT ips_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ips_employees ips_employees_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_employees
    ADD CONSTRAINT ips_employees_employee_id_key UNIQUE (employee_id);


--
-- Name: ips_employees ips_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_employees
    ADD CONSTRAINT ips_employees_pkey PRIMARY KEY (id);


--
-- Name: ips_payroll_details ips_payroll_details_employee_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_payroll_details
    ADD CONSTRAINT ips_payroll_details_employee_id_period_id_key UNIQUE (employee_id, period_id);


--
-- Name: ips_payroll_details ips_payroll_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_payroll_details
    ADD CONSTRAINT ips_payroll_details_pkey PRIMARY KEY (id);


--
-- Name: ips_payroll_periods ips_payroll_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_payroll_periods
    ADD CONSTRAINT ips_payroll_periods_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: non_plantilla_employees non_plantilla_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.non_plantilla_employees
    ADD CONSTRAINT non_plantilla_employees_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pay_periods pay_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_periods
    ADD CONSTRAINT pay_periods_pkey PRIMARY KEY (id);


--
-- Name: payent payent_empno_payperiod_half_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payent
    ADD CONSTRAINT payent_empno_payperiod_half_unique UNIQUE (empno, payperiod, half);


--
-- Name: payent payent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payent
    ADD CONSTRAINT payent_pkey PRIMARY KEY (id);


--
-- Name: payroll_deductions payroll_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT payroll_deductions_pkey PRIMARY KEY (id);


--
-- Name: payroll_definitions payroll_definitions_field_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_definitions
    ADD CONSTRAINT payroll_definitions_field_code_key UNIQUE (field_code);


--
-- Name: payroll_definitions payroll_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_definitions
    ADD CONSTRAINT payroll_definitions_pkey PRIMARY KEY (id);


--
-- Name: payroll_entries payroll_entries_employee_id_pay_period_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_employee_id_pay_period_id_key UNIQUE (employee_id, pay_period_id);


--
-- Name: payroll_entries payroll_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_pkey PRIMARY KEY (id);


--
-- Name: payroll_formulas payroll_formulas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_formulas
    ADD CONSTRAINT payroll_formulas_pkey PRIMARY KEY (id);


--
-- Name: payroll_groups payroll_groups_group_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_groups
    ADD CONSTRAINT payroll_groups_group_code_key UNIQUE (group_code);


--
-- Name: payroll_groups payroll_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_groups
    ADD CONSTRAINT payroll_groups_pkey PRIMARY KEY (id);


--
-- Name: payroll_number_counter payroll_number_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_number_counter
    ADD CONSTRAINT payroll_number_counter_pkey PRIMARY KEY (id);


--
-- Name: payroll_number_counter payroll_number_counter_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_number_counter
    ADD CONSTRAINT payroll_number_counter_year_month_key UNIQUE (year, month);


--
-- Name: payrolls_dbf payrolls_dbf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payrolls_dbf
    ADD CONSTRAINT payrolls_dbf_pkey PRIMARY KEY (id);


--
-- Name: plantilla_headers plantilla_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_headers
    ADD CONSTRAINT plantilla_headers_pkey PRIMARY KEY (id);


--
-- Name: plantilla_import_logs plantilla_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_import_logs
    ADD CONSTRAINT plantilla_import_logs_pkey PRIMARY KEY (id);


--
-- Name: plantilla_positions plantilla_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_positions
    ADD CONSTRAINT plantilla_positions_pkey PRIMARY KEY (id);


--
-- Name: pli_import_logs pli_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pli_import_logs
    ADD CONSTRAINT pli_import_logs_pkey PRIMARY KEY (id);


--
-- Name: position_import_logs position_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_import_logs
    ADD CONSTRAINT position_import_logs_pkey PRIMARY KEY (id);


--
-- Name: position_management position_management_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_management
    ADD CONSTRAINT position_management_pkey PRIMARY KEY (id);


--
-- Name: position_management position_management_position_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.position_management
    ADD CONSTRAINT position_management_position_code_key UNIQUE (position_code);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: regions regions_region_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_region_code_key UNIQUE (region_code);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission);


--
-- Name: salary_schedule salary_schedule_grade_step_tranche_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_schedule
    ADD CONSTRAINT salary_schedule_grade_step_tranche_key UNIQUE (grade, step, tranche);


--
-- Name: salary_schedule salary_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_schedule
    ADD CONSTRAINT salary_schedule_pkey PRIMARY KEY (id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: schools schools_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_school_code_key UNIQUE (school_code);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: security_settings security_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_settings
    ADD CONSTRAINT security_settings_pkey PRIMARY KEY (id);


--
-- Name: signatories signatories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatories
    ADD CONSTRAINT signatories_pkey PRIMARY KEY (id);


--
-- Name: stacode_audit stacode_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stacode_audit
    ADD CONSTRAINT stacode_audit_pkey PRIMARY KEY (id);


--
-- Name: undeducted_obligations undeducted_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.undeducted_obligations
    ADD CONSTRAINT undeducted_obligations_pkey PRIMARY KEY (id);


--
-- Name: payroll_deductions uq_payroll_deductions_4key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT uq_payroll_deductions_4key UNIQUE (stacode, empno, dedcode, policyno);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_08_20 messages_2026_08_20_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_08_20
    ADD CONSTRAINT messages_2026_08_20_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_08_21 messages_2026_08_21_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_08_21
    ADD CONSTRAINT messages_2026_08_21_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_08_22 messages_2026_08_22_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_08_22
    ADD CONSTRAINT messages_2026_08_22_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_08_23 messages_2026_08_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_08_23
    ADD CONSTRAINT messages_2026_08_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_08_24 messages_2026_08_24_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_08_24
    ADD CONSTRAINT messages_2026_08_24_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: iceberg_namespaces iceberg_namespaces_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_pkey PRIMARY KEY (id);


--
-- Name: iceberg_tables iceberg_tables_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: hooks hooks_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (version);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: extensions_tenant_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE INDEX extensions_tenant_external_id_index ON _realtime.extensions USING btree (tenant_external_id);


--
-- Name: extensions_tenant_external_id_type_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX extensions_tenant_external_id_type_index ON _realtime.extensions USING btree (tenant_external_id, type);


--
-- Name: feature_flags_name_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX feature_flags_name_index ON _realtime.feature_flags USING btree (name);


--
-- Name: tenants_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX tenants_external_id_index ON _realtime.tenants USING btree (external_id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: dbf_sync_sessions_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dbf_sync_sessions_category_idx ON public.dbf_sync_sessions USING btree (category);


--
-- Name: dbf_sync_sessions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dbf_sync_sessions_started_at_idx ON public.dbf_sync_sessions USING btree (started_at DESC);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_division ON public.audit_logs USING btree (regcode, divcode);


--
-- Name: idx_ca_det_emp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_det_emp ON public.ca_payroll_details USING btree (employee_id);


--
-- Name: idx_ca_det_payroll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_det_payroll ON public.ca_payroll_details USING btree (payroll_id);


--
-- Name: idx_ca_emp_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_emp_category ON public.ca_employees USING btree (category);


--
-- Name: idx_ca_emp_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_emp_name ON public.ca_employees USING btree (last_name, first_name);


--
-- Name: idx_ca_emp_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_emp_school ON public.ca_employees USING btree (school_name);


--
-- Name: idx_ca_emp_stacode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_emp_stacode ON public.ca_employees USING btree (stacode);


--
-- Name: idx_ca_emp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_emp_status ON public.ca_employees USING btree (status);


--
-- Name: idx_ca_hdr_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_hdr_created ON public.ca_payroll_headers USING btree (created_date DESC);


--
-- Name: idx_ca_hdr_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_hdr_school ON public.ca_payroll_headers USING btree (school_name);


--
-- Name: idx_ca_hdr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_hdr_status ON public.ca_payroll_headers USING btree (status);


--
-- Name: idx_ca_sig_payroll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_sig_payroll ON public.ca_payroll_signatories USING btree (payroll_id, sequence_no);


--
-- Name: idx_dbf_restore_history_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbf_restore_history_category ON public.dbf_restore_history USING btree (category, restored_at DESC);


--
-- Name: idx_dbf_restore_history_restored; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbf_restore_history_restored ON public.dbf_restore_history USING btree (restored_at DESC);


--
-- Name: idx_dbf_restore_history_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbf_restore_history_table ON public.dbf_restore_history USING btree (table_name);


--
-- Name: idx_dc_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_active ON public.deduction_codes USING btree (active);


--
-- Name: idx_dc_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_agency ON public.deduction_codes USING btree (agency);


--
-- Name: idx_dc_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_type ON public.deduction_codes USING btree (type);


--
-- Name: idx_deduction_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduction_history_changed_at ON public.deduction_history USING btree (changed_at DESC);


--
-- Name: idx_deduction_history_deduction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduction_history_deduction_id ON public.deduction_history USING btree (deduction_id);


--
-- Name: idx_deduction_history_empno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduction_history_empno ON public.deduction_history USING btree (empno);


--
-- Name: idx_deductions_period_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deductions_period_code ON public.deductions USING btree (pay_period_id, deduction_code);


--
-- Name: idx_division_office_division; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_division_office_division ON public.division_office USING btree (division_id);


--
-- Name: idx_divisions_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_divisions_region ON public.divisions USING btree (region_id);


--
-- Name: idx_employees_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_department ON public.employees USING btree (department);


--
-- Name: idx_employees_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_division ON public.employees USING btree (division_id);


--
-- Name: idx_employees_empno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_empno ON public.employees USING btree (empno);


--
-- Name: idx_employees_lname; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_lname ON public.employees USING btree (lname);


--
-- Name: idx_employees_payroll_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_payroll_status ON public.employees USING btree (payroll_status);


--
-- Name: idx_employees_regcode_divcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_regcode_divcode ON public.employees USING btree (regcode, divcode);


--
-- Name: idx_employees_stacode_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_stacode_num ON public.employees USING btree (stacode_num);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


--
-- Name: idx_gsis_import_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gsis_import_logs_created_at ON public.gsis_import_logs USING btree (created_at DESC);


--
-- Name: idx_gsis_import_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gsis_import_logs_user_created ON public.gsis_import_logs USING btree (uploaded_by_id, created_at DESC);


--
-- Name: idx_initial_payroll_records_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_initial_payroll_records_division ON public.initial_payroll_records USING btree (regcode, divcode);


--
-- Name: idx_ip_entries_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_entries_employee ON public.initial_payroll_entries USING btree (employee_id);


--
-- Name: idx_ip_entries_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_entries_record ON public.initial_payroll_entries USING btree (record_id);


--
-- Name: idx_ip_entries_school_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_entries_school_group ON public.initial_payroll_entries USING btree (school_group);


--
-- Name: idx_ip_entries_stacode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_entries_stacode ON public.initial_payroll_entries USING btree (stacode);


--
-- Name: idx_ipa_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ipa_employee ON public.initial_payroll_absences USING btree (employee_id);


--
-- Name: idx_ips_absences_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ips_absences_employee ON public.ips_absences USING btree (employee_id);


--
-- Name: idx_ips_audit_logs_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ips_audit_logs_changed_at ON public.ips_audit_logs USING btree (changed_at DESC);


--
-- Name: idx_ips_payroll_details_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ips_payroll_details_employee ON public.ips_payroll_details USING btree (employee_id);


--
-- Name: idx_ips_payroll_details_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ips_payroll_details_period ON public.ips_payroll_details USING btree (period_id);


--
-- Name: idx_login_attempts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_created ON public.login_attempts USING btree (created_at);


--
-- Name: idx_login_attempts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);


--
-- Name: idx_non_plantilla_complete_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_complete_name ON public.non_plantilla_employees USING btree (complete_name);


--
-- Name: idx_non_plantilla_designation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_designation ON public.non_plantilla_employees USING btree (designation);


--
-- Name: idx_non_plantilla_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_division ON public.non_plantilla_employees USING btree (regcode, divcode);


--
-- Name: idx_non_plantilla_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_not_deleted ON public.non_plantilla_employees USING btree (id) WHERE (is_deleted = false);


--
-- Name: idx_non_plantilla_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_school ON public.non_plantilla_employees USING btree (school);


--
-- Name: idx_non_plantilla_surname; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_non_plantilla_surname ON public.non_plantilla_employees USING btree (surname);


--
-- Name: idx_otp_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_expires ON public.otp_codes USING btree (expires_at);


--
-- Name: idx_otp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_user ON public.otp_codes USING btree (user_id);


--
-- Name: idx_pay_periods_divcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pay_periods_divcode ON public.pay_periods USING btree (regcode, divcode);


--
-- Name: idx_pay_periods_year_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pay_periods_year_month ON public.pay_periods USING btree (year, month);


--
-- Name: idx_payent_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payent_employee_id ON public.payent USING btree (employee_id);


--
-- Name: idx_payent_empno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payent_empno ON public.payent USING btree (empno);


--
-- Name: idx_payent_pay_period_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payent_pay_period_id ON public.payent USING btree (pay_period_id);


--
-- Name: idx_payroll_definitions_category_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_definitions_category_order ON public.payroll_definitions USING btree (field_category, sort_order);


--
-- Name: idx_payroll_entries_period_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_entries_period_status ON public.payroll_entries USING btree (pay_period_id, status);


--
-- Name: idx_payroll_formulas_computation_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_formulas_computation_order ON public.payroll_formulas USING btree (computation_order) WHERE (is_active = true);


--
-- Name: idx_payroll_groups_stacode_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_groups_stacode_range ON public.payroll_groups USING btree (stacode_min, stacode_max) WHERE ((stacode_min IS NOT NULL) AND (stacode_max IS NOT NULL));


--
-- Name: idx_payrolls_dbf_bank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payrolls_dbf_bank ON public.payrolls_dbf USING btree (bank);


--
-- Name: idx_payrolls_dbf_empno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payrolls_dbf_empno ON public.payrolls_dbf USING btree (empno);


--
-- Name: idx_payrolls_dbf_lname; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payrolls_dbf_lname ON public.payrolls_dbf USING btree (lname);


--
-- Name: idx_payrolls_dbf_stacode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payrolls_dbf_stacode ON public.payrolls_dbf USING btree (stacode);


--
-- Name: idx_pd_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pd_active_unique ON public.payroll_deductions USING btree (empno, dedcode, policyno) WHERE (status = 'Active'::text);


--
-- Name: idx_plantilla_headers_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_headers_fy ON public.plantilla_headers USING btree (fiscal_year);


--
-- Name: idx_plantilla_pos_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_pos_category ON public.plantilla_positions USING btree (personnel_category);


--
-- Name: idx_plantilla_pos_fy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_pos_fy ON public.plantilla_positions USING btree (fiscal_year);


--
-- Name: idx_plantilla_pos_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_pos_school ON public.plantilla_positions USING btree (school_id);


--
-- Name: idx_plantilla_pos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_pos_status ON public.plantilla_positions USING btree (position_status);


--
-- Name: idx_plantilla_positions_item_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_positions_item_number ON public.plantilla_positions USING btree (item_number);


--
-- Name: idx_pli_import_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pli_import_logs_created_at ON public.pli_import_logs USING btree (created_at DESC);


--
-- Name: idx_pli_import_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pli_import_logs_user_created ON public.pli_import_logs USING btree (uploaded_by_id, created_at DESC);


--
-- Name: idx_position_import_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_position_import_logs_user_created ON public.position_import_logs USING btree (uploaded_by_id, created_at DESC);


--
-- Name: idx_position_management_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_position_management_category ON public.position_management USING btree (personnel_category);


--
-- Name: idx_position_management_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_position_management_status ON public.position_management USING btree (status);


--
-- Name: idx_profiles_assigned_stacode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_assigned_stacode ON public.profiles USING btree (assigned_stacode);


--
-- Name: idx_profiles_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_division ON public.profiles USING btree (division_id);


--
-- Name: idx_profiles_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_region ON public.profiles USING btree (region_id);


--
-- Name: idx_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_status ON public.profiles USING btree (status);


--
-- Name: idx_reset_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_expires ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_reset_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_salary_schedule_grade_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_schedule_grade_step ON public.salary_schedule USING btree (grade, step) WHERE (tranche = 'Third Tranche'::text);


--
-- Name: idx_schools_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_division ON public.schools USING btree (division_id);


--
-- Name: idx_schools_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_status ON public.schools USING btree (status);


--
-- Name: idx_schools_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_type ON public.schools USING btree (school_type);


--
-- Name: idx_signatories_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signatories_division ON public.signatories USING btree (regcode, divcode);


--
-- Name: idx_stacode_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stacode_audit_changed_at ON public.stacode_audit USING btree (changed_at DESC);


--
-- Name: idx_stacode_audit_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stacode_audit_employee ON public.stacode_audit USING btree (employee_id);


--
-- Name: idx_undeducted_obligations_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_undeducted_obligations_entry ON public.undeducted_obligations USING btree (payroll_entry_id);


--
-- Name: pay_periods_period_name_div_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pay_periods_period_name_div_unique ON public.pay_periods USING btree (period_name, regcode, divcode) WHERE ((regcode IS NOT NULL) AND (divcode IS NOT NULL));


--
-- Name: pay_periods_period_name_legacy_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pay_periods_period_name_legacy_unique ON public.pay_periods USING btree (period_name) WHERE ((regcode IS NULL) AND (divcode IS NULL));


--
-- Name: pay_periods_year_month_div_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pay_periods_year_month_div_unique ON public.pay_periods USING btree (year, month, regcode, divcode) WHERE ((year IS NOT NULL) AND (month IS NOT NULL) AND (regcode IS NOT NULL) AND (divcode IS NOT NULL));


--
-- Name: pay_periods_year_month_legacy_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pay_periods_year_month_legacy_unique ON public.pay_periods USING btree (year, month) WHERE ((year IS NOT NULL) AND (month IS NOT NULL) AND (regcode IS NULL) AND (divcode IS NULL));


--
-- Name: security_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_events_created_at_idx ON public.security_events USING btree (created_at DESC);


--
-- Name: uq_non_plantilla_landbank; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_non_plantilla_landbank ON public.non_plantilla_employees USING btree (landbank) WHERE ((landbank IS NOT NULL) AND ((landbank)::text <> ''::text));


--
-- Name: uq_non_plantilla_pagibig; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_non_plantilla_pagibig ON public.non_plantilla_employees USING btree (pagibig_number) WHERE ((pagibig_number IS NOT NULL) AND ((pagibig_number)::text <> ''::text));


--
-- Name: uq_non_plantilla_philhealth; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_non_plantilla_philhealth ON public.non_plantilla_employees USING btree (philhealth) WHERE ((philhealth IS NOT NULL) AND ((philhealth)::text <> ''::text));


--
-- Name: uq_non_plantilla_tin; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_non_plantilla_tin ON public.non_plantilla_employees USING btree (tin) WHERE ((tin IS NOT NULL) AND ((tin)::text <> ''::text));


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_08_20_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_08_20_inserted_at_topic_idx ON realtime.messages_2026_08_20 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_08_21_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_08_21_inserted_at_topic_idx ON realtime.messages_2026_08_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_08_22_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_08_22_inserted_at_topic_idx ON realtime.messages_2026_08_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_08_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_08_23_inserted_at_topic_idx ON realtime.messages_2026_08_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_08_24_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_08_24_inserted_at_topic_idx ON realtime.messages_2026_08_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_iceberg_namespaces_bucket_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_namespaces_bucket_id ON storage.iceberg_namespaces USING btree (catalog_id, name);


--
-- Name: idx_iceberg_tables_location; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_location ON storage.iceberg_tables USING btree (location);


--
-- Name: idx_iceberg_tables_namespace_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_namespace_id ON storage.iceberg_tables USING btree (catalog_id, namespace_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: supabase_functions_hooks_h_table_id_h_name_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);


--
-- Name: supabase_functions_hooks_request_id_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);


--
-- Name: messages_2026_08_20_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_20_inserted_at_topic_idx;


--
-- Name: messages_2026_08_20_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_20_pkey;


--
-- Name: messages_2026_08_21_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_21_inserted_at_topic_idx;


--
-- Name: messages_2026_08_21_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_21_pkey;


--
-- Name: messages_2026_08_22_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_22_inserted_at_topic_idx;


--
-- Name: messages_2026_08_22_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_22_pkey;


--
-- Name: messages_2026_08_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_23_inserted_at_topic_idx;


--
-- Name: messages_2026_08_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_23_pkey;


--
-- Name: messages_2026_08_24_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_08_24_inserted_at_topic_idx;


--
-- Name: messages_2026_08_24_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_08_24_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: users trg_sync_email_verified_from_auth; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER trg_sync_email_verified_from_auth AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified_from_auth();


--
-- Name: division_office division_office_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER division_office_touch_updated_at BEFORE UPDATE ON public.division_office FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: deduction_codes trg_audit_deduction_codes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_deduction_codes AFTER INSERT OR DELETE OR UPDATE ON public.deduction_codes FOR EACH ROW EXECUTE FUNCTION public.log_table_change('deduction_code_modify');


--
-- Name: employees trg_audit_employees; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_employees AFTER INSERT OR DELETE OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.log_table_change('employee_modify');


--
-- Name: audit_logs trg_audit_logs_division; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_logs_division BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();


--
-- Name: pay_periods trg_audit_pay_periods; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_pay_periods AFTER INSERT OR DELETE OR UPDATE ON public.pay_periods FOR EACH ROW EXECUTE FUNCTION public.log_table_change('pay_period_modify');


--
-- Name: payroll_deductions trg_audit_payroll_deductions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_payroll_deductions AFTER INSERT OR DELETE OR UPDATE ON public.payroll_deductions FOR EACH ROW EXECUTE FUNCTION public.log_table_change('payroll_deduction_modify');


--
-- Name: payroll_entries trg_audit_payroll_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_payroll_entries AFTER INSERT OR DELETE OR UPDATE ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION public.log_table_change('payroll_entry_modify');


--
-- Name: payroll_groups trg_audit_payroll_groups; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_payroll_groups AFTER INSERT OR DELETE OR UPDATE ON public.payroll_groups FOR EACH ROW EXECUTE FUNCTION public.log_table_change('payroll_group_modify');


--
-- Name: salary_schedule trg_audit_salary_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_salary_schedule AFTER INSERT OR DELETE OR UPDATE ON public.salary_schedule FOR EACH ROW EXECUTE FUNCTION public.log_table_change('salary_schedule_modify');


--
-- Name: employees trg_dash_cache_employees; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dash_cache_employees AFTER INSERT OR DELETE OR UPDATE ON public.employees FOR EACH STATEMENT EXECUTE FUNCTION public._trig_refresh_dashboard_cache();


--
-- Name: payroll_deductions trg_dash_cache_payroll_deds; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dash_cache_payroll_deds AFTER INSERT OR DELETE OR UPDATE ON public.payroll_deductions FOR EACH STATEMENT EXECUTE FUNCTION public._trig_refresh_dashboard_cache();


--
-- Name: payroll_entries trg_dash_cache_payroll_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dash_cache_payroll_entries AFTER INSERT OR DELETE OR UPDATE ON public.payroll_entries FOR EACH STATEMENT EXECUTE FUNCTION public._trig_refresh_dashboard_cache();


--
-- Name: payroll_entries trg_enforce_posted_entry_invariants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_posted_entry_invariants BEFORE INSERT ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_posted_entry_invariants();


--
-- Name: initial_payroll_records trg_initial_payroll_records_division; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_initial_payroll_records_division BEFORE INSERT ON public.initial_payroll_records FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();


--
-- Name: non_plantilla_employees trg_non_plantilla_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_non_plantilla_before_insert BEFORE INSERT ON public.non_plantilla_employees FOR EACH ROW EXECUTE FUNCTION public.fn_non_plantilla_before_upsert();


--
-- Name: non_plantilla_employees trg_non_plantilla_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_non_plantilla_before_update BEFORE UPDATE ON public.non_plantilla_employees FOR EACH ROW EXECUTE FUNCTION public.fn_non_plantilla_before_upsert();


--
-- Name: non_plantilla_employees trg_non_plantilla_division_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_non_plantilla_division_insert BEFORE INSERT ON public.non_plantilla_employees FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();


--
-- Name: non_plantilla_employees trg_non_plantilla_division_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_non_plantilla_division_update BEFORE UPDATE ON public.non_plantilla_employees FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();


--
-- Name: payroll_definitions trg_payroll_definitions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payroll_definitions_updated BEFORE UPDATE ON public.payroll_definitions FOR EACH ROW EXECUTE FUNCTION public.set_payroll_def_updated_at();


--
-- Name: payroll_formulas trg_payroll_formulas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payroll_formulas_updated BEFORE UPDATE ON public.payroll_formulas FOR EACH ROW EXECUTE FUNCTION public.set_payroll_def_updated_at();


--
-- Name: pay_periods trg_protect_closed_periods; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_closed_periods BEFORE UPDATE ON public.pay_periods FOR EACH ROW WHEN ((old.status = 'closed'::text)) EXECUTE FUNCTION public.prevent_closed_period_reopen();


--
-- Name: payroll_entries trg_protect_posted_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_posted_entries BEFORE DELETE OR UPDATE ON public.payroll_entries FOR EACH ROW WHEN ((old.status = 'Posted'::text)) EXECUTE FUNCTION public.prevent_posted_entry_modification();


--
-- Name: profiles trg_protect_profile_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_profile_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();


--
-- Name: schools trg_schools_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_schools_updated_at();


--
-- Name: signatories trg_signatories_division; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_signatories_division BEFORE INSERT ON public.signatories FOR EACH ROW EXECUTE FUNCTION public.stamp_division_codes();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: extensions extensions_tenant_external_id_fkey; Type: FK CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_tenant_external_id_fkey FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ca_payroll_details ca_payroll_details_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_details
    ADD CONSTRAINT ca_payroll_details_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.ca_employees(id) ON DELETE RESTRICT;


--
-- Name: ca_payroll_details ca_payroll_details_payroll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_details
    ADD CONSTRAINT ca_payroll_details_payroll_id_fkey FOREIGN KEY (payroll_id) REFERENCES public.ca_payroll_headers(id) ON DELETE CASCADE;


--
-- Name: ca_payroll_signatories ca_payroll_signatories_payroll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ca_payroll_signatories
    ADD CONSTRAINT ca_payroll_signatories_payroll_id_fkey FOREIGN KEY (payroll_id) REFERENCES public.ca_payroll_headers(id) ON DELETE CASCADE;


--
-- Name: dbf_restore_history dbf_restore_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_restore_history
    ADD CONSTRAINT dbf_restore_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dbf_sync_sessions dbf_sync_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbf_sync_sessions
    ADD CONSTRAINT dbf_sync_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deduction_history deduction_history_deduction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_history
    ADD CONSTRAINT deduction_history_deduction_id_fkey FOREIGN KEY (deduction_id) REFERENCES public.payroll_deductions(id) ON DELETE CASCADE;


--
-- Name: deductions deductions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deductions
    ADD CONSTRAINT deductions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: deductions deductions_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deductions
    ADD CONSTRAINT deductions_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: division_office division_office_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.division_office
    ADD CONSTRAINT division_office_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE CASCADE;


--
-- Name: divisions divisions_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- Name: earnings earnings_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: earnings earnings_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: employees employees_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: employees employees_payroll_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_payroll_group_id_fkey FOREIGN KEY (payroll_group_id) REFERENCES public.payroll_groups(id) ON DELETE SET NULL;


--
-- Name: plantilla_positions fk_plantilla_pos_header; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_positions
    ADD CONSTRAINT fk_plantilla_pos_header FOREIGN KEY (header_id) REFERENCES public.plantilla_headers(id) ON DELETE SET NULL;


--
-- Name: initial_payroll_absences initial_payroll_absences_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_absences
    ADD CONSTRAINT initial_payroll_absences_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: initial_payroll_entries initial_payroll_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_entries
    ADD CONSTRAINT initial_payroll_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: initial_payroll_entries initial_payroll_entries_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_entries
    ADD CONSTRAINT initial_payroll_entries_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.initial_payroll_records(id) ON DELETE CASCADE;


--
-- Name: initial_payroll_records initial_payroll_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_records
    ADD CONSTRAINT initial_payroll_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: initial_payroll_transfers initial_payroll_transfers_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_transfers
    ADD CONSTRAINT initial_payroll_transfers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: initial_payroll_transfers initial_payroll_transfers_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_payroll_transfers
    ADD CONSTRAINT initial_payroll_transfers_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ips_absences ips_absences_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_absences
    ADD CONSTRAINT ips_absences_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.ips_employees(id) ON DELETE CASCADE;


--
-- Name: ips_payroll_details ips_payroll_details_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_payroll_details
    ADD CONSTRAINT ips_payroll_details_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.ips_employees(id) ON DELETE CASCADE;


--
-- Name: ips_payroll_details ips_payroll_details_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ips_payroll_details
    ADD CONSTRAINT ips_payroll_details_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.ips_payroll_periods(id) ON DELETE SET NULL;


--
-- Name: login_attempts login_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: otp_codes otp_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payent payent_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payent
    ADD CONSTRAINT payent_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: payent payent_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payent
    ADD CONSTRAINT payent_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: payroll_deductions payroll_deductions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT payroll_deductions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_disabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_disabled_by_fkey FOREIGN KEY (disabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: role_permissions role_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: schools schools_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: stacode_audit stacode_audit_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stacode_audit
    ADD CONSTRAINT stacode_audit_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: undeducted_obligations undeducted_obligations_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.undeducted_obligations
    ADD CONSTRAINT undeducted_obligations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: undeducted_obligations undeducted_obligations_pay_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.undeducted_obligations
    ADD CONSTRAINT undeducted_obligations_pay_period_id_fkey FOREIGN KEY (pay_period_id) REFERENCES public.pay_periods(id) ON DELETE CASCADE;


--
-- Name: undeducted_obligations undeducted_obligations_payroll_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.undeducted_obligations
    ADD CONSTRAINT undeducted_obligations_payroll_entry_id_fkey FOREIGN KEY (payroll_entry_id) REFERENCES public.payroll_entries(id) ON DELETE CASCADE;


--
-- Name: iceberg_namespaces iceberg_namespaces_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_namespace_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES storage.iceberg_namespaces(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ca_employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ca_employees ENABLE ROW LEVEL SECURITY;

--
-- Name: ca_employees ca_employees_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_employees_delete ON public.ca_employees FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_employees ca_employees_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_employees_insert ON public.ca_employees FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_employees ca_employees_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_employees_select ON public.ca_employees FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_employees ca_employees_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_employees_update ON public.ca_employees FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ca_payroll_details ENABLE ROW LEVEL SECURITY;

--
-- Name: ca_payroll_details ca_payroll_details_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_details_delete ON public.ca_payroll_details FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_details ca_payroll_details_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_details_insert ON public.ca_payroll_details FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_details ca_payroll_details_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_details_select ON public.ca_payroll_details FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_details ca_payroll_details_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_details_update ON public.ca_payroll_details FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_headers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ca_payroll_headers ENABLE ROW LEVEL SECURITY;

--
-- Name: ca_payroll_headers ca_payroll_headers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_headers_delete ON public.ca_payroll_headers FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_headers ca_payroll_headers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_headers_insert ON public.ca_payroll_headers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_headers ca_payroll_headers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_headers_select ON public.ca_payroll_headers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_headers ca_payroll_headers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_headers_update ON public.ca_payroll_headers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_signatories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ca_payroll_signatories ENABLE ROW LEVEL SECURITY;

--
-- Name: ca_payroll_signatories ca_payroll_signatories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_signatories_delete ON public.ca_payroll_signatories FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_signatories ca_payroll_signatories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_signatories_insert ON public.ca_payroll_signatories FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_signatories ca_payroll_signatories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_signatories_select ON public.ca_payroll_signatories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ca_payroll_signatories ca_payroll_signatories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_payroll_signatories_update ON public.ca_payroll_signatories FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: dashboard_stats_cache cache_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cache_select ON public.dashboard_stats_cache FOR SELECT TO authenticated USING (public.is_data_admin());


--
-- Name: dashboard_stats_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_stats_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_divtable dbf_div_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_div_delete ON public.dbf_divtable FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_divtable dbf_div_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_div_insert ON public.dbf_divtable FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_divtable dbf_div_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_div_select ON public.dbf_divtable FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_divtable dbf_div_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_div_update ON public.dbf_divtable FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_divtable; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_divtable ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_excluded dbf_exc_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_exc_delete ON public.dbf_excluded FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_excluded dbf_exc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_exc_insert ON public.dbf_excluded FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_excluded dbf_exc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_exc_select ON public.dbf_excluded FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_excluded dbf_exc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_exc_update ON public.dbf_excluded FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_excluded; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_excluded ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_included dbf_inc_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_inc_delete ON public.dbf_included FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_included dbf_inc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_inc_insert ON public.dbf_included FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_included dbf_inc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_inc_select ON public.dbf_included FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_included dbf_inc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_inc_update ON public.dbf_included FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_included; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_included ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_payrolls dbf_pay_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pay_delete ON public.dbf_payrolls FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_payrolls dbf_pay_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pay_insert ON public.dbf_payrolls FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_payrolls dbf_pay_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pay_select ON public.dbf_payrolls FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_payrolls dbf_pay_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pay_update ON public.dbf_payrolls FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_payrolls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_payrolls ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_pyent1 dbf_pye1_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye1_delete ON public.dbf_pyent1 FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent1 dbf_pye1_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye1_insert ON public.dbf_pyent1 FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent1 dbf_pye1_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye1_select ON public.dbf_pyent1 FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent1 dbf_pye1_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye1_update ON public.dbf_pyent1 FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent2 dbf_pye2_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye2_delete ON public.dbf_pyent2 FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent2 dbf_pye2_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye2_insert ON public.dbf_pyent2 FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent2 dbf_pye2_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye2_select ON public.dbf_pyent2 FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent2 dbf_pye2_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye2_update ON public.dbf_pyent2 FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent dbf_pye_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye_delete ON public.dbf_pyent FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent dbf_pye_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye_insert ON public.dbf_pyent FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent dbf_pye_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye_select ON public.dbf_pyent FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_pyent dbf_pye_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_pye_update ON public.dbf_pyent FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_pyent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_pyent ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_pyent1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_pyent1 ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_pyent2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_pyent2 ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_restore_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_restore_history ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_stntable dbf_stn_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_stn_delete ON public.dbf_stntable FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_stntable dbf_stn_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_stn_insert ON public.dbf_stntable FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_stntable dbf_stn_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_stn_select ON public.dbf_stntable FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_stntable dbf_stn_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_stn_update ON public.dbf_stntable FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: dbf_stntable; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_stntable ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_sync_sessions dbf_sync_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_sync_delete ON public.dbf_sync_sessions FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_sync_sessions dbf_sync_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_sync_insert ON public.dbf_sync_sessions FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: dbf_sync_sessions dbf_sync_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_sync_select ON public.dbf_sync_sessions FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: dbf_sync_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dbf_sync_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: dbf_sync_sessions dbf_sync_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dbf_sync_update ON public.dbf_sync_sessions FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: deduction_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deduction_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: deduction_codes deduction_codes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deduction_codes_delete ON public.deduction_codes FOR DELETE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: deduction_codes deduction_codes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deduction_codes_insert ON public.deduction_codes FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: deduction_codes deduction_codes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deduction_codes_select ON public.deduction_codes FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: deduction_codes deduction_codes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deduction_codes_update ON public.deduction_codes FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: deduction_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deduction_history ENABLE ROW LEVEL SECURITY;

--
-- Name: deductions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

--
-- Name: deductions deductions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deductions_delete ON public.deductions FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: deductions deductions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deductions_insert ON public.deductions FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: deductions deductions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deductions_select ON public.deductions FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = deductions.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = deductions.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));


--
-- Name: deductions deductions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deductions_update ON public.deductions FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: division_office delete_division_office_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_division_office_admin ON public.division_office FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text) AND (p.status = 'approved'::text)))));


--
-- Name: initial_payroll_entries delete_initial_payroll_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_initial_payroll_entries ON public.initial_payroll_entries FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_records delete_initial_payroll_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_initial_payroll_records ON public.initial_payroll_records FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_transfers delete_initial_payroll_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_initial_payroll_transfers ON public.initial_payroll_transfers FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: non_plantilla_employees delete_non_plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_non_plantilla ON public.non_plantilla_employees FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: gsis_import_logs delete_own_gsis_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_own_gsis_import_logs ON public.gsis_import_logs FOR DELETE TO authenticated USING ((auth.uid() = uploaded_by_id));


--
-- Name: pli_import_logs delete_own_pli_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_own_pli_import_logs ON public.pli_import_logs FOR DELETE TO authenticated USING ((auth.uid() = uploaded_by_id));


--
-- Name: position_import_logs delete_own_position_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_own_position_import_logs ON public.position_import_logs FOR DELETE TO authenticated USING ((auth.uid() = uploaded_by_id));


--
-- Name: dbf_restore_history delete_own_restores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_own_restores ON public.dbf_restore_history FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: payroll_number_counter delete_payroll_number_counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_payroll_number_counter ON public.payroll_number_counter FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_headers delete_plantilla_headers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_plantilla_headers ON public.plantilla_headers FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_import_logs delete_plantilla_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_plantilla_import_logs ON public.plantilla_import_logs FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_positions delete_plantilla_positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_plantilla_positions ON public.plantilla_positions FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: position_management delete_position_management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_position_management ON public.position_management FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: role_permissions delete_role_permissions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_role_permissions_admin ON public.role_permissions FOR DELETE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: schools delete_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_schools ON public.schools FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: signatories delete_signatories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_signatories ON public.signatories FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: division_office; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.division_office ENABLE ROW LEVEL SECURITY;

--
-- Name: divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: divisions divisions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_delete ON public.divisions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: divisions divisions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_insert ON public.divisions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: divisions divisions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_select ON public.divisions FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: divisions divisions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY divisions_update ON public.divisions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: earnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

--
-- Name: earnings earnings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY earnings_delete ON public.earnings FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: earnings earnings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY earnings_insert ON public.earnings FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: earnings earnings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY earnings_select ON public.earnings FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = earnings.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = earnings.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));


--
-- Name: earnings earnings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY earnings_update ON public.earnings FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: employees employees_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: employees employees_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (stacode = public.get_current_user_stacode())) OR ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) OR (employee_number = public.get_current_user_empno())))));


--
-- Name: employees employees_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: gsis_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gsis_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: initial_payroll_absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.initial_payroll_absences ENABLE ROW LEVEL SECURITY;

--
-- Name: initial_payroll_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.initial_payroll_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: initial_payroll_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.initial_payroll_records ENABLE ROW LEVEL SECURITY;

--
-- Name: initial_payroll_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.initial_payroll_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs insert_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_audit_logs ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: deduction_history insert_deduction_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_deduction_history ON public.deduction_history FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: division_office insert_division_office_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_division_office_admin ON public.division_office FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text, 'hr_administrator'::text])) AND (p.status = 'approved'::text)))));


--
-- Name: initial_payroll_entries insert_initial_payroll_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_initial_payroll_entries ON public.initial_payroll_entries FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_records insert_initial_payroll_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_initial_payroll_records ON public.initial_payroll_records FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_transfers insert_initial_payroll_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_initial_payroll_transfers ON public.initial_payroll_transfers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: login_attempts insert_login_attempts_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_login_attempts_anon ON public.login_attempts FOR INSERT TO anon WITH CHECK (((user_id IS NULL) AND (success = false) AND ((failure_reason IS NULL) OR (failure_reason = ANY (ARRAY['invalid_credentials'::text, 'account_locked'::text, 'email_unverified'::text, 'unexpected_error'::text])))));


--
-- Name: login_attempts insert_login_attempts_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_login_attempts_authenticated ON public.login_attempts FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR ((user_id IS NULL) AND (success = false) AND ((failure_reason IS NULL) OR (failure_reason = ANY (ARRAY['invalid_credentials'::text, 'account_locked'::text, 'email_unverified'::text, 'unexpected_error'::text]))))));


--
-- Name: non_plantilla_employees insert_non_plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_non_plantilla ON public.non_plantilla_employees FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: gsis_import_logs insert_own_gsis_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own_gsis_import_logs ON public.gsis_import_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: otp_codes insert_own_otp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own_otp ON public.otp_codes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: pli_import_logs insert_own_pli_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own_pli_import_logs ON public.pli_import_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: position_import_logs insert_own_position_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own_position_import_logs ON public.position_import_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: dbf_restore_history insert_own_restores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own_restores ON public.dbf_restore_history FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: password_reset_tokens insert_password_reset; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_password_reset ON public.password_reset_tokens FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: payroll_number_counter insert_payroll_number_counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_payroll_number_counter ON public.payroll_number_counter FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_headers insert_plantilla_headers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_plantilla_headers ON public.plantilla_headers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_import_logs insert_plantilla_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_plantilla_import_logs ON public.plantilla_import_logs FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_positions insert_plantilla_positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_plantilla_positions ON public.plantilla_positions FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: position_management insert_position_management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_position_management ON public.position_management FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: role_permissions insert_role_permissions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_role_permissions_admin ON public.role_permissions FOR INSERT TO authenticated WITH CHECK ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: schools insert_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_schools ON public.schools FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: signatories insert_signatories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_signatories ON public.signatories FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_absences ipa_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipa_delete ON public.initial_payroll_absences FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_absences ipa_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipa_insert ON public.initial_payroll_absences FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_absences ipa_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipa_select ON public.initial_payroll_absences FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_absences ipa_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ipa_update ON public.initial_payroll_absences FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_absences ips_abs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_abs_delete ON public.ips_absences FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_absences ips_abs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_abs_insert ON public.ips_absences FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_absences ips_abs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_abs_select ON public.ips_absences FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_absences ips_abs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_abs_update ON public.ips_absences FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ips_absences ENABLE ROW LEVEL SECURITY;

--
-- Name: ips_audit_logs ips_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_audit_insert ON public.ips_audit_logs FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ips_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ips_audit_logs ips_audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_audit_select ON public.ips_audit_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_employees ips_emp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_emp_delete ON public.ips_employees FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_employees ips_emp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_emp_insert ON public.ips_employees FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_employees ips_emp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_emp_select ON public.ips_employees FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_employees ips_emp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_emp_update ON public.ips_employees FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ips_employees ENABLE ROW LEVEL SECURITY;

--
-- Name: ips_payroll_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ips_payroll_details ENABLE ROW LEVEL SECURITY;

--
-- Name: ips_payroll_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ips_payroll_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: ips_payroll_details ips_pd_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pd_delete ON public.ips_payroll_details FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_details ips_pd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pd_insert ON public.ips_payroll_details FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_details ips_pd_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pd_select ON public.ips_payroll_details FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_details ips_pd_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pd_update ON public.ips_payroll_details FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_periods ips_pp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pp_delete ON public.ips_payroll_periods FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_periods ips_pp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pp_insert ON public.ips_payroll_periods FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_periods ips_pp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pp_select ON public.ips_payroll_periods FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ips_payroll_periods ips_pp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ips_pp_update ON public.ips_payroll_periods FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: non_plantilla_employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.non_plantilla_employees ENABLE ROW LEVEL SECURITY;

--
-- Name: otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_periods pay_periods_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_delete ON public.pay_periods FOR DELETE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: pay_periods pay_periods_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_insert ON public.pay_periods FOR INSERT TO authenticated WITH CHECK ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text])));


--
-- Name: pay_periods pay_periods_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_select ON public.pay_periods FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: pay_periods pay_periods_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pay_periods_update ON public.pay_periods FOR UPDATE TO authenticated USING ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text]))) WITH CHECK ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text])));


--
-- Name: payent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payent ENABLE ROW LEVEL SECURITY;

--
-- Name: payent payent_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payent_delete ON public.payent FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: payent payent_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payent_insert ON public.payent FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: payent payent_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payent_select ON public.payent FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payent.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND ((empno = public.get_current_user_empno()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payent.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno())))))))));


--
-- Name: payent payent_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payent_update ON public.payent FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: payroll_deductions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_deductions payroll_deductions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_deductions_delete ON public.payroll_deductions FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: payroll_deductions payroll_deductions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_deductions_insert ON public.payroll_deductions FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: payroll_deductions payroll_deductions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_deductions_select ON public.payroll_deductions FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND ((empno = public.get_current_user_empno()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_deductions.employee_id) AND (e.stacode = public.get_current_user_stacode())))))) OR ((public.get_current_user_role() = 'ess'::text) AND (empno = public.get_current_user_empno()))));


--
-- Name: payroll_deductions payroll_deductions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_deductions_update ON public.payroll_deductions FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: payroll_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_entries payroll_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_delete ON public.payroll_entries FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: payroll_entries payroll_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_insert ON public.payroll_entries FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: payroll_entries payroll_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_select ON public.payroll_entries FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_entries.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_entries.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));


--
-- Name: payroll_entries payroll_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_update ON public.payroll_entries FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: payroll_formulas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_formulas ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_groups payroll_groups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_groups_delete ON public.payroll_groups FOR DELETE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: payroll_groups payroll_groups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_groups_insert ON public.payroll_groups FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: payroll_groups payroll_groups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_groups_select ON public.payroll_groups FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: payroll_groups payroll_groups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_groups_update ON public.payroll_groups FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: payroll_number_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_number_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: payrolls_dbf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payrolls_dbf ENABLE ROW LEVEL SECURITY;

--
-- Name: payrolls_dbf pdbf_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pdbf_delete ON public.payrolls_dbf FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: payrolls_dbf pdbf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pdbf_insert ON public.payrolls_dbf FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: payrolls_dbf pdbf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pdbf_select ON public.payrolls_dbf FOR SELECT TO authenticated USING (public.is_data_writer());


--
-- Name: payrolls_dbf pdbf_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pdbf_update ON public.payrolls_dbf FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: plantilla_headers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantilla_headers ENABLE ROW LEVEL SECURITY;

--
-- Name: plantilla_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantilla_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: plantilla_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantilla_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: pli_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pli_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: position_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.position_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: position_management; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.position_management ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

--
-- Name: regions regions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regions_delete ON public.regions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: regions regions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regions_insert ON public.regions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: regions regions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regions_select ON public.regions FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: regions regions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regions_update ON public.regions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salary_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_schedule salary_schedule_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY salary_schedule_delete ON public.salary_schedule FOR DELETE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: salary_schedule salary_schedule_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY salary_schedule_insert ON public.salary_schedule FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: salary_schedule salary_schedule_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY salary_schedule_select ON public.salary_schedule FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: salary_schedule salary_schedule_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY salary_schedule_update ON public.salary_schedule FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: security_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

--
-- Name: security_events security_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY security_events_insert ON public.security_events FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: security_events security_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY security_events_select ON public.security_events FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: security_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: security_settings security_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY security_settings_select ON public.security_settings FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: security_settings security_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY security_settings_update ON public.security_settings FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: login_attempts select_all_login_attempts_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_all_login_attempts_admin ON public.login_attempts FOR SELECT TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: profiles select_all_profiles_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_all_profiles_admin ON public.profiles FOR SELECT TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: audit_logs select_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_audit_logs ON public.audit_logs FOR SELECT TO authenticated USING ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'viewer'::text])));


--
-- Name: deduction_history select_deduction_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_deduction_history ON public.deduction_history FOR SELECT TO authenticated USING (public.is_data_admin());


--
-- Name: division_office select_division_office; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_division_office ON public.division_office FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: gsis_import_logs select_gsis_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_gsis_import_logs ON public.gsis_import_logs FOR SELECT TO authenticated USING ((public.is_data_admin() OR (auth.uid() = uploaded_by_id)));


--
-- Name: initial_payroll_entries select_initial_payroll_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_initial_payroll_entries ON public.initial_payroll_entries FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_records select_initial_payroll_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_initial_payroll_records ON public.initial_payroll_records FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_transfers select_initial_payroll_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_initial_payroll_transfers ON public.initial_payroll_transfers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: non_plantilla_employees select_non_plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_non_plantilla ON public.non_plantilla_employees FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: login_attempts select_own_login_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_login_attempts ON public.login_attempts FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: otp_codes select_own_otp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_otp ON public.otp_codes FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: position_import_logs select_own_position_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_position_import_logs ON public.position_import_logs FOR SELECT TO authenticated USING ((auth.uid() = uploaded_by_id));


--
-- Name: profiles select_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_profile ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: password_reset_tokens select_own_reset_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_reset_tokens ON public.password_reset_tokens FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: dbf_restore_history select_own_restores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_own_restores ON public.dbf_restore_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: payroll_number_counter select_payroll_number_counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_payroll_number_counter ON public.payroll_number_counter FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_headers select_plantilla_headers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_plantilla_headers ON public.plantilla_headers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_import_logs select_plantilla_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_plantilla_import_logs ON public.plantilla_import_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_positions select_plantilla_positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_plantilla_positions ON public.plantilla_positions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: pli_import_logs select_pli_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_pli_import_logs ON public.pli_import_logs FOR SELECT TO authenticated USING ((public.is_data_admin() OR (auth.uid() = uploaded_by_id)));


--
-- Name: position_management select_position_management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_position_management ON public.position_management FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: role_permissions select_role_permissions_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_role_permissions_authenticated ON public.role_permissions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: schools select_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_schools ON public.schools FOR SELECT USING ((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])));


--
-- Name: signatories select_signatories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_signatories ON public.signatories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: signatories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signatories ENABLE ROW LEVEL SECURITY;

--
-- Name: stacode_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stacode_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: stacode_audit stacode_audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stacode_audit_insert ON public.stacode_audit FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: stacode_audit stacode_audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stacode_audit_select ON public.stacode_audit FOR SELECT TO authenticated USING ((public.get_current_user_role() = ANY (ARRAY['super_admin'::text, 'auditor'::text, 'division_finance'::text])));


--
-- Name: payroll_definitions super_admin_manage_payroll_definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_manage_payroll_definitions ON public.payroll_definitions USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: payroll_formulas super_admin_manage_payroll_formulas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_manage_payroll_formulas ON public.payroll_formulas USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: undeducted_obligations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.undeducted_obligations ENABLE ROW LEVEL SECURITY;

--
-- Name: undeducted_obligations undeducted_obligations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY undeducted_obligations_delete ON public.undeducted_obligations FOR DELETE TO authenticated USING (public.is_data_writer());


--
-- Name: undeducted_obligations undeducted_obligations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY undeducted_obligations_insert ON public.undeducted_obligations FOR INSERT TO authenticated WITH CHECK (public.is_data_writer());


--
-- Name: undeducted_obligations undeducted_obligations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY undeducted_obligations_select ON public.undeducted_obligations FOR SELECT TO authenticated USING ((public.is_data_admin() OR ((public.get_current_user_role() = ANY (ARRAY['school_coordinator'::text, 'school_head'::text])) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = undeducted_obligations.employee_id) AND (e.stacode = public.get_current_user_stacode()))))) OR ((public.get_current_user_role() = 'ess'::text) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = undeducted_obligations.employee_id) AND ((e.empno = public.get_current_user_empno()) OR (e.employee_number = public.get_current_user_empno()))))))));


--
-- Name: undeducted_obligations undeducted_obligations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY undeducted_obligations_update ON public.undeducted_obligations FOR UPDATE TO authenticated USING (public.is_data_writer()) WITH CHECK (public.is_data_writer());


--
-- Name: profiles update_all_profiles_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_all_profiles_admin ON public.profiles FOR UPDATE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text)) WITH CHECK ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: division_office update_division_office_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_division_office_admin ON public.division_office FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text, 'hr_administrator'::text])) AND (p.status = 'approved'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'payroll_admin'::text, 'hr_administrator'::text])) AND (p.status = 'approved'::text)))));


--
-- Name: initial_payroll_entries update_initial_payroll_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_initial_payroll_entries ON public.initial_payroll_entries FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_records update_initial_payroll_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_initial_payroll_records ON public.initial_payroll_records FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: initial_payroll_transfers update_initial_payroll_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_initial_payroll_transfers ON public.initial_payroll_transfers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: non_plantilla_employees update_non_plantilla; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_non_plantilla ON public.non_plantilla_employees FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: gsis_import_logs update_own_gsis_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_gsis_import_logs ON public.gsis_import_logs FOR UPDATE TO authenticated USING ((auth.uid() = uploaded_by_id)) WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: otp_codes update_own_otp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_otp ON public.otp_codes FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: pli_import_logs update_own_pli_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_pli_import_logs ON public.pli_import_logs FOR UPDATE TO authenticated USING ((auth.uid() = uploaded_by_id)) WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: position_import_logs update_own_position_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_position_import_logs ON public.position_import_logs FOR UPDATE TO authenticated USING ((auth.uid() = uploaded_by_id)) WITH CHECK ((auth.uid() = uploaded_by_id));


--
-- Name: profiles update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_profile ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: password_reset_tokens update_own_reset_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_reset_tokens ON public.password_reset_tokens FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: dbf_restore_history update_own_restores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own_restores ON public.dbf_restore_history FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: payroll_number_counter update_payroll_number_counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_payroll_number_counter ON public.payroll_number_counter FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_headers update_plantilla_headers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_plantilla_headers ON public.plantilla_headers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_import_logs update_plantilla_import_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_plantilla_import_logs ON public.plantilla_import_logs FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: plantilla_positions update_plantilla_positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_plantilla_positions ON public.plantilla_positions FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: position_management update_position_management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_position_management ON public.position_management FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: role_permissions update_role_permissions_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_role_permissions_admin ON public.role_permissions FOR UPDATE TO authenticated USING ((public.get_current_user_role() = 'super_admin'::text)) WITH CHECK ((public.get_current_user_role() = 'super_admin'::text));


--
-- Name: schools update_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_schools ON public.schools FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: signatories update_signatories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_signatories ON public.signatories FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_namespaces; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_namespaces ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_tables; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict oyv8Mwjj0LxiFicfq4LUg27WcI9jBZ5j3a8NHIJ6pEXsod9dXsGlluXjf9XB94N

