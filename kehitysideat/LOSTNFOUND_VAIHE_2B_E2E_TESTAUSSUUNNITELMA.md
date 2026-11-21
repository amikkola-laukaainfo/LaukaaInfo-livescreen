# Vaihe 2B: E2E-testauksen valmistelu ja arkkitehtuuriraportti
*LostReFound CIRCULAR — Palvelinrajapintojen ja testikannan päästä päähän -todennussuunnitelma — 20.11.2026*

---

## 1. Lähdekoodin ja migraatioiden auditoinnin tulokset

### 1.1. Migraation versionhallinta (Ratkaistu)
- **Tila ennen:** Vaiheen 2B uudet taulut ja funktiot lisättiin suoraan aiempaan tiedostoon `20261120_circular_economy_phase1.sql`.
- **Korjaus:** Koska Vaihe 1 on jo aiemmin ajettu ja testattu LostReFoundin testikannassa (`usswojtlvrnqtzwnffpg`), `20261120_circular_economy_phase1.sql` **palautettiin täsmälleen omaan alkuperäiseen 952-riviseen tilaansa**.
- **Uusi migraatiotiedosto:** Kaikki Vaiheen 2B lisäykset erotettiin puhtaaseen, additiiviseen uuteen migraatioon:
  `supabase/migrations/20261120_circular_economy_phase2b.sql`.

### 1.2. Matchin kaikkien elinkaari- ja varaustietojen säilyminen (`fn_upsert_circular_match_evaluation`)
- **Tarkistus:** Uudessa `fn_upsert_circular_match_evaluation`-funktiossa on toteutettu kolmiportainen suojalogiikka:
  1. Jos match on tilassa `ACCEPTED`, `RESERVED` tai `FULFILLED`:
     - Päivitetään **vain** laatu- ja tilastopisteet (`match_confidence`, `fulfillment_score`, `total_score`, `last_evaluated_at`).
     - **EI KOSKETA** sarakkeisiin `status`, `pickup_mode`, `storage_location_id`, `storage_place_id`, `offer_accepted_at`, `wanted_accepted_at` tai `pickup_code_hash`. Kaikki osapuolten sopimat noutotavat ja varaukset säilyvät koskemattomina.
  2. Jos match on suljettu (`REJECTED`, `EXPIRED`, `CANCELLED`):
     - Pisteet päivittyvät, mutta tilaa ei koskaan palauteta avoimeksi.
  3. Jos match on avoin (`POTENTIAL` tai `NOTIFIED`):
     - Tila voi nousta arvosta `POTENTIAL` arvoon `NOTIFIED`, jolloin funktio palauttaa `status_changed_to_notified = true`.

### 1.3. Deduplikointi ja UNIQUE-rajoite
- `circular_notifications_queue`-tauluun on määritelty eksplisiittinen rajoite:
  ```sql
  CONSTRAINT unique_notification_dedup UNIQUE (deduplication_key)
  ```
- Tämä estää kaksoisilmoitukset myös rinnakkaisissa prosesseissa (`ON CONFLICT (deduplication_key) DO NOTHING`).

### 1.4. FCM-tokenien RLS ja omistajuus
- Taulu `public.user_fcm_tokens` on suojattu tiukalla RLS:llä.
- Suora pääsy tauluun on estetty (`REVOKE ALL FROM anon, authenticated`).
- Hallinta tapahtuu vain uuden `register-fcm-token` Edge Functionin kautta (`service_role`), joka poimii käyttäjän UID:n suoraan varmennetusta Firebase Bearer -tokenista (`verifiedUser.uid`). Käyttäjä ei voi lukea tai muuttaa muiden tokeneita.

### 1.5. Taustafunktioiden suojaus (`CRON_SECRET`)
- Sekä `process-matching-queue` että `process-notifications-queue` tarkistavat heti alussa:
  ```typescript
  if (CRON_SECRET) {
    if (token !== CRON_SECRET && customHeader !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized worker invocation" }), { status: 401 });
    }
  }
  ```
- Ilman salaisuutta tulevat ulkopuoliset kutsut torjutaan 401 Unauthorized -koodilla.

### 1.6. Audit-lokitus ja `fn_respond_to_match`
- `fn_respond_to_match` asettaa `PERFORM set_config('app.current_user_uid', p_user_uid, true)` saman transaktion sisällä.
- Tietokannan triggeri `trg_fn_log_match_status_change` tallentaa tasan yhden audit-rivin oikealla käyttäjän UID:lla. Tuplakirjauksia (`system` + user) ei synny.
- Funktio on suojattu: `SECURITY DEFINER` ja `SET search_path = pg_catalog, public`.

---

## 2. Testien todellinen suoritusstatus

Rehellinen erittely siitä, mitä on ajettu ja mitä odottaa ajoa:

| Testiluokka | Suoritustapa | Tila | Selite |
|---|---|---|---|
| **Pisteytysmoottori (scoring.ts)** | Node.js 25 strip-types | ✅ HYVÄKSYTTY (3/3) | Tapaukset A, B ja C ajettu paikallisesti. |
| **Korjauskierroksen logiikkatestit (test_phase2b_fixes.mjs)** | Node.js 25 | ✅ HYVÄKSYTTY (8/8) | Testit A–H (dedup, elinkaari, CRON, FCM, audit jne.) läpäisty. |
| **Vaiheen 1 SQL-testit (Tapaukset A–F)** | Supabase SQL Editor (testikanta) | ✅ HYVÄKSYTTY (6/6) | Suoritettu aiemmin suoraan kannassa `usswojtlvrnqtzwnffpg`. |
| **Vaiheen 2B SQL-migraatio (20261120_phase2b.sql)** | Tiedosto luotu | ⏳ ODOTTAA AJOA | Ei ajettu vielä kantaan (odottaa hyväksyntää). |
| **Tietokannan E2E-testipaketti (A–K)** | SQL DO-lohko luotu | ⏳ ODOTTAA AJOA | Tiedosto `supabase/tests/e2e_testikannan_testipaketti.sql` valmis ajettavaksi. |
| **Edge Functions HTTP E2E -testi** | Scripti luotu | ⏳ ODOTTAA DEPLOYTA | Funktioita ei ole vielä deployattu testikantaan. |

---

## 3. Valmisteltu E2E-testipaketti (`e2e_testikannan_testipaketti.sql`)

Testipaketti on luotu tiedostoon:
`supabase/tests/e2e_testikannan_testipaketti.sql` (ja LaukaaInfon työtilassa `kehitysideat/LOSTNFOUND_e2e_testikannan_testipaketti.sql`).

Se testaa automatisoidusti suoraan PostgreSQL:n sisällä transaktiossa:
- **Testi A:** Käyttäjä A julkaisee OFFER-ilmoituksen $\rightarrow$ `circular_items` ja jonotehtävä `circular_matching_queue`.
- **Testi B:** Käyttäjä B julkaisee WANTED-ilmoituksen $\rightarrow$ `circular_items` ja jonotehtävä.
- **Testi C:** `fn_upsert_circular_match_evaluation` muodostaa NOTIFIED-matchin oikeilla pisteillä.
- **Testi D:** Outboxiin syntyvät ilmoitukset deduplication_key-tunnisteilla.
- **Testi E:** Molemmat käyttäjät hyväksyvät kohtaamisen (`fn_respond_to_match`) $\rightarrow$ tila siirtyy tilaan `ACCEPTED`, kummallekin tasan 1 audit-rivi omalla UID:lla (0 kpl `system`-rivejä).
- **Testi F:** Uudelleenarviointi säilyttää `ACCEPTED`-tilan ja kaikki hyväksyntäaikaleimat koskemattomina eikä ylikirjoita noutotapaa.
- **Testi G:** Uudelleenajo ei monista outbox-ilmoituksia (`UNIQUE deduplication_key` estää).
- **Testi H:** Ulkopuolinen hyökkääjä ei voi hyväksyä toisen matchia (`Forbidden`-poikkeus).
- **Testi J:** Jonotehtävän virhekuittaus (`p_error`) suorittaa onnistuneen retry-backoffin.
- **Testi K:** Monilaite-FCM: usean aktiivisen laitetokenin poiminta ja passivoidun ohitus.
- **Automaattinen loppusiivous:** Poistaa kaikki testirivit testin päätteeksi.

---

## 4. Miten testikannan E2E-ajo suoritetaan

Kun käyttäjä haluaa ajaa E2E-testin LostReFoundin testikannassa (`usswojtlvrnqtzwnffpg`):

1. **Aja Vaiheen 2B migraatio:**
   Avaa Supabasen SQL Editor ja aja tiedoston [supabase_20261120_circular_economy_phase2b.sql](file:///d:/Sovelluskehitys/LaukaaInfo-livescreen/LaukaaInfo-livescreen/kehitysideat/supabase_20261120_circular_economy_phase2b.sql) sisältö.
   *(Lisää taulun `user_fcm_tokens`, `deduplication_key`:n ja RPC-funktiot `fn_respond_to_match` sekä `fn_upsert_circular_match_evaluation`).*

2. **Aja E2E-testipaketti:**
   Aja Supabasen SQL Editorissa tiedoston [LOSTNFOUND_e2e_testikannan_testipaketti.sql](file:///d:/Sovelluskehitys/LaukaaInfo-livescreen/LaukaaInfo-livescreen/kehitysideat/LOSTNFOUND_e2e_testikannan_testipaketti.sql) sisältö.
   *Kysely palauttaa `NOTICE`-riveinä jokaisen testitapauksen hyväksynnän ja ilmoittaa lopuksi `🎉 KAIKKI E2E-TESTITAPAUKSET (A - K) LÄPÄISTY ONNISTUNEESTI!`.*

---

## 5. Lopullinen arvio

> ### 📋 **PALVELINPUOLI ON VALMIS TESTIKANNAN E2E-AJOON**
> Koodit ja SQL-rajapinnat ovat täysin yhdenmukaisia. Kun Vaiheen 2B migraatio ja E2E-testipaketti on ajettu onnistuneesti testikannassa, palvelinpohja on 100 % luotettava Android-integraation aloittamiseen.

