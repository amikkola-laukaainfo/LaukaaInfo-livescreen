-- --------------------------------------------------------
-- Kuvat ja galleriat (Images for Places)
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS place_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES places(place_id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,          -- Esim. 'place-images/{place_id}/{filename}.webp'
    caption TEXT,                        -- Kuvateksti
    alt_text TEXT,                       -- Alt-teksti saavutettavuuteen
    source TEXT,                         -- Esim. 'profiling_app', 'user_submission'
    image_type TEXT DEFAULT 'gallery',   -- 'hero', 'gallery' jne.
    sort_order INTEGER DEFAULT 0,        -- Järjestys, pienempi numero ensin
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_place_images_place_id ON place_images(place_id);
CREATE INDEX IF NOT EXISTS idx_place_images_image_type ON place_images(image_type);
CREATE INDEX IF NOT EXISTS idx_place_images_sort_order ON place_images(sort_order);

-- RLS
ALTER TABLE place_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salli luku kaikille" 
ON place_images FOR SELECT 
USING (true);

-- TODO: Lisää insert/update säännöt, kun admin/auth on määritetty tarkemmin
-- CREATE POLICY "images_insert_admin" ON place_images FOR INSERT WITH CHECK (...);
