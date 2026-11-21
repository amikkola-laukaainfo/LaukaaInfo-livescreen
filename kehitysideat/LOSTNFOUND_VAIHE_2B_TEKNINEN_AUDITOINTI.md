# Vaihe 2B: Tekninen auditointiraportti ja yhteensopivuustarkastus
*LostReFound — CIRCULAR-kiertotalousmoduulin Supabase Edge Functions -auditointi — 20.11.2026*
*Synkronoitu: LaukaaInfo-livescreen/kehitysideat/*

---

## 1. Johdanto ja auditoinnin tavoite

Tämä tekninen auditointi suoritettiin Vaihe 2B:n valmistumisen jälkeen ennen Android-integraation aloittamista. Auditoinnissa tarkastettiin luodut neljä Supabase Edge Functionia (`submit-circular-item`, `process-matching-queue`, `respond-to-match`, `process-notifications-queue`), jaettu Firebase-autentikointimoduuli (`_shared/firebase-auth.ts`) sekä niiden yhteensopivuus Vaiheen 1 tuotantoturvallistetun SQL-skeeman (`20261120_circular_economy_phase1.sql`) kanssa.

Tarkastuksen perusteella arvioidaan, ovatko rajapinnat ja taustaprosessit valmiita tuotantokäyttöön ja Android-sovelluksen kytkemiseen.

---

## 2. Tiivistelmä ja kokonaisarvio

| Auditoinnin kohde | Tila | Havainnot |
|---|---|---|
| **1. RPC-funktiot ja tietokantayhteensopivuus** | ❌ KRIITTISIÄ PUUTTEITA | Parametrinimien ristiriidat virheenkäsittelyfunktioissa (`p_error` vs `p_error_message`). |
| **2. Matchin elinkaari ja idempotenssi** | ❌ KRIITTISIÄ PUUTTEITA | Upsert ylikirjoittaa `ACCEPTED`/`RESERVED`-tilat takaisin; kaksoisilmoitusten esto puuttuu. |
| **3. Notifikaatiot ja FCM-jakelu** | ❌ KRIITTISIÄ PUUTTEITA | FCM-laite-tokenien rekisteröinti ja tallennuspaikka puuttuvat kokonaan tietomallista. |
| **4. Pääsynhallinta ja API-turvallisuus** | ⚠️ MERKITTÄVIÄ PUUTTEITA | Taustafunktioiden (`process-*`) suojaton julkinen rajapinta; audit-lokituksen kaksinkertaisuus. |
| **5. Firebase JWT -varmennus** | ✅ HYVÄKSYTTÄVÄ | Allekirjoitus, aud, iss ja uid luotettavia (`jose` + JWK). |
| **6. Pisteytysmatematiikka (scoring.ts)** | ✅ HYVÄKSYTTY | Kaikki yksikkötestit läpäisty (Tapaukset A, B, C). |

### LOPULLINEN ARVIO:
> ### ⛔ **EI VIELÄ HYVÄKSYTTY ANDROID-INTEGRAATION ALOITTAMISEEN**
> Ennen Android-koodin kirjoittamista tai palvelimelle vientiä alla yksilöidyt kriittiset ja merkittävät arkkitehtuurivirheet on korjattava.

---

## 3. Havaintojen luokittelu ja yksityiskohtainen analyysi

---

### 🔴 KRIITTISET HAVAINNOT (Estävät käyttöönoton)

#### Havainto K1: RPC-funktion parametrinimen ristiriita virhekuittauksissa (`p_error` vs `p_error_message`)
- **Sijainti:** 
  - `process-matching-queue/index.ts` (rivi 248)
  - `process-notifications-queue/index.ts` (rivi 129)
  - Tietokantamigraatio `20261120_circular_economy_phase1.sql` (rivit 595 ja 718)
- **Ongelma:**
  Tietokannassa funktiot on määritelty:
  ```sql
  fn_fail_matching_queue_task(p_id bigint, p_claim_token uuid, p_error text)
  fn_fail_notification(p_id bigint, p_claim_token uuid, p_error text)
  ```
  Edge Functionit kutsuvat funktioita JSON-objektilla, jossa parametrina on `p_error_message`:
  ```typescript
  await supabase.rpc("fn_fail_matching_queue_task", {
    p_id: queueId,
    p_claim_token: claimToken,
    p_error_message: errorMsg // VIRHE: PostgreSQL ei löydä funktiota tällä parametrilla!
  });
  ```
- **Vaikutus:** Jos worker kohtaa virheen ja yrittää merkitä tehtävän epäonnistuneeksi, RPC-kutsu kaatuu PostgreSQL-virheeseen `function ... does not exist`. Tehtävä jää tilaan `PROCESSING` eikä sen backoff-laskuri päivity ennen 5 minuutin haamuaikakatkaisua.
- **Korjaus:** Nimettävä kutsussa parametriksi täsmälleen `p_error`.

---

#### Havainto K2: `circular_matches` Upsert tuhoaa elinkaaritilan (`ACCEPTED` / `RESERVED` $\rightarrow$ `POTENTIAL`)
- **Sijainti:** `process-matching-queue/index.ts` (rivit 151–168)
- **Ongelma:**
  Kun kohteelle ajetaan matchaus (esim. ilmoituksen tekstin tai attribuuttien päivityksen yhteydessä tai jonon toistossa), funktio muodostaa match-tietueen:
  ```typescript
  const matchRow = {
    offer_item_id: offer.id,
    wanted_item_id: wanted.id,
    status: scoringResult.status, // Aina 'POTENTIAL' tai 'NOTIFIED'
    ...
  };
  await supabase.from("circular_matches").upsert(matchRow, { onConflict: "offer_item_id,wanted_item_id" });
  ```
  Jos kyseinen match-pari oli jo aiemmin sovittu ja edennyt tilaan `ACCEPTED`, `RESERVED` tai `FULFILLED`, tämä `upsert` ylikirjoittaa tilan takaisin tilaan `POTENTIAL` tai `NOTIFIED`!
- **Vaikutus:** Käyttäjien sopimat kohtaamiset ja varaukset pyyhkiytyvät hiljaisesti pois aina, kun ilmoitukselle ajetaan uudelleenarviointi.
- **Korjaus:**
  1. Ennen päivitystä on tarkistettava nykyinen tila: jos tila on `ACCEPTED`, `RESERVED` tai `FULFILLED`, pistemäärät voidaan päivittää, mutta **`status`-kenttää ei saa ylikirjoittaa**.
  2. SQL-tasolla voidaan käyttää ehdollista päivitystä tai varmistaa tila ennen upsertia.

---

#### Havainto K3: Uudelleenkäsittelyn kaksoisilmoitukset (Notifikaatioiden idempotenssi puuttuu)
- **Sijainti:** `process-matching-queue/index.ts` (rivit 177–215)
- **Ongelma:**
  Aina kun `scoringResult.status === "NOTIFIED"`, koodi lisää automaattisesti uudet rivit `circular_notifications_queue`-tauluun molemmille käyttäjille:
  ```typescript
  if (scoringResult.status === "NOTIFIED" && upsertedMatch?.id) {
    await supabase.from("circular_notifications_queue").insert(notifications);
  }
  ```
  Koodi ei tarkista:
  - Oliko kyseiselle matchille jo aiemmin luotu `MATCH_FOUND`-ilmoitus?
  - Oliko match jo entuudestaan tilassa `NOTIFIED`?
- **Vaikutus:** Jos sama ilmoitus laukaisee jonon uudelleen (tai jono ajetaan cronilla säännöllisesti), käyttäjät saavat toistuvasti saman push-ilmoituksen samasta osumasta joka kerta.
- **Korjaus:**
  Ilmoitus outboxiin luodaan **vain ja ainoastaan silloin**, kun match luodaan uutena TAI kun sen tila siirtyy arvosta `POTENTIAL` arvoon `NOTIFIED`. Lisäksi `circular_notifications_queue`-taulussa tai payloadissa on käytettävä deduplikointitunnistetta (`match_id` + `notification_type`).

---

#### Havainto K4: FCM-laite-tokenien rekisteröinti ja tallennuspaikka puuttuvat
- **Sijainti:** `process-notifications-queue/index.ts` ja tietokantamalli
- **Ongelma:**
  `circular_notifications_queue` tallentaa vastaanottajan kenttään `recipient_uid` (Firebase UID).
  FCM (Firebase Cloud Messaging) HTTP v1 API vaatii kuitenkin vastaanottajan **laitetokenin** (`registration_token`), ei pelkkää käyttäjän UID:tä. Tietokannassa ei ole taulua (esim. `user_fcm_tokens` tai vastaavaa), johon Android-sovellus tallentaisi oman laitetokeninsa kirjautuessaan.
- **Vaikutus:** `process-notifications-queue` ei voi toimittaa oikeita push-ilmoituksia laitteille, vaan se jää simulaatiotilaan.
- **Korjaus:**
  Tietokantaan tarvitaan kevyt taulu `public.user_fcm_tokens (user_uid text, fcm_token text, updated_at timestamptz, PRIMARY KEY (user_uid, fcm_token))` ja Android-sovellukselle Gateway-rajapinta oman tokeninsa rekisteröimiseen.

---

### 🟠 MERKITTÄVÄT HAVAINNOT (Korjattava ennen käyttöönottoa)

#### Havainto M1: Taustafunktioiden (`process-*`) suojaton julkinen rajapinta
- **Sijainti:** 
  - `process-matching-queue/index.ts`
  - `process-notifications-queue/index.ts`
- **Ongelma:**
  Molemmat funktiot on otettu käyttöön lipulla `--no-verify-jwt`. Funktioiden `index.ts` ei tarkista kutsun otsakkeista mitään jaettua salaisuutta (`CRON_SECRET`) tai `service_role`-avainta.
- **Vaikutus:** Kuka tahansa ulkopuolinen voi tehdä HTTP POST -kutsuja suoraan julkiseen URL-osoitteeseen `https://<ref>.supabase.co/functions/v1/process-matching-queue` ja pakottaa jonon jatkuvaan suoritukseen (palvelunestohyökkäys / resurssien kulutus).
- **Korjaus:** Lisättävä kutsun varmennus:
  ```typescript
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized worker invocation" }), { status: 401 });
  }
  ```

---

#### Havainto M2: Audit-lokituksen kaksinkertaisuus ja actor_uid 'system'
- **Sijainti:** `respond-to-match/index.ts` (rivit 121–127)
- **Ongelma:**
  Tietokannassa on triggeri `trg_fn_log_match_status_change()`, joka laukeaa automaattisesti `AFTER UPDATE OF status ON circular_matches`. Triggeri lukee istuntomuuttujan `current_setting('app.current_user_uid', true)`.
  Koska Edge Function tekee päivityksen perinteisellä HTTP REST -kutsulla eikä aseta istuntomuuttujaa, triggeri asettaa lokiin `actor_uid = 'system'`.
  Tämän jälkeen Edge Function tekee erillisen `insert`-kutsun tauluun `circular_match_events` käyttäjän omalla UID:lla.
- **Vaikutus:** Yhdestä hyväksynnästä syntyy kaksi audit-tapahtumaa: ensimmäinen `'system'`-toimijalla ja toinen käyttäjätunnuksella.
- **Korjaus:**
  Korvataan REST-päivitys tietokantafunktiolla (RPC) `fn_respond_to_match(p_match_id, p_action, p_user_uid, p_reason)`, joka asettaa `SET LOCAL app.current_user_uid = p_user_uid` saman transaktion sisällä. Näin triggeri hoitaa auditoinnin puhtaasti yhdellä rivillä ilman duplikaatteja.

---

#### Havainto M3: Deno-kehitysympäristön puuttuminen paikalliselta koneelta
- **Sijainti:** Paikallinen kehityskone (Windows)
- **Ongelma:**
  Komentorivillä `deno --version` palautti virheen `ObjectNotFound`. Pisteytysyksikkötestit (`scoring.ts`) ajettiin Node.js 25:n kokeellisella `--experimental-strip-types` -tuella. Tämä todisti matematiikan, mutta Deno-kohtaisia riippuvuuksia (`https://deno.land/std...`, `esm.sh`) tai itse Edge Functionien runtimea ei voitu ajaa paikallisesti.
- **Vaikutus:** Edge Functionien integraatiotestit voidaan ajaa ainoastaan suoraan Supabasen testiprojektissa (`supabase functions deploy`) tai asentamalla Deno paikallisesti.
- **Korjaus:** Asennetaan Deno (`winget install DenoLand.Deno`) tai ajetaan integrointitestaus Supabasen testi-instanssissa.

---

### 🟡 VÄHÄISET HAVAINNOT (Voidaan korjata myöhemmin)

#### Havainto V1: Firebase JWT `iat`-aikaleiman sallittu poikkeama (clock skew)
- **Sijainti:** `supabase/functions/_shared/firebase-auth.ts`
- **Huomio:** `jose.jwtVerify` tarkistaa oletuksena `exp`-ajan tiukasti, mutta ei aseta 60 sekunnin `iat`-kattorajoitusta tulevaisuuteen (`iat <= now + 60s`).
- **Suositus:** Lisätään `clockTolerance: "60s"` jose-valintoihin.

#### Havainto V2: Mikrovarastojen spatiaalinen kysely
- **Sijainti:** `process-matching-queue/index.ts` (rivi 83)
- **Huomio:** Funktio hakee aluksi kaikki noutopisteet `storage_locations` -taulusta muistiin muistilaskentaa varten (`limit(100)`). Tämä toimii hyvin pilottivaiheessa Laukaan alueella, mutta skaalautuvassa tuotannossa noutopisteet tulee rajata PostGIS-etäisyyskyselyllä (`ST_DWithin`).

---

## 4. Päästä päähän (End-to-End) -testisuunnitelma

Käyttäjän toimeksiannossa esitetty testiketju on erinomainen ja se suoritetaan heti, kun kriittiset havainnot K1–K4 on korjattu:

```
[1. submit-circular-item] (Käyttäjä A, OFFER: Puutavara) 
     │
     ▼ tallentuu circular_items -> triggeri vie circular_matching_queue
[2. submit-circular-item] (Käyttäjä B, WANTED: Runkopuu)
     │
     ▼ tallentuu circular_items -> triggeri vie circular_matching_queue
[3. process-matching-queue] (Worker herää)
     │
     ▼ Poimii tehtävän -> Löytää parin -> Pisteyttää (Score >= 0.75)
     ▼ Tallentaa circular_matches (status: NOTIFIED)
     ▼ Luo outbox-rivit circular_notifications_queue (A ja B)
[4. respond-to-match] (Käyttäjä A hyväksyy -> offer_accepted_at asetettu)
     │
     ▼ Tila pysyy NOTIFIED, heräte B:lle
[5. respond-to-match] (Käyttäjä B hyväksyy -> wanted_accepted_at asetettu)
     │
     ▼ Triggeri trg_fn_check_mutual_acceptance siirtää tilan: ACCEPTED!
     ▼ Audit-lokiin tallentuvat tapahtumat oikeilla käyttäjä-UID:lla
```

---

## 5. Johtopäätökset ja korjauslista ennen Android-vaihetta

Android-integraation toteutusta **ei tule aloittaa** ennen kuin seuraavat neljä korjausta on tehty palvelinpuolelle:

1. **Korjaa RPC-parametrit:** Vaihda `p_error_message` $\rightarrow$ `p_error` tiedostoissa `process-matching-queue/index.ts` ja `process-notifications-queue/index.ts`.
2. **Suojaa elinkaaritilat match-upsertissa:** Estä `ACCEPTED`-, `RESERVED`- ja `FULFILLED`-tilojen ylikirjoitus `process-matching-queue`:ssa.
3. **Idempotentit notifikaatiot:** Estä `MATCH_FOUND`-kaksoisilmoitukset tarkistamalla aiempi tila ja outbox-historia.
4. **Taustafunktioiden suojaus:** Lisää `CRON_SECRET`-varmennus `process-*` -funktioiden alkuun.
5. **FCM-tokenien hallinta:** Lisää `user_fcm_tokens`-taulu ja sen rekisteröintipäätepiste tai määritä selkeästi Androidin WorkManager-pohjainen polling-vaihtoehto.

Kun nämä viisi asiaa on korjattu ja testattu Supabasen testiprojektissa, palvelinpuoli on luotettava pohja Android-sovelluksen kehitykselle.

