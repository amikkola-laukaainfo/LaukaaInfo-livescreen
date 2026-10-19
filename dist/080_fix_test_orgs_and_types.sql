-- =============================================================================
-- 080_fix_test_orgs_and_types.sql
-- LaukaaInfo – Korjausskripti organisaatioiden tyypeille ja nimille
-- =============================================================================
-- Korjaa kannassa olevat organisaatiot:
-- 1. 'laukaan-testaajat' -> type = 'association', name = 'Laukaan Testaajat ry'
-- 2. 'laukaan-yrittajat' -> type = 'association', name = 'Laukaan Yrittäjät ry'
-- 3. Molemmille board_enabled = TRUE, accept_public_suggestions = TRUE, is_active = TRUE
-- =============================================================================

BEGIN;

-- 1. Varmistetaan / korjataan Laukaan Testaajat ry
INSERT INTO public.organizations (id, name, type, wall_visibility, default_post_visibility, board_enabled, accept_public_suggestions, is_active)
VALUES ('laukaan-testaajat', 'Laukaan Testaajat ry', 'association', 'public', 'public', TRUE, TRUE, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = 'Laukaan Testaajat ry',
    type = 'association',
    board_enabled = TRUE,
    accept_public_suggestions = TRUE,
    is_active = TRUE;

-- 2. Korjataan Laukaan Yrittäjät ry omalle nimelleen
UPDATE public.organizations
SET name = 'Laukaan Yrittäjät ry',
    type = 'association',
    board_enabled = TRUE,
    accept_public_suggestions = TRUE,
    is_active = TRUE
WHERE id = 'laukaan-yrittajat';

COMMIT;
