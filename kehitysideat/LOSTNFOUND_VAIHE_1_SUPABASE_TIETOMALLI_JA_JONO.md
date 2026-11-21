# Vaihe 1: Supabase-tietomalli ja jatkuvan matchauksen arkkitehtuuri
*Viimeistelty ja tuotantoturvallistettu arkkitehtuurispesifikaatio — LostReFound — 20.11.2026*

---

## 1. Yleiskatsaus ja arkkitehtuurilinjaukset

1. **Puhdas jako (Malli B):**
   - **Firestore:** Nykyinen LOST & FOUND -toiminto ja sen `getPotentialMatches()` säilyvät 100 % ennallaan omassa tietokannassaan ja logiikassaan.
   - **Supabase:** Uusi kiertotalousresurssien kohtaamisjärjestelmä (`circular_items`), jatkuva jonopohjainen matching, tarkat attribuutit, PostGIS-spatiaalihaut ja mikrovarastokytkennät.
2. **Kaksi erillistä laatupistettä (Ei sekoiteta keskenään):**
   - **`match_confidence` (0.0–1.0):** Kuinka hyvin tarjottu resurssi vastaa hakijan tarvetta (materiaali, mitat, laatu, esim. kakkosnelonen $\leftrightarrow$ runkopuu).
   - **`fulfillment_score` (0.0–1.0):** Kuinka helposti kohtaaminen voidaan käytännössä toteuttaa (etäisyys, aikaikkuna, suoranouto vs. mikrovarasto).
   - **`total_score` (0.0–1.0):** Painotettu kokonaispiste.
   - **`scoring_version`:** Algoritmin versio (esim. 1), jotta matchit voidaan arvioida uudelleen algoritmin kehittyessä.
3. **Selkeä vastuiden erottelu:**
   - **Tietokantatriggerit:** Vain kevyet, synkroniset toimet (jonotus, aikaleimat, tilamuutoslokitus, viite-eheyden varmistus).
   - **RPC-tietokantafunktiot:** Atomiset lukitukset, jonon poiminta (`SKIP LOCKED`), fencing token -valvonta (`claim_token`) ja orpojen tehtävien palautus.
   - **Edge Functionit (Gateway):** Firebase ID Tokenin aitoustarkistus, omistajuusvaltuutus, julkisen datan tarjoilu ja matchauslaskennan orkestrointi.
   - **Ajastetut tehtävät (Cron):** Aikarajan ylittäneiden ilmoitusten vanhentaminen ja orpojen jonotehtävien vapautus.

---

## 2. Kuusi kriittistä teknistä arkkitehtuuritarkennusta

### 2.1. Firebase UID ja RLS: Gateway-arkkitehtuuri
PostgreSQL:n sisäinen `auth.uid()` palauttaa Supabase GoTrue -tunnisteen, ei Firebase UID:tä. Koska LostReFound käyttää mobiilissa Firebase Authia:
- **Ei käytetä `auth.uid()` -tarkistusta Firebase-omistajuudelle.**
- **Edge Function toimii turvallisena porttina (Gateway Pattern):**
  - Kaikki käyttäjän omat toiminnot (ilmoituksen luonti, muokkaus, poisto, matchien hyväksyntä ja omien tietojen haku) kutsutaan Edge Functionin kautta (`submit-circular-item`, `respond-to-match`, `get-my-circular-data`).
  - Edge Function vastaanottaa otsikon `Authorization: Bearer <firebase_id_token>` ja tarkistaa tokenin allekirjoituksen Googlen julkisilla x509-avaimilla (`iss`, `aud`, `exp`, `sub`).
  - Edge Function varmistaa omistajuuden kooditasolla (`token.sub == item.firebase_uid`) ja suorittaa tietokantaoperaatiot palvelinroolilla (`service_role`).
  - Asiakassovellukselle ei koskaan jaeta `service_role`-avainta, vaan ainoastaan julkinen `anon`-avain.
- **Perustaulun RLS:** Suora luku ja kirjoitus `circular_items`- ja muille perustauluille `anon`- ja `authenticated`-avaimilla on **kokonaan evätty (`REVOKE ALL`)**.

---

### 2.2. SECURITY DEFINER -funktioiden turvallisuus
Kaikissa `SECURITY DEFINER` -funktioissa (`fn_pop_matching_queue_batch`, `fn_complete_matching_queue_task`, `fn_fail_matching_queue_task`, `fn_recover_stale_queue_tasks`, `fn_pop_notifications_queue_batch`, `fn_complete_notification`, `fn_fail_notification`, `fn_recover_stale_notification_tasks`, `fn_cleanup_expired_circular_items`):
- On asetettu eksplisiittinen hakupolku: `SET search_path = pg_catalog, public` estämään polun kaappaukset.
- Suoritusoikeudet on nimenomaisesti poistettu julkisilta rooleilta: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;`.
- Suoritusoikeudet on myönnetty vain luotetulle taustaroolille: `GRANT EXECUTE ON FUNCTION ... TO service_role;`.

---

### 2.3. Julkinen näkymä ja sijainnin yksityisyyssuoja (Spatial Obscuration)
Avoimessa julkisessa näkymässä ei saa paljastaa käyttäjän tarkkaa kotiosoitetta tai suoria yhteystietoja ennen sovittua kohtaamista.

**Ratkaisu: `circular_items_public` -näkymä:**
- Näkymästä on jätetty kokonaan pois `firebase_uid`, `user_id` ja `contact_info`.
- Koordinaatit pyöristetään karkealle tasolle (`round(latitude::numeric, 2)`, `round(longitude::numeric, 2)` $\approx$ 1,1 km tarkkuus) tai esitetään LaukaaInfon `place_name_snapshot` -alueena.
- **Tarkka noutopaikka ja yhteystiedot:**
  - Luovutetaan vain todennetuille matchin osapuolille Edge Functionin kautta vasta, kun match saavuttaa tilan `ACCEPTED` tai `RESERVED`.
  - `contact_info` säilytetään selkotekstinä suojatussa `circular_items`-taulussa ja suojataan Gateway-tasolla.

---

### 2.4. Matchien ja varausten elinkaari: ACCEPTED- ja RESERVED-tilojen suojaus
Kun ilmoituksen tila muuttuu, triggeri `trg_fn_cancel_matches_on_item_close` erottelee tilanteet:
1. **Onnistunut toteutuminen (`FULFILLED`):**
   - Kohteen `ACCEPTED`- ja `RESERVED`-matchit muuttuvat tilaan `FULFILLED` (onnistunut kiertotaloussiirto).
   - Muut kilpailevat avoimet ehdotukset (`POTENTIAL`, `NOTIFIED`) perutaan (`CANCELLED`), **eikä peruutusvirhehälytyksiä lähetetä**.
2. **Käyttäjän tekemä manuaalinen poisto (`DELETED`):**
   - Jos kohteella oli aktiivinen `RESERVED`-varaus tai molempien hyväksymä kohtaaminen (`ACCEPTED`), match perutaan (`CANCELLED`) ja toiselle osapuolelle luodaan hälytys outbox-jonoon (`RESERVATION_CANCELLED`).
   - Avoimet ehdotukset perutaan (`CANCELLED`).
3. **Määräajan umpeutuminen (`EXPIRED`):**
   - Avoimet ehdotukset merkitään `EXPIRED`.
   - Kohdetta, jolla on aktiivinen `ACCEPTED`- tai `RESERVED`-match, **ei vanhenneta automaattisesti** cron-ajossa (`fn_cleanup_expired_circular_items`).
   - Jos `ACCEPTED`- tai `RESERVED`-match myöhemmin purkautuu (`CANCELLED`/`REJECTED`), triggeri `trg_fn_on_match_unreserved` tarkistaa `deadline_at`-ajan uudelleen ja vanhentaa ilmoituksen tarvittaessa.

---

### 2.5. Kilpatilanteiden täydellinen esto: Fencing Token (`claim_token uuid`)
Pelkkä `status = 'PROCESSING'` ei riitä, jos hidas worker palaa kuittaamaan tehtävää sen jälkeen, kun tehtävä on aikakatkaisun vuoksi palautettu jonoon ja toinen worker on poiminut sen.

**Ratkaisu: Käsittelylukituksen fencing token (`claim_token uuid`):**
1. Jokaisessa poiminnassa (`fn_pop_*_batch`) generoidaan uusi `claim_token = gen_random_uuid()`.
2. Token palautetaan workerille poimintakyselyn yhteydessä.
3. Kuittausfunktiot (`fn_complete_*` ja `fn_fail_*`) vaativat `claim_token`-parametrin:
   ```sql
   WHERE id = p_id AND status = 'PROCESSING' AND claim_token = p_claim_token;
   ```
   Funktiot palauttavat `boolean`-arvon (`true` = kuittaus hyväksytty, `false` = lukitus menetetty/vanhentunut).
4. Aikakatkaisun palautusfunktio (`fn_recover_stale_*`) asettaa `claim_token = NULL`, mikä mitätöi vanhan workerin oikeuden kuitata tehtävää.
5. Tämä mekanismi on toteutettu symmetrisesti **sekä notifikaatiojonolle että matchausjonolle**.

---

### 2.6. Audit-historia ja eheyden suojaus
- `circular_match_events`-taulussa ulkoinen avain `match_id` on määritelty `ON DELETE RESTRICT` (ei CASCADE), jotta virhelokit ja tilasiirtymät eivät tuhoudu hiljaisesti.
- Triggeri `trg_fn_log_match_status_change` lukee istuntomuuttujan `current_setting('app.current_user_uid', true)` (jonka Edge Function asettaa `SET LOCAL app.current_user_uid = ...`), ja käyttää `'system'`-arvoa ainoastaan fallbackina silloin, kun toimijaa ei ole asetettu.
- Attribuuttitaulussa `circular_item_attributes` triggeri `trg_fn_enqueue_attribute_change` estää `item_id`:n vaihtamisen (`UPDATE`), mikä estää orpojen attribuuttien ja virheellisten jonotapahtumien syntymisen.
- LaukaaInfon `place_id` on toiseen projektiin kohdistuva looginen viitetunniste (`text`), eikä riipu tietokantatason FOREIGN KEY -rajoitteesta. Koordinaatit tallennetaan PostGIS geography -kenttään.

---

## 3. Täydellinen tuotantoturvallistettu SQL-skeema

```sql
-- Ota käyttöön PostGIS-laajennos spatiaalihakuja varten
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. Kiertotalousilmoitukset (circular_items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type           text NOT NULL CHECK (item_type IN ('OFFER', 'WANTED')),
    title               text NOT NULL CHECK (length(trim(title)) >= 3),
    description         text,
    status              text NOT NULL DEFAULT 'ACTIVE' 
                        CHECK (status IN ('ACTIVE', 'RESERVED', 'FULFILLED', 'EXPIRED', 'DELETED')),
    
    -- Sijainti ja LaukaaInfo-kytkentä
    place_id            text, -- LaukaaInfon place_id loogisena viitteenä (esim. UUID tai tunniste)
    place_name_snapshot text, -- Paikan nimi ilmoitushetkellä (esim. 'Lievestuoreen kierrätyspiste')
    latitude            double precision NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude           double precision NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    radius_meters       double precision NOT NULL DEFAULT 5000.0 CHECK (radius_meters > 0),
    
    -- PostGIS geography -sarake (automaattisesti generoitu ja päivittyvä)
    location            geography(Point, 4326) GENERATED ALWAYS AS (
                            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                        ) STORED,
    
    -- Aika, hinta ja toimitusehdot
    deadline_at         timestamptz, -- OFFER: eroonpääsy; WANTED: tarveaika
    price_eur           numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (price_eur >= 0.00),
    condition           text CHECK (condition IN ('NEW', 'GOOD', 'FAIR', 'FOR_PARTS')),
    preferred_pickup    text NOT NULL DEFAULT 'EITHER' 
                        CHECK (preferred_pickup IN ('DIRECT_ONLY', 'STORAGE_OK', 'EITHER')),
    
    -- Todennetut käyttäjätunnisteet (Edge Functionin varmentamat)
    firebase_uid        text NOT NULL,
    user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Valinnainen Supabase Auth UUID
    contact_info        text, -- Puhelinnumero, sähköposti tms. (suojattu Gateway-tasolla)
    
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_circular_items_active ON public.circular_items(item_type, status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_circular_items_location ON public.circular_items USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_circular_items_place ON public.circular_items(place_id);
CREATE INDEX IF NOT EXISTS idx_circular_items_deadline ON public.circular_items(deadline_at);
CREATE INDEX IF NOT EXISTS idx_circular_items_fb_user ON public.circular_items(firebase_uid);

-- ============================================================================
-- 2. Tavaroiden ja materiaalien attribuutit (circular_item_attributes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_item_attributes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id             uuid NOT NULL REFERENCES public.circular_items(id) ON DELETE CASCADE,
    attribute_key       text NOT NULL CHECK (length(trim(attribute_key)) > 0),
    value_text          text,
    value_number        numeric,
    unit                text, -- esim. 'mm', 'm', 'kpl', 'kg'
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_attribute_has_value CHECK (value_text IS NOT NULL OR value_number IS NOT NULL),
    CONSTRAINT uq_item_attribute_key UNIQUE (item_id, attribute_key)
);

CREATE INDEX IF NOT EXISTS idx_circular_attributes_item ON public.circular_item_attributes(item_id);
CREATE INDEX IF NOT EXISTS idx_circular_attributes_key ON public.circular_item_attributes(attribute_key);

-- ============================================================================
-- 3. Matchauksen asynkroninen käsittelyjono (circular_matching_queue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_matching_queue (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id             uuid NOT NULL REFERENCES public.circular_items(id) ON DELETE CASCADE,
    event_type          text NOT NULL CHECK (event_type IN ('INSERT', 'UPDATE', 'ATTRIBUTE_CHANGE', 'DEADLINE_CHANGE')),
    status              text NOT NULL DEFAULT 'PENDING' 
                        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts            int NOT NULL DEFAULT 0,
    max_attempts        int NOT NULL DEFAULT 5,
    available_at        timestamptz NOT NULL DEFAULT now(),
    locked_at           timestamptz,
    claim_token         uuid, -- Fencing token
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    processed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_circular_queue_poll ON public.circular_matching_queue(status, available_at) 
WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_circular_queue_token ON public.circular_matching_queue(claim_token) 
WHERE claim_token IS NOT NULL;

-- ============================================================================
-- 4. Löydetyt kohtaamiset (circular_matches)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_matches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_item_id       uuid NOT NULL REFERENCES public.circular_items(id) ON DELETE RESTRICT,
    wanted_item_id      uuid NOT NULL REFERENCES public.circular_items(id) ON DELETE RESTRICT,
    
    -- Erotellut laatupisteet (0.00 - 1.00)
    match_confidence    float NOT NULL CHECK (match_confidence BETWEEN 0.0 AND 1.0),
    fulfillment_score   float NOT NULL CHECK (fulfillment_score BETWEEN 0.0 AND 1.0),
    total_score         float NOT NULL CHECK (total_score BETWEEN 0.0 AND 1.0),
    scoring_version     int NOT NULL DEFAULT 1,
    last_evaluated_at   timestamptz NOT NULL DEFAULT now(),
    
    -- Elinkaaritila
    status              text NOT NULL DEFAULT 'POTENTIAL' 
                        CHECK (status IN ('POTENTIAL', 'NOTIFIED', 'ACCEPTED', 'RESERVED', 'FULFILLED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
    
    -- Kaksipuolinen hyväksyntä
    offer_accepted_at   timestamptz,
    wanted_accepted_at  timestamptz,
    
    -- Toimitustapa ja mikrovarastointi
    pickup_mode         text CHECK (pickup_mode IN ('DIRECT', 'STORAGE')),
    storage_location_id text,
    storage_place_id    text,
    pickup_code_hash    text,
    
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT unique_offer_wanted_pair UNIQUE (offer_item_id, wanted_item_id),
    CONSTRAINT chk_distinct_items CHECK (offer_item_id <> wanted_item_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_offer ON public.circular_matches(offer_item_id);
CREATE INDEX IF NOT EXISTS idx_matches_wanted ON public.circular_matches(wanted_item_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.circular_matches(status);

-- ============================================================================
-- 5. Matchien audit- ja tapahtumaloki (circular_match_events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_match_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id            uuid NOT NULL REFERENCES public.circular_matches(id) ON DELETE RESTRICT,
    from_status         text,
    to_status           text NOT NULL,
    actor_uid           text NOT NULL,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match ON public.circular_match_events(match_id);

-- ============================================================================
-- 6. Push-notifikaatioiden outbox-jono (circular_notifications_queue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.circular_notifications_queue (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_uid       text NOT NULL,
    notification_type   text NOT NULL 
                        CHECK (notification_type IN ('MATCH_FOUND', 'MATCH_ACCEPTED', 'MATCH_REJECTED', 'RESERVATION_CANCELLED', 'DEADLINE_WARNING')),
    title               text NOT NULL,
    body                text NOT NULL,
    payload             jsonb DEFAULT '{}'::jsonb,
    status              text NOT NULL DEFAULT 'PENDING' 
                        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
    attempts            int NOT NULL DEFAULT 0,
    max_attempts        int NOT NULL DEFAULT 3,
    available_at        timestamptz NOT NULL DEFAULT now(),
    locked_at           timestamptz,
    claim_token         uuid, -- Fencing token
    sent_at             timestamptz,
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circular_notifs_poll ON public.circular_notifications_queue(status, available_at) 
WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_circular_notifs_token ON public.circular_notifications_queue(claim_token) 
WHERE claim_token IS NOT NULL;
```

---

## 4. Triggerit ja eheyden varmistus

```sql
-- 1. updated_at -aikaleimat
CREATE OR REPLACE FUNCTION public.trg_fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_items_updated_at ON public.circular_items;
CREATE TRIGGER trg_circular_items_updated_at
BEFORE UPDATE ON public.circular_items
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_set_updated_at();

-- 2. Jonotustriggeri ilmoituksille
CREATE OR REPLACE FUNCTION public.trg_fn_enqueue_circular_item()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.circular_matching_queue (item_id, event_type, available_at)
    VALUES (
        NEW.id,
        CASE WHEN TG_OP = 'INSERT' THEN 'INSERT' ELSE 'UPDATE' END,
        now()
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_item_enqueue ON public.circular_items;
CREATE TRIGGER trg_circular_item_enqueue
AFTER INSERT OR UPDATE OF title, description, latitude, longitude, radius_meters, deadline_at, condition, preferred_pickup
ON public.circular_items
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enqueue_circular_item();

-- 3. Attribuuttien jonotustriggeri ja item_id:n eheyden suojaus
CREATE OR REPLACE FUNCTION public.trg_fn_enqueue_attribute_change()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.item_id <> NEW.item_id THEN
        RAISE EXCEPTION 'Changing item_id of an attribute is not allowed';
    END IF;

    INSERT INTO public.circular_matching_queue (item_id, event_type, available_at)
    VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END,
        'ATTRIBUTE_CHANGE',
        now()
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_attributes_enqueue ON public.circular_item_attributes;
CREATE TRIGGER trg_circular_attributes_enqueue
AFTER INSERT OR UPDATE OR DELETE ON public.circular_item_attributes
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enqueue_attribute_change();

-- 4. Match-eheyden ja itsematchauksen esto
CREATE OR REPLACE FUNCTION public.trg_fn_validate_match_integrity()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
    v_offer_type text;
    v_offer_uid  text;
    v_wanted_type text;
    v_wanted_uid text;
BEGIN
    SELECT item_type, firebase_uid INTO v_offer_type, v_offer_uid
    FROM public.circular_items WHERE id = NEW.offer_item_id;

    SELECT item_type, firebase_uid INTO v_wanted_type, v_wanted_uid
    FROM public.circular_items WHERE id = NEW.wanted_item_id;

    IF v_offer_type <> 'OFFER' OR v_wanted_type <> 'WANTED' THEN
        RAISE EXCEPTION 'Match integrity violation: offer_item_id must be OFFER and wanted_item_id must be WANTED';
    END IF;

    IF v_offer_uid = v_wanted_uid THEN
        RAISE EXCEPTION 'Self-matching violation: offer and wanted items cannot belong to the same user';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_match_validate ON public.circular_matches;
CREATE TRIGGER trg_circular_match_validate
BEFORE INSERT OR UPDATE OF offer_item_id, wanted_item_id ON public.circular_matches
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_match_integrity();

-- 5. Ilmoituksen sulkeutuminen: FULFILLED vs DELETED vs EXPIRED (ml. ACCEPTED)
CREATE OR REPLACE FUNCTION public.trg_fn_cancel_matches_on_item_close()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
    rec RECORD;
BEGIN
    IF OLD.status <> NEW.status THEN
        -- Tapaus 1: Ilmoitus toteutunut onnistuneesti (FULFILLED)
        IF NEW.status = 'FULFILLED' THEN
            UPDATE public.circular_matches
            SET status = 'FULFILLED', updated_at = now()
            WHERE (offer_item_id = NEW.id OR wanted_item_id = NEW.id)
              AND status IN ('ACCEPTED', 'RESERVED');

            UPDATE public.circular_matches
            SET status = 'CANCELLED', updated_at = now()
            WHERE (offer_item_id = NEW.id OR wanted_item_id = NEW.id)
              AND status IN ('POTENTIAL', 'NOTIFIED');

        -- Tapaus 2: Ilmoitus poistettu manuaalisesti (DELETED)
        ELSIF NEW.status = 'DELETED' THEN
            UPDATE public.circular_matches
            SET status = 'CANCELLED', updated_at = now()
            WHERE (offer_item_id = NEW.id OR wanted_item_id = NEW.id)
              AND status IN ('POTENTIAL', 'NOTIFIED');

            FOR rec IN 
                SELECT m.id AS match_id, m.offer_item_id, m.wanted_item_id, m.status AS match_status,
                       o.firebase_uid AS offer_uid, w.firebase_uid AS wanted_uid
                FROM public.circular_matches m
                JOIN public.circular_items o ON m.offer_item_id = o.id
                JOIN public.circular_items w ON m.wanted_item_id = w.id
                WHERE (m.offer_item_id = NEW.id OR m.wanted_item_id = NEW.id)
                  AND m.status IN ('ACCEPTED', 'RESERVED')
            LOOP
                UPDATE public.circular_matches 
                SET status = 'CANCELLED', updated_at = now() 
                WHERE id = rec.match_id;

                DECLARE
                    target_uid text;
                    v_title text;
                    v_body text;
                BEGIN
                    target_uid := CASE WHEN NEW.id = rec.offer_item_id THEN rec.wanted_uid ELSE rec.offer_uid END;
                    v_title := CASE WHEN rec.match_status = 'RESERVED' THEN 'Varaus peruttu' ELSE 'Hyväksytty kohtaaminen peruttu' END;
                    v_body := 'Kohteen toinen osapuoli on poistanut ilmoituksensa, johon oli sovittu kohtaaminen.';
                    
                    INSERT INTO public.circular_notifications_queue (
                        recipient_uid, notification_type, title, body, payload
                    ) VALUES (
                        target_uid,
                        'RESERVATION_CANCELLED',
                        v_title,
                        v_body,
                        jsonb_build_object('match_id', rec.match_id, 'item_id', NEW.id, 'previous_status', rec.match_status)
                    );
                END;
            END LOOP;

        -- Tapaus 3: Ilmoitus vanhentunut määräajan perusteella (EXPIRED)
        ELSIF NEW.status = 'EXPIRED' THEN
            UPDATE public.circular_matches
            SET status = 'EXPIRED', updated_at = now()
            WHERE (offer_item_id = NEW.id OR wanted_item_id = NEW.id)
              AND status IN ('POTENTIAL', 'NOTIFIED', 'ACCEPTED');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_item_close ON public.circular_items;
CREATE TRIGGER trg_circular_item_close
AFTER UPDATE OF status ON public.circular_items
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cancel_matches_on_item_close();

-- 6. ACCEPTED- tai RESERVED-kohtaamisen purkautuminen ja ilmoituksen vanhenemisen uudelleenarviointi
CREATE OR REPLACE FUNCTION public.trg_fn_on_match_unreserved()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
    IF OLD.status IN ('ACCEPTED', 'RESERVED') AND NEW.status IN ('CANCELLED', 'REJECTED') THEN
        UPDATE public.circular_items
        SET status = 'EXPIRED', updated_at = now()
        WHERE id = NEW.offer_item_id
          AND status = 'ACTIVE'
          AND deadline_at IS NOT NULL
          AND deadline_at < now();

        UPDATE public.circular_items
        SET status = 'EXPIRED', updated_at = now()
        WHERE id = NEW.wanted_item_id
          AND status = 'ACTIVE'
          AND deadline_at IS NOT NULL
          AND deadline_at < now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_circular_match_unreserved ON public.circular_matches;
CREATE TRIGGER trg_circular_match_unreserved
AFTER UPDATE OF status ON public.circular_matches
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_on_match_unreserved();
```

---

## 5. Atomiset RPC-funktiot ja Fencing Token -valvonta

```sql
-- 5.1. Matchausjonon poiminta (claim_token uuid)
CREATE OR REPLACE FUNCTION public.fn_pop_matching_queue_batch(p_batch_size int DEFAULT 10)
RETURNS TABLE (
    queue_id bigint,
    item_id uuid,
    event_type text,
    claim_token uuid
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
    RETURN QUERY
    WITH next_batch AS (
        SELECT id, gen_random_uuid() AS new_token
        FROM public.circular_matching_queue
        WHERE status = 'PENDING'
          AND available_at <= now()
        ORDER BY created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.circular_matching_queue q
    SET status = 'PROCESSING',
        locked_at = now(),
        claim_token = nb.new_token,
        attempts = q.attempts + 1
    FROM next_batch nb
    WHERE q.id = nb.id
    RETURNING q.id, q.item_id, q.event_type, q.claim_token;
END;
$$;

-- 5.2. Matchausjonon kuittaus onnistuneeksi (claim_token)
CREATE OR REPLACE FUNCTION public.fn_complete_matching_queue_task(p_id bigint, p_claim_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_updated_count int;
BEGIN
    UPDATE public.circular_matching_queue
    SET status = 'COMPLETED',
        processed_at = now(),
        locked_at = NULL,
        claim_token = NULL
    WHERE id = p_id
      AND status = 'PROCESSING'
      AND claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

-- 5.3. Matchausjonon virhekäsittely (claim_token)
CREATE OR REPLACE FUNCTION public.fn_fail_matching_queue_task(p_id bigint, p_claim_token uuid, p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_updated_count int;
BEGIN
    UPDATE public.circular_matching_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
        available_at = now() + (interval '10 seconds' * power(2, LEAST(attempts, 6))),
        locked_at = NULL,
        claim_token = NULL,
        last_error = p_error
    WHERE id = p_id
      AND status = 'PROCESSING'
      AND claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

-- 5.4. Matchausjonon toipumistoiminto (Tokenin mitätöinti)
CREATE OR REPLACE FUNCTION public.fn_recover_stale_queue_tasks(p_timeout_interval interval DEFAULT interval '5 minutes')
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    recovered_count int;
BEGIN
    WITH stale_tasks AS (
        SELECT id, attempts, max_attempts
        FROM public.circular_matching_queue
        WHERE status = 'PROCESSING'
          AND locked_at < (now() - p_timeout_interval)
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.circular_matching_queue q
        SET status = CASE 
                        WHEN st.attempts >= st.max_attempts THEN 'FAILED' 
                        ELSE 'PENDING' 
                     END,
            available_at = now() + (interval '10 seconds' * power(2, LEAST(st.attempts, 6))),
            locked_at = NULL,
            claim_token = NULL,
            last_error = CASE 
                            WHEN st.attempts >= st.max_attempts THEN 'Max attempts reached. Stale lock recovery.' 
                            ELSE 'Processing lock timed out. Retrying.' 
                         END
        FROM stale_tasks st
        WHERE q.id = st.id
          AND q.status = 'PROCESSING'
        RETURNING q.id
    )
    SELECT count(*)::int INTO recovered_count FROM updated;
    RETURN recovered_count;
END;
$$;

-- 5.5. Notifikaatiojonon poiminta (claim_token)
CREATE OR REPLACE FUNCTION public.fn_pop_notifications_queue_batch(p_batch_size int DEFAULT 10)
RETURNS TABLE (
    notification_id bigint,
    recipient_uid text,
    notification_type text,
    title text,
    body text,
    payload jsonb,
    claim_token uuid
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
    RETURN QUERY
    WITH next_batch AS (
        SELECT id, gen_random_uuid() AS new_token
        FROM public.circular_notifications_queue
        WHERE status = 'PENDING'
          AND available_at <= now()
        ORDER BY created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.circular_notifications_queue q
    SET status = 'PROCESSING',
        locked_at = now(),
        claim_token = nb.new_token,
        attempts = q.attempts + 1
    FROM next_batch nb
    WHERE q.id = nb.id
    RETURNING q.id, q.recipient_uid, q.notification_type, q.title, q.body, q.payload, q.claim_token;
END;
$$;

-- 5.6. Notifikaation kuittaus onnistuneeksi (claim_token)
CREATE OR REPLACE FUNCTION public.fn_complete_notification(p_id bigint, p_claim_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_updated_count int;
BEGIN
    UPDATE public.circular_notifications_queue
    SET status = 'SENT',
        sent_at = now(),
        locked_at = NULL,
        claim_token = NULL
    WHERE id = p_id
      AND status = 'PROCESSING'
      AND claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

-- 5.7. Notifikaation virhekäsittely (claim_token)
CREATE OR REPLACE FUNCTION public.fn_fail_notification(p_id bigint, p_claim_token uuid, p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_updated_count int;
BEGIN
    UPDATE public.circular_notifications_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
        available_at = now() + (interval '15 seconds' * power(2, LEAST(attempts, 5))),
        locked_at = NULL,
        claim_token = NULL,
        last_error = p_error
    WHERE id = p_id
      AND status = 'PROCESSING'
      AND claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$;

-- 5.8. Orpojen notifikaatioiden palautus (Tokenin mitätöinti)
CREATE OR REPLACE FUNCTION public.fn_recover_stale_notification_tasks(p_timeout_interval interval DEFAULT interval '5 minutes')
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    recovered_count int;
BEGIN
    WITH stale_tasks AS (
        SELECT id, attempts, max_attempts
        FROM public.circular_notifications_queue
        WHERE status = 'PROCESSING'
          AND locked_at < (now() - p_timeout_interval)
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.circular_notifications_queue q
        SET status = CASE 
                        WHEN st.attempts >= st.max_attempts THEN 'FAILED' 
                        ELSE 'PENDING' 
                     END,
            available_at = now() + (interval '15 seconds' * power(2, LEAST(st.attempts, 5))),
            locked_at = NULL,
            claim_token = NULL,
            last_error = CASE 
                            WHEN st.attempts >= st.max_attempts THEN 'Max attempts reached. Stale lock recovery.' 
                            ELSE 'Notification lock timed out. Retrying.' 
                         END
        FROM stale_tasks st
        WHERE q.id = st.id
          AND q.status = 'PROCESSING'
        RETURNING q.id
    )
    SELECT count(*)::int INTO recovered_count FROM updated;
    RETURN recovered_count;
END;
$$;

-- 5.9. Ajastettu vanhenemistoiminto (Suojaa sekä ACCEPTED että RESERVED)
CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_circular_items()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_expired_items int;
    v_expired_matches int;
    v_recovered_matching int;
    v_recovered_notifs int;
BEGIN
    v_recovered_matching := public.fn_recover_stale_queue_tasks(interval '5 minutes');
    v_recovered_notifs := public.fn_recover_stale_notification_tasks(interval '5 minutes');

    WITH expired AS (
        UPDATE public.circular_items
        SET status = 'EXPIRED', updated_at = now()
        WHERE deadline_at < now() 
          AND status = 'ACTIVE'
          AND id NOT IN (
              SELECT offer_item_id FROM public.circular_matches WHERE status IN ('ACCEPTED', 'RESERVED')
              UNION
              SELECT wanted_item_id FROM public.circular_matches WHERE status IN ('ACCEPTED', 'RESERVED')
          )
        RETURNING id
    )
    SELECT count(*)::int INTO v_expired_items FROM expired;

    WITH closed_matches AS (
        UPDATE public.circular_matches
        SET status = 'EXPIRED', updated_at = now()
        WHERE status IN ('POTENTIAL', 'NOTIFIED')
          AND (offer_item_id IN (SELECT id FROM public.circular_items WHERE status = 'EXPIRED')
            OR wanted_item_id IN (SELECT id FROM public.circular_items WHERE status = 'EXPIRED'))
        RETURNING id
    )
    SELECT count(*)::int INTO v_expired_matches FROM closed_matches;

    RETURN jsonb_build_object(
        'recovered_matching_tasks', v_recovered_matching,
        'recovered_notification_tasks', v_recovered_notifs,
        'expired_items', v_expired_items,
        'expired_matches', v_expired_matches,
        'timestamp', now()
    );
END;
$$;
```

---

## 6. Testisuunnitelma testikantaan (Mandatory Test Suite)

Seuraavat testitapaukset suoritetaan erillisessä LostReFound-testikannassa ennen tuotantohyväksyntää:

### Tapaus A: Hidas Worker A ja uudelleenpoiminta (Claim token -suojaus)
1. Lisää testinotifikaatio `circular_notifications_queue`-tauluun.
2. Worker A kutsuu `fn_pop_notifications_queue_batch(1)` ja saa tehtävän $T_1$ sekä `token_A`:n.
3. Simuloidaan aikakatkaisu: Päivitetään tietokannassa $T_1$:n `locked_at = now() - interval '6 minutes'`.
4. Kutsutaan `fn_recover_stale_notification_tasks()` $\rightarrow$ Tehtävä $T_1$ palautuu tilaan `PENDING`, ja `claim_token` nollataan `NULL`:ksi.
5. Worker B kutsuu `fn_pop_notifications_queue_batch(1)` ja saa tehtävän $T_1$ sekä uuden `token_B`:n.
6. Worker A yrittää kuitata tehtävän: `SELECT fn_complete_notification(T_1.id, token_A)`.
7. **Odotettu tulos:** Funktio palauttaa `false` (kuittaus hylätty). Tehtävä $T_1$ pysyy tilassa `PROCESSING` Worker B:n hallussa (`claim_token = token_B`).

### Tapaus B: Vanhan Worker A:n myöhästynyt virhekuittaus onnistuneen lähetyksen jälkeen
1. Jatkoa edelliseen: Worker B lähettää viestin onnistuneesti ja kutsuu `SELECT fn_complete_notification(T_1.id, token_B)`.
2. Funktio palauttaa `true`, ja tehtävän tilaksi tulee `SENT`.
3. Worker A herää myöhässä verkkovirheen jälkeen ja yrittää merkitä tehtävää virheelliseksi: `SELECT fn_fail_notification(T_1.id, token_A, 'Network timeout')`.
4. **Odotettu tulos:** Funktio palauttaa `false`. Tehtävän tila pysyy edelleen `SENT`-tilassa eikä sitä ylikirjoiteta `FAILED`- tai `PENDING`-tilaan.

### Tapaus C: ACCEPTED-matchin suoja määräajan ylittyessä
1. Luodaan `OFFER` ja `WANTED`, joilla on `deadline_at = now() - interval '10 minutes'`.
2. Luodaan niiden välille match tilassa `ACCEPTED`.
3. Kutsutaan `fn_cleanup_expired_circular_items()`.
4. **Odotettu tulos:** Kumpikaan ilmoitus **ei vanhene** (`status` säilyy `ACTIVE`), koska hyväksytty kohtaaminen suojaa niitä.

### Tapaus D: ACCEPTED-matchin purkautuminen määräajan umpeuduttua
1. Jatkoa Tapaukseen C: Toinen osapuoli hylkää matchin $\rightarrow$ `UPDATE circular_matches SET status = 'REJECTED' WHERE id = ...`.
2. Triggeri `trg_fn_on_match_unreserved` laukeaa.
3. **Odotettu tulos:** Molempien ilmoitusten tila siirtyy automaattisesti tilaan `EXPIRED`, koska niiden `deadline_at` oli menneisyydessä eikä niillä ole enää toista hyväksyttyä matchia.

### Tapaus E: Ilmoituksen manuaalinen poisto ACCEPTED-tilassa
1. Luodaan kaksi ilmoitusta ja niiden välinen match tilassa `ACCEPTED`.
2. Toinen käyttäjä poistaa ilmoituksensa: `UPDATE circular_items SET status = 'DELETED' WHERE id = item_id`.
3. Triggeri `trg_fn_cancel_matches_on_item_close` laukeaa.
4. **Odotettu tulos:** Match siirtyy tilaan `CANCELLED`, ja `circular_notifications_queue`-tauluun generoituu `RESERVATION_CANCELLED`-outbox-viesti vastapuolen Firebase UID:lle otsikolla *"Hyväksytty kohtaaminen peruttu"*.

### Tapaus F: Onnistunut toteutus FULFILLED ACCEPTED- tai RESERVED-tilassa
1. Luodaan ilmoitukset $I_1$ ja $I_2$, joiden match $M_1$ on tilassa `ACCEPTED` (tai `RESERVED`).
2. Luodaan samalle $I_1$:lle toinen kilpaileva match $M_2$ tilassa `POTENTIAL`.
3. Ilmoitus $I_1$ merkitään toteutuneeksi: `UPDATE circular_items SET status = 'FULFILLED' WHERE id = I_1.id`.
4. **Odotettu tulos:**
   - Match $M_1$ siirtyy automaattisesti tilaan `FULFILLED`.
   - Kilpaileva match $M_2$ siirtyy tilaan `CANCELLED`.
   - Notifikaatiojonoon **ei luoda** peruutusvirheilmoituksia $M_1$:lle.
