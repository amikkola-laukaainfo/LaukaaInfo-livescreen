-- =============================================================================
-- 067_verify.sql
-- Tarkistuslause migraation 067 ajon jälkeen
-- Aja LaukaaInfon pääprojektissa — ei muuta tietokantaa
-- =============================================================================

-- 1. GRANT-oikeudet: anon = false, authenticated = true, service_role = true
SELECT
    p.proname                                          AS function_name,
    a.rolname                                          AS role,
    has_function_privilege(a.oid, p.oid, 'EXECUTE')   AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles a
WHERE n.nspname = 'public'
  AND p.proname IN (
      'set_organization_wall_access_code',
      'set_organization_default_visibility'
  )
  AND a.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY p.proname, a.rolname;

-- Odotettu tulos:
-- set_organization_default_visibility | anon          | false
-- set_organization_default_visibility | authenticated | true
-- set_organization_default_visibility | service_role  | true
-- set_organization_wall_access_code   | anon          | false
-- set_organization_wall_access_code   | authenticated | true
-- set_organization_wall_access_code   | service_role  | true


-- 2. Allekirjoitukset: varmistaa ettei ylikuormitettuja versioita ole jäänyt
SELECT
    p.proname                                       AS function_name,
    pg_get_function_identity_arguments(p.oid)       AS arguments,
    p.oid::regprocedure                             AS full_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'set_organization_wall_access_code',
      'set_organization_default_visibility'
  )
ORDER BY p.proname;

-- Odotettu tulos: kummallakin täsmälleen yksi rivi
-- Argumentit: p_organization_id text, p_publish_key text, p_access_code text
--         ja: p_organization_id text, p_publish_key text, p_default_visibility text


-- 3. Funktioiden sisältö: varmistaa että p_publish_key-polku on poistettu
SELECT
    p.proname AS function_name,
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%verify_publisher_key%'
            THEN 'VAROITUS: verify_publisher_key-kutsu löytyy yhä!'
        WHEN pg_get_functiondef(p.oid) LIKE '%_check_org_admin_or_moderator%'
            THEN 'OK: käyttää _check_org_admin_or_moderator-tarkistusta'
        ELSE 'TUNTEMATON TILA'
    END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'set_organization_wall_access_code',
      'set_organization_default_visibility'
  )
ORDER BY p.proname;

-- Odotettu tulos: molemmat rivit → 'OK: käyttää _check_org_admin_or_moderator-tarkistusta'
