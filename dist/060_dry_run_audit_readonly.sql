-- ============================================================================
-- LAUKAAINFO / KOHTAAMISET – 100% READ-ONLY DRY-RUN JSON-KOONTIKYSELY
-- ============================================================================
-- Tämä kysely on TÄYSIN LUKUOPERAATIO (ei yhtäkään DDL- tai DML-komentoa).
-- Se palauttaa kaikkien 8 tarkistuskohteen tiedot YHTENÄ jäsenneltynä JSON-objektina.
--
-- TURVALLISUUSRAJAUS:
--   - Ei salaisuuksia, salasanoja, julkaisuavaimia tai tiivisteitä (code_hash).
--   - Puuttuvat taulut ja funktiot raportoidaan tilalla 'missing' ilman kyselyvirheitä.
-- ============================================================================

WITH
-- 1. TAULUT (Kohdetaulut ja olemassaolo)
target_tables AS (
    SELECT unnest(ARRAY[
        'encounters',
        'encounter_edit_tokens',
        'places',
        'organizations',
        'organization_publish_credentials',
        'organization_members',
        'banned_emails',
        'entity_tags',
        'posts'
    ]) AS table_name
),
audit_tables AS (
    SELECT 
        tt.table_name,
        CASE WHEN t.table_name IS NOT NULL THEN 'ok' ELSE 'missing' END AS status,
        t.table_type
    FROM target_tables tt
    LEFT JOIN information_schema.tables t 
      ON t.table_schema = 'public' AND t.table_name = tt.table_name
    ORDER BY tt.table_name
),

-- 2. SARAKKEET (Sarakkeet, tietotyypit, null-sallivuus, oletusarvot)
audit_columns AS (
    SELECT 
        c.table_name,
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default
    FROM information_schema.columns c
    JOIN target_tables tt ON tt.table_name = c.table_name
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
),

-- 3. RAJOITTEET JA VIITEAVAIMET (PK, FK, UNIQUE, CHECK)
audit_constraints AS (
    SELECT 
        conrelid::regclass::text AS table_name,
        conname AS constraint_name,
        CASE contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
            WHEN 't' THEN 'TRIGGER'
            ELSE contype::text
        END AS constraint_type,
        pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid::regclass::text IN (
          'public.encounters',
          'public.encounter_edit_tokens',
          'public.places',
          'public.organizations',
          'public.organization_publish_credentials',
          'public.organization_members',
          'public.banned_emails',
          'public.entity_tags',
          'public.posts'
      )
    ORDER BY table_name, constraint_type, constraint_name
),

-- 4. RLS JA KÄYTTÖOIKEUDET
audit_rls_tables AS (
    SELECT 
        tt.table_name,
        COALESCE(pt.rowsecurity, false) AS rls_enabled
    FROM target_tables tt
    LEFT JOIN pg_tables pt ON pt.schemaname = 'public' AND pt.tablename = tt.table_name
),
audit_policies AS (
    SELECT 
        tablename AS table_name,
        policyname AS policy_name,
        permissive,
        roles,
        cmd,
        qual AS using_expression,
        with_check AS with_check_expression
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (SELECT table_name FROM target_tables)
    ORDER BY tablename, policyname
),
audit_privileges AS (
    SELECT 
        table_name,
        grantee,
        privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (SELECT table_name FROM target_tables)
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, grantee, privilege_type
),

-- 5. TRIGGERIT
audit_triggers AS (
    SELECT 
        event_object_table AS table_name,
        trigger_name,
        event_manipulation AS event,
        action_timing AS timing,
        action_statement AS trigger_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table IN (SELECT table_name FROM target_tables)
    ORDER BY table_name, trigger_name
),

-- 6. RPC-FUNKTIOT
target_functions AS (
    SELECT unnest(ARRAY[
        'verify_publisher_key',
        'resolve_publisher_key',
        'create_encounter',
        'update_encounter_with_token',
        'delete_encounter_with_token',
        'publish_post_with_key',
        'get_protected_org_posts',
        'get_org_posts_with_key'
    ]) AS function_name
),
audit_functions AS (
    SELECT 
        tf.function_name,
        CASE WHEN p.proname IS NOT NULL THEN 'ok' ELSE 'missing' END AS status,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        pg_get_function_result(p.oid) AS return_type,
        p.prosecdef AS is_security_definer,
        p.proconfig AS configuration_settings
    FROM target_functions tf
    LEFT JOIN (
        SELECT p2.*
        FROM pg_proc p2
        JOIN pg_namespace n ON n.oid = p2.pronamespace AND n.nspname = 'public'
    ) p ON p.proname = tf.function_name
    ORDER BY tf.function_name
),

-- 7. ORGANISAATIOIDEN JULKAISUTILAT (Ilman salaisuuksia / avaimia)
audit_organizations AS (
    SELECT 
        'ok' AS status,
        COUNT(*)::int AS count,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'name', name,
                    'type', type,
                    'publisher_enabled', publisher_enabled,
                    'publisher_code_version', publisher_code_version,
                    'wall_visibility', wall_visibility
                )
            ),
            '[]'::jsonb
        ) AS records
    FROM public.organizations
),

-- 8. PAIKKATIEDON EHEYS
audit_places AS (
    SELECT 
        'ok' AS status,
        COUNT(*)::int AS total_places,
        COUNT(*) FILTER (WHERE id IS NOT NULL)::int AS has_id_count,
        COUNT(*) FILTER (WHERE id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::int AS valid_uuid_count,
        (
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'id'
        ) AS id_data_type,
        (
            SELECT jsonb_agg(jsonb_build_object('constraint_name', conname, 'def', pg_get_constraintdef(oid)))
            FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace
              AND conrelid = 'public.places'::regclass
              AND contype = 'p'
        ) AS pk_constraint
    FROM public.places
)

-- YHDISTETTY JSON-KOONTI
SELECT jsonb_pretty(
    jsonb_build_object(
        'audit_timestamp', now(),
        'database_target', current_database(),
        
        -- 1. Taulut
        '1_tables', (
            SELECT jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'status', status,
                'table_type', table_type
            )) FROM audit_tables
        ),
        
        -- 2. Sarakkeet
        '2_columns', (
            SELECT jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'position', ordinal_position,
                'column_name', column_name,
                'data_type', data_type,
                'udt_name', udt_name,
                'is_nullable', is_nullable,
                'default', column_default
            )) FROM audit_columns
        ),
        
        -- 3. Rajoitteet ja viiteavaimet
        '3_constraints', (
            SELECT jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'constraint_name', constraint_name,
                'type', constraint_type,
                'definition', definition
            )) FROM audit_constraints
        ),
        
        -- 4. RLS ja käyttöoikeudet
        '4_rls_and_privileges', jsonb_build_object(
            'rls_enabled_per_table', (
                SELECT jsonb_agg(jsonb_build_object(
                    'table_name', table_name,
                    'rls_enabled', rls_enabled
                )) FROM audit_rls_tables
            ),
            'policies', (
                SELECT jsonb_agg(jsonb_build_object(
                    'table_name', table_name,
                    'policy_name', policy_name,
                    'permissive', permissive,
                    'roles', roles,
                    'cmd', cmd,
                    'using', using_expression,
                    'with_check', with_check_expression
                )) FROM audit_policies
            ),
            'role_grants', (
                SELECT jsonb_agg(jsonb_build_object(
                    'table_name', table_name,
                    'grantee', grantee,
                    'privilege', privilege_type
                )) FROM audit_privileges
            )
        ),
        
        -- 5. Triggerit
        '5_triggers', (
            SELECT jsonb_agg(jsonb_build_object(
                'table_name', table_name,
                'trigger_name', trigger_name,
                'event', event,
                'timing', timing,
                'statement', trigger_statement
            )) FROM audit_triggers
        ),
        
        -- 6. RPC-funktiot
        '6_rpc_functions', (
            SELECT jsonb_agg(jsonb_build_object(
                'function_name', function_name,
                'status', status,
                'arguments', arguments,
                'return_type', return_type,
                'is_security_definer', is_security_definer,
                'configuration', configuration_settings
            )) FROM audit_functions
        ),
        
        -- 7. Organisaatioiden tila
        '7_organizations_state', (
            SELECT jsonb_build_object(
                'status', status,
                'count', count,
                'records', records
            ) FROM audit_organizations
        ),
        
        -- 8. Paikkatiedon eheys
        '8_places_integrity', (
            SELECT jsonb_build_object(
                'status', status,
                'total_places', total_places,
                'has_id_count', has_id_count,
                'valid_uuid_count', valid_uuid_count,
                'id_data_type', id_data_type,
                'primary_key_constraint', pk_constraint
            ) FROM audit_places
        )
    )
) AS audit_report;
