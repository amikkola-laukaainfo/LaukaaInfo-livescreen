-- 040_add_seo_indexed_flags.sql
-- Adds SEO publishing controls and optional metadata override fields to places and tags (themes) tables.

-- 1. Places table SEO columns
ALTER TABLE public.places
ADD COLUMN IF NOT EXISTS seo_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS seo_slug TEXT,
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Index on seo_indexed for fast queries
CREATE INDEX IF NOT EXISTS idx_places_seo_indexed ON public.places(seo_indexed) WHERE seo_indexed = true;
CREATE INDEX IF NOT EXISTS idx_places_seo_slug ON public.places(seo_slug);

-- 2. Tags table (Themes) SEO columns
ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS seo_indexed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS seo_slug TEXT,
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE INDEX IF NOT EXISTS idx_tags_seo_indexed ON public.tags(seo_indexed) WHERE seo_indexed = true;
CREATE INDEX IF NOT EXISTS idx_tags_seo_slug ON public.tags(seo_slug);
