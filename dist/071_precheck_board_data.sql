-- =============================================================================
-- 071_precheck_board_data.sql
-- LaukaaInfo – Päätös- ja toimintataulun datan esitarkastuskyselyt (v11)
-- =============================================================================
-- Tarkoitus: Aja nämä kyselyt Supabase SQL Editorissa ENNEN 071-migraation ajamista
-- ja tarkistusmielessä heti sen jälkeen.
-- Kyselyt ovat puhtaasti lukevia (SELECT) eivätkä tee muutoksia tietokantaan.
-- =============================================================================

-- 1. Tarkista onko kannassa päällekkäisiä ilmoittautumisia (task_id, LOWER(BTRIM(participant_name)))
-- Tavoite: 0 riviä.
SELECT 
    task_id,
    pg_catalog.lower(pg_catalog.btrim(participant_name)) AS normalized_name,
    COUNT(*) AS signup_count,
    pg_catalog.array_agg(id) AS signup_ids,
    pg_catalog.array_agg(participant_name) AS original_names,
    pg_catalog.array_agg(participant_contact) AS contacts,
    pg_catalog.array_agg(created_at) AS created_timestamps
FROM public.board_task_signups
GROUP BY task_id, pg_catalog.lower(pg_catalog.btrim(participant_name))
HAVING COUNT(*) > 1;

-- 2. Tarkista puuttuuko ilmoittautumisilta nimi (NULL tai tyhjä)
-- Tavoite: 0 riviä.
SELECT 
    id AS signup_id,
    task_id,
    item_id,
    organization_id,
    participant_name,
    created_at
FROM public.board_task_signups
WHERE participant_name IS NULL OR pg_catalog.btrim(participant_name) = '';

-- 3. Tarkista onko kannassa päällekkäisiä julkaisuviitteitä (wall_post_id)
-- Tavoite: 0 riviä.
SELECT 
    wall_post_id,
    COUNT(*) AS duplicate_count,
    pg_catalog.array_agg(id) AS item_ids,
    pg_catalog.array_agg(title) AS item_titles
FROM public.board_items
WHERE wall_post_id IS NOT NULL
GROUP BY wall_post_id
HAVING COUNT(*) > 1;

-- 4. Tarkista tehtävien ja pääkohteiden organisaatiotunnusten vastaavuus (NULL-turvallinen)
-- Tavoite: 0 riviä.
SELECT 
    t.id AS task_id,
    t.name AS task_name,
    t.organization_id AS task_org,
    i.id AS item_id,
    i.title AS item_title,
    i.organization_id AS item_org
FROM public.board_tasks t
JOIN public.board_items i ON i.id = t.item_id
WHERE t.organization_id IS DISTINCT FROM i.organization_id;

-- 5. Tarkista ilmoittautumisten, tehtävien ja pääkohteiden eheys (organization_id ja item_id)
-- Tavoite: 0 riviä.
SELECT 
    s.id AS signup_id,
    s.participant_name,
    s.organization_id AS signup_org,
    t.organization_id AS task_org,
    i.organization_id AS item_org,
    s.item_id AS signup_item_id,
    t.item_id AS task_item_id,
    i.id AS item_id
FROM public.board_task_signups s
JOIN public.board_tasks t ON t.id = s.task_id
JOIN public.board_items i ON i.id = s.item_id
WHERE s.organization_id IS DISTINCT FROM t.organization_id
   OR s.organization_id IS DISTINCT FROM i.organization_id
   OR s.item_id IS DISTINCT FROM t.item_id;

-- 6. Tarkista viitattujen Seinä-postausten tila, organisaatio ja kohdemerkinnät
SELECT 
    i.id AS item_id,
    i.title AS item_title,
    i.organization_id AS item_org_id,
    i.is_published_to_wall,
    i.wall_post_id,
    p.id AS actual_post_id,
    p.organization_id AS post_org_id,
    CASE 
        WHEN p.id IS NULL THEN 'PUUTTUU (Rikkoutunut linkki, vaatii p_force_relink)'
        WHEN p.organization_id IS DISTINCT FROM i.organization_id THEN 'RISTIRIITA (Vieras organisaatio! Toiminto estetty)'
        WHEN p.target_id IS NOT NULL AND p.target_id <> i.id::text THEN 'RISTIRIITA (Eri kohde! Toiminto estetty)'
        WHEN p.target_type IS NOT NULL AND p.target_type <> 'board_item' THEN 'RISTIRIITA (target_type ei ole board_item! Toiminto estetty)'
        WHEN p.target_id IS NULL OR p.target_type IS NULL THEN 'HUOMIO (target_id tai target_type on tyhjä, vaatii p_force_relink)'
        WHEN p.status IS DISTINCT FROM 'published' OR p.visibility IS DISTINCT FROM 'public' THEN 'HUOMIO (piilotettu/luonnos, vaatii p_force_relink)'
        ELSE 'OK (Normaali linkitys)'
    END AS consistency_status,
    p.status AS post_status,
    p.visibility AS post_visibility
FROM public.board_items i
LEFT JOIN public.posts p ON p.id = i.wall_post_id
WHERE i.wall_post_id IS NOT NULL OR i.is_published_to_wall = TRUE;

-- 7. Inventoi kaikki olemassa olevat RPC-funktioiden allekirjoitukset, argumenttimäärät ja palautustyypit
-- Vertaa tätä ennen migraatiota ja migraation jälkeen.
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    p.pronargs AS argument_count,
    p.pronargdefaults AS defaults_count,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_arguments(p.oid) AS arguments_with_defaults,
    pg_catalog.pg_get_function_result(p.oid) AS return_type
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'signup_board_task',
      'cancel_board_task_signup',
      'post_board_comment',
      'publish_board_item_to_wall'
  )
ORDER BY p.proname, p.pronargs;

-- 8. Tarkista olemassa olevat indeksit ja rajoitteet
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('board_task_signups', 'board_items')
ORDER BY tablename, indexname;

-- 9. Tarkista pgcrypto-laajennuksen funktioiden saatavuus
SELECT 
    extensions.digest('test', 'sha256') AS digest_test,
    extensions.gen_random_bytes(16) AS random_bytes_test;
