-- kohtaamiset_stats.sql
-- Vaihe 4: Tilastotaulu ja RPC-funktiot anonyymia datankeruuta varten

CREATE TABLE IF NOT EXISTS public.encounter_stats (
    encounter_id UUID PRIMARY KEY REFERENCES public.encounters(id) ON DELETE CASCADE,
    views INT DEFAULT 0,
    clicks INT DEFAULT 0,
    social_shares INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Otetaan RLS käyttöön
ALTER TABLE public.encounter_stats ENABLE ROW LEVEL SECURITY;

-- Omien ilmoitusten tilastojen luku
CREATE POLICY "Salli omistajan lukea tilastot"
    ON public.encounter_stats
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.encounters e
            WHERE e.id = encounter_stats.encounter_id
              AND e.user_id = auth.uid()
        )
    );

-- Ylläpitäjien tilastojen luku
CREATE POLICY "Salli ylläpidon lukea tilastot"
    ON public.encounter_stats
    FOR SELECT
    USING (
        public.check_permission('announcement.manage')
    );

-- RPC-funktio tilastojen kasvattamiseen anonyymisti ja turvallisesti
CREATE OR REPLACE FUNCTION public.increment_stat(p_encounter_id UUID, p_stat_type VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validoidaan sallitut tyypit
    IF p_stat_type NOT IN ('view', 'click', 'share') THEN
        RETURN;
    END IF;

    -- Upsert
    INSERT INTO public.encounter_stats (encounter_id, views, clicks, social_shares)
    VALUES (
        p_encounter_id,
        CASE WHEN p_stat_type = 'view' THEN 1 ELSE 0 END,
        CASE WHEN p_stat_type = 'click' THEN 1 ELSE 0 END,
        CASE WHEN p_stat_type = 'share' THEN 1 ELSE 0 END
    )
    ON CONFLICT (encounter_id) DO UPDATE SET
        views = encounter_stats.views + CASE WHEN p_stat_type = 'view' THEN 1 ELSE 0 END,
        clicks = encounter_stats.clicks + CASE WHEN p_stat_type = 'click' THEN 1 ELSE 0 END,
        social_shares = encounter_stats.social_shares + CASE WHEN p_stat_type = 'share' THEN 1 ELSE 0 END,
        last_updated = NOW();
END;
$$;
