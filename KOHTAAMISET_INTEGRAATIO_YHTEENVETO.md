# Kohtaamiset (Encounters) – Arkkitehtuurin, Tietoturvan ja Integraation Yhteenveto

**Päivämäärä:** 12.10.2026  
**Projektit:** 
- LaukaaLive Android (`org.example.LaukaaLive`)
- LaukaaInfo Livescreen & Web (`laukaainfo-web`)
- Supabase Tietokantakerros (`060_encounters_unified_schema.sql`, Versio 5.20)

---

## 1. Yleiskatsaus ja Tavoite

Kohtaamiset-palvelun (Encounters) tietokantarakenne, käyttöoikeusmalli (RLS), sovellusrajapinnat (RPC) sekä asiakassovellukset (Android & Web) on yhtenäistetty ja kovennettu tuotantovalmiiksi.

Tärkeimmät saavutetut periaatteet:
1. **Yksityisyydensuoja (Privacy by Design):** Sähköpostiosoite (`contact_email`), puhelinnumero (`contact_phone`), käyttäjätunniste (`user_id`) ja salainen muokkausavain (`edit_token`) eivät koskaan vuoda julkiseen näkymään tai anonyymeille lukijoille.
2. **Kielletyt suorat kirjoitukset:** Suorat `INSERT` ja `DELETE` -operaatiot `encounters`-tauluun on evätty taulutasolla asiakasrooleilta (`anon`, `authenticated`). Kaikki toiminnot suoritetaan valvottujen RPC-funktioiden kautta.
3. **Anonyymi elinkaari muokkaustunnisteella (edit_token):** Anonyymi ilmoittaja saa ilmoituksen luonnin yhteydessä salaisen `edit_token`-UUID:n. Token tallennetaan asiakaslaitteelle ja sen avulla ilmoitusta voidaan muokata, sulkea tai hakea omat yhteystiedot ilman pakollista käyttäjätiliä.
4. **Vahva tenant- ja organisaatioeristys:** Organisaatioiden julkaisut vaativat SHA-256-tiivisteellä suojatun julkaisuavaimen (`verify_publisher_key`), jota ei voi ohittaa tai arvata toisen organisaation tunnuksella.

---

## 2. Tietokantakerroksen Muutokset (`060_encounters_unified_schema.sql` v5.20)

### 2.1. Julkinen näkymä (`encounters_public`)
- **Sarakkeet (23 kpl):** `id`, `type`, `sub_category`, `title`, `description`, `price_info`, `place_id`, `location`, `location_id`, `organization_id`, `publisher_type`, `publisher_name`, `tags`, `allow_messages`, `structured_links`, `image_url`, `external_url`, `external_source`, `status`, `visibility`, `created_at`, `expires_at`.
- **Rajaussäännöt:** Näyttää ainoastaan aktiiviset (`status = 'active'`), julkiset (`visibility = 'public' OR visibility IS NULL`) ja voimassa olevat (`expires_at > now()`) ilmoitukset.
- **Poissuljetut kentät:** `contact_email`, `contact_phone`, `user_id` ja `edit_token` on jätetty kokonaan pois näkymästä.

### 2.2. Hakupolun korjaus (`search_path`)
Kaikkiin `SECURITY DEFINER` -funktioihin on asetettu:
```sql
SET search_path = pg_catalog, public, extensions, pg_temp;
```
Tämä korjaa PostgreSQL-alikutsujen virheen (`function digest(text, unknown) does not exist`) ja varmistaa, että Supabasen `extensions`-skeemassa sijaitseva `pgcrypto` toimii kaikissa tilanteissa.

### 2.3. Keskitetty ylläpitäjätarkistus (`public.is_admin()`)
Ylläpitäjän oikeudet on kovennettu ja keskitetty:
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT (
        COALESCE(auth.jwt()->>'role', '') = 'authenticated'
        AND LOWER(COALESCE(auth.jwt()->>'email', '')) IN (
            'info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com'
        )
    );
$$;
```
Tarkistus edellyttää todennettua roolia (`authenticated`) eikä salli anonyymin istunnon väitteitä.

### 2.4. RPC-Funktiot ja käyttöoikeudet
* `create_encounter(...)`: Validoi syötteet, tarkistaa organisaatioavaimen, luo ilmoituksen ja palauttaa kertaluonteisesti `encounter_id` ja `edit_token`.
* `update_encounter_with_token(...)`: Päivittää sallitut kentät vain, jos annettu `edit_token` täsmää tai käyttäjä on ylläpitäjä/omistaja.
* `delete_encounter_with_token(...)`: Muuttaa ilmoituksen tilaksi `closed`, jolloin se poistuu välittömästi julkisesta näkymästä.
* `get_encounter_contact(...)`: Palauttaa `contact_email` ja `contact_phone` vain oikealla `edit_tokenilla`, omistajan istunnolla tai ylläpitäjälle.
* `verify_publisher_key(...)`: Kovennettu SHA-256-tarkistus organisaation aktiivisille julkaisutunnisteille.

---

## 3. Verkkosovelluksen Muutokset (`kohtaamiset.js`)

1. **Haku reititetty julkiseen näkymään:**
   - Anonyymi ilmoitushaku käyttää nyt `.from('encounters_public').select('*')`.
   - Suora `encounters`-haku tehdään vain kirjautuneelle käyttäjälle omien luonnosten/arkistoitujen näyttämiseksi.
2. **Virheenkäsittelyn korjaus:**
   - Poistettu hiljainen mock-dataan siirtyminen todellisen tietokantavirheen sattuessa. Käyttöliittymä näyttää virheilmoituksen, jotta yhteysongelmat havaitaan välittömästi.
3. **Yhteydenottonapin logiikka:**
   - Napin näkyvyys sidottu `ad.allow_messages !== false` -tilaan, koska `ad.contact_email` on tietoturvasyistä piilotettu julkisesta näkymästä.
4. **Globaalit RPC-apuohjelmat:**
   - Lisätty `window.LaukaaKohtaamiset`-objekti:
     - `createEncounter(params)`
     - `updateEncounter(id, token, updates)`
     - `deleteEncounter(id, token)`
     - `getContact(id, token)`

---

## 4. Android-sovelluksen Muutokset (`LaukaaLive`)

### 4.1. `SupabaseService.kt`
1. **Lukukyselyt (`queryEncountersTable`):**
   - Kysely kohdistuu ensisijaisesti näkymään `newProjectClient.postgrest["encounters_public"]`.
   - Anonyymit haut eivät enää törmää 401 Unauthorized -virheeseen.
2. **Muokkausavaimen tallennus (`edit_token`):**
   - Lisätty SharedPreferences-pohjainen tokenien hallinta:
     - `saveEncounterEditToken(encounterId, editToken)`
     - `getEncounterEditToken(encounterId): String?`
     - `removeEncounterEditToken(encounterId)`
3. **RPC-luonti (`insertEncounter`):**
   - Palauttaa `CreateEncounterResult`-olion.
   - Luonnin onnistuessa tallettaa automaattisesti palautetun `edit_token`-avaimen paikalliseen muistiin.
4. **RPC-päivitys ja sulkeminen:**
   - `updateEncounter(encounterId, encounter, editToken?)`: Kutsuu `update_encounter_with_token`-RPC:tä. Noutaa tarvittaessa paikallisesti tallennetun tokenin.
   - `deleteEncounter(encounterId, editToken?)`: Kutsuu `delete_encounter_with_token`-RPC:tä ja siivoaa onnistumisen jälkeen tokenin laitteelta.
   - `getEncounterContact(encounterId, editToken?)`: Hakee yhteystiedot `get_encounter_contact`-RPC:llä.

### 4.2. `AddEncounterScreen.kt`
1. **Vieraskäyttäjän UUID-tyyppivirheen korjaus:**
   - Poistettu vanha koodi: `userId = supabaseService.getCurrentUserId() ?: "guest_${UUID}"`.
   - Anonyymille käyttäjälle `userId` asetetaan arvoon `null`. Tietokanta täyttää `user_id`-sarakkeen `auth.uid()`-arvolla, joten laite ei enää lähetä rikkinäisiä `"guest_..."`-merkkijonoja UUID-sarakkeeseen.
2. **Tuloskäsittely ja teemojen synkronointi:**
   - Vastaanottaa `CreateEncounterResult`-tuloksen ja hyödyntää tietokannan generoimaa todellista `encounterId`-tunnistetta `syncEntityTags`-kutsussa.

---

## 5. Suoritetut Hyväksymis- ja Negatiivitestit

| Testitapaus | Kutsu | Odotettu tulos | Todellinen tulos kannassa | Tila |
| :--- | :--- | :--- | :--- | :---: |
| **Anonyymi luonti** | `create_encounter` | `success: true`, `id` ja `edit_token` palautetaan | Palautti UUID:t, tietue luotu | **HYVÄKSYTTY** |
| **Julkinen näkymä** | `GET /encounters_public` | 23 saraketta, ei salaisuuksia | Sarakkeet täsmäävät, yksityiskentät puuttuvat | **HYVÄKSYTTY** |
| **Suora taululuku** | `GET /encounters` (anon) | 401 Unauthorized | 401 Unauthorized | **HYVÄKSYTTY** |
| **Suora token-taulu** | `GET /encounter_edit_tokens` | 401 Unauthorized | 401 Unauthorized | **HYVÄKSYTTY** |
| **Yhteystiedot tokenilla** | `get_encounter_contact` | Sähköposti ja puhelin palautetaan | Palautti salatut yhteystiedot | **HYVÄKSYTTY** |
| **Yhteystiedot ilman tokenia** | `get_encounter_contact` | Hylätty | `{"success": false, "error": "Ei käyttöoikeutta..."}` | **HYVÄKSYTTY** |
| **Muokkaus väärällä tokenilla** | `update_encounter_with_token` | Hylätty, tietue ei muutu | Hylätty, otsikko säilyi alkuperäisenä | **HYVÄKSYTTY** |
| **Sulkeminen väärällä tokenilla** | `delete_encounter_with_token` | Hylätty, ilmoitus pysyy aktiivisena | Hylätty, ilmoitus pysyi julkisena | **HYVÄKSYTTY** |
| **Sulkeminen oikealla tokenilla** | `delete_encounter_with_token` | Tila `closed`, poistuu näkymästä | Tila vaihtui, poistui julkisesta näkymästä | **HYVÄKSYTTY** |
| **Organisaatio väärällä avaimella** | `create_encounter` (org) | Hylätty | `{"valid": false, "error": "Virheellinen..."}` | **HYVÄKSYTTY** |
| **Olematon organisaatio** | `create_encounter` (org) | Hylätty | `{"valid": false, "error": "Organisaatiota ei löydy..."}` | **HYVÄKSYTTY** |
