-- ============================================================
-- Laukaan Kohtaamispaikka – Anonyymi viestijärjestelmä
-- Aja tämä Supabasen SQL Editorissa.
-- Vaatii: encounters-taulu on jo olemassa.
-- ============================================================

-- ============================================================
-- CONVERSATIONS: Yksi per yhteydenotto
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    encounter_id     UUID REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
    initiator_token  UUID DEFAULT gen_random_uuid() NOT NULL,  -- Lähettäjän linkki sähköpostissa
    owner_token      UUID DEFAULT gen_random_uuid() NOT NULL,  -- Ilmoittajan linkki sähköpostissa
    initiator_email  TEXT NOT NULL,   -- Ei koskaan palauteta selaimelle!
    initiator_name   TEXT NOT NULL,
    status           VARCHAR DEFAULT 'open',  -- open | closed
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at       TIMESTAMPTZ DEFAULT (now() + interval '30 days') NOT NULL
);

-- ============================================================
-- MESSAGES: Yksittäiset viestit ketjussa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id  UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    sender_role      VARCHAR NOT NULL CHECK (sender_role IN ('initiator', 'owner')),
    sender_name      TEXT NOT NULL,
    body             TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- INDEKSIT – nopeuttaa hakuja
-- ============================================================
CREATE INDEX IF NOT EXISTS conv_encounter_idx        ON public.conversations(encounter_id);
CREATE INDEX IF NOT EXISTS conv_initiator_token_idx  ON public.conversations(initiator_token);
CREATE INDEX IF NOT EXISTS conv_owner_token_idx      ON public.conversations(owner_token);
CREATE INDEX IF NOT EXISTS conv_expires_idx          ON public.conversations(expires_at);
CREATE INDEX IF NOT EXISTS msg_conversation_idx      ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS msg_created_idx           ON public.messages(conversation_id, created_at);

-- ============================================================
-- RLS – kaikki pääsy PHP-backendin kautta (service role key)
-- Anon-käyttäjillä ei suoraa pääsyä tauluihin
-- ============================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_conversations" ON public.conversations;
CREATE POLICY "deny_anon_conversations" ON public.conversations
    FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_anon_messages" ON public.messages;
CREATE POLICY "deny_anon_messages" ON public.messages
    FOR ALL TO anon USING (false) WITH CHECK (false);

-- ============================================================
-- SIIVOUS: Poistaa vanhentuneet keskustelut (aja manuaalisesti
-- tai lisää Supabase Scheduled Functions → SQL-editorissa)
-- ============================================================
-- DELETE FROM public.conversations WHERE expires_at < now();
-- (messages poistuvat automaattisesti ON DELETE CASCADE)
