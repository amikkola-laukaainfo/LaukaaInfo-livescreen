-- Supabase Schema for LaukaaInfo (Android-sovellukseen pohjautuva)

-- 1. Yhdistystaulu käyttäjän (auth) ja yrityksen ID:n (CSV) välille.
-- Admin (sinä) lisäät tänne rivin käsin Supabasen paneelista, kun haluat antaa yrittäjälle oikeudet.
CREATE TABLE public.company_owners (
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    business_id TEXT NOT NULL, -- Täsmää CSV-tiedoston ID:hen (esim. "123")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (owner_id, business_id)
);

-- 2. Create the posts table (korvaa content.json:n)
CREATE TABLE public.posts (
    id TEXT PRIMARY KEY,
    business_id TEXT, -- Mahdollistetaan myös yhteisön julkaisut (ei pakollinen)
    author_id UUID REFERENCES auth.users(id), -- Yhteisöjulkaisujen tekijä
    place_id TEXT, -- Paikkalinkitys (esim. kohdekortti tai reitti)
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    website_url TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    youtube_url TEXT,
    video_id TEXT,
    is_shorts BOOLEAN DEFAULT FALSE,
    publish_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_promoted BOOLEAN DEFAULT FALSE,
    publisher_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    show_contact BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED, HIDDEN
    tags TEXT[] DEFAULT '{}' -- Esim. 'lapsiperheet', 'liikunta'
);

-- 3. Create the offers table (korvaa lisaa-tarjous.php:n)
CREATE TABLE public.offers (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    name TEXT NOT NULL,
    short_description TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    address TEXT,
    postal_code TEXT,
    municipality TEXT,
    venue TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    website TEXT,
    ticket_url TEXT,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    discount_type TEXT DEFAULT 'percentage',
    discount_value NUMERIC DEFAULT 0,
    coupon_code TEXT,
    taxonomy TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    profiles TEXT[] DEFAULT '{}',
    organizer TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.company_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Kukaan julkinen käyttäjä ei näe kuka omistaa minkäkin yrityksen, vain omistaja itse näkee omat linkityksensä
CREATE POLICY "Owners can see their own mappings" ON public.company_owners
    FOR SELECT USING (auth.uid() = owner_id);

-- Kaikki saavat lukea hyväksyttyjä julkaisuja (tai niitä, joilla ei ole statusta vanhastaan)
CREATE POLICY "Public can read posts" ON public.posts
    FOR SELECT USING (status = 'APPROVED' OR status IS NULL);
CREATE POLICY "Public can read offers" ON public.offers
    FOR SELECT USING (true);

-- Vain omistajat voivat luoda OMIA julkaisujaan, TAI tavalliset käyttäjät omia yhteisöjulkaisujaan
CREATE POLICY "Owners and authors can insert posts" ON public.posts
    FOR INSERT WITH CHECK (
        (business_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.posts.business_id))
        OR 
        (author_id = auth.uid())
    );
CREATE POLICY "Owners and authors can update posts" ON public.posts
    FOR UPDATE USING (
        (business_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.posts.business_id))
        OR 
        (author_id = auth.uid())
    );
CREATE POLICY "Owners and authors can delete posts" ON public.posts
    FOR DELETE USING (
        (business_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.posts.business_id))
        OR 
        (author_id = auth.uid())
    );

-- Vain omistajat voivat luoda, muokata ja poistaa OMIA tarjouksiaan
CREATE POLICY "Owners can insert offers" ON public.offers
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.offers.business_id)
    );
CREATE POLICY "Owners can update offers" ON public.offers
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.offers.business_id)
    );
CREATE POLICY "Owners can delete offers" ON public.offers
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.company_owners WHERE owner_id = auth.uid() AND business_id = public.offers.business_id)
    );

-- 6. Storage Bucket setup (Kuvia varten)
INSERT INTO storage.buckets (id, name, public) VALUES ('content-images', 'content-images', true)
ON CONFLICT (id) DO NOTHING;

-- Kuvat ovat julkisia
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'content-images' );

-- Vain kirjautuneet voivat ladata kuvia
CREATE POLICY "Auth Users Upload" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'content-images' AND auth.role() = 'authenticated'
);
CREATE POLICY "Auth Users Update" ON storage.objects FOR UPDATE USING (
    bucket_id = 'content-images' AND auth.role() = 'authenticated'
);
CREATE POLICY "Auth Users Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'content-images' AND auth.role() = 'authenticated'
);
