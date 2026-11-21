# getPotentialMatches() — Kooditason auditointi
*LostReFound — Matching-funktion tarkka analyysi — 20.11.2026*

---

## 1. Funktion tarkka toimintalogiikka

```kotlin
// FirebaseService.kt, rivit 113–165
open suspend fun getPotentialMatches(
    newCategory: ItemCategory,     // LOST tai FOUND
    newLat: Double,
    newLng: Double,
    area: String?,                 // alueen nimi (esim. "Laukaa") — valinnainen
    newItemTimestamp: Timestamp,
    newItemIncidentDate: Timestamp? = null,
    radiusMeters: Double = 500.0   // oletussäde 500 m
): List<LostItem>
```

### Mitä funktio tekee, askel askeleelta

```
1. Käännetään kategoria vastakkaiseksi
   LOST → etsitään FOUND
   FOUND → etsitään LOST

2. Firestore-kysely:
   WHERE status = "APPROVED"
   AND category = <vastakategoria>
   [AND area = <hakualue> — JOS area != null]
   → Kaikki sopivat kandidaatit haetaan muistiin

3. Client-side suodatus haetusta listasta:
   a) expiresAt-tarkistus (vanhentunut → pois)
   b) Haversine-etäisyys ≤ radiusMeters (default 500m)
   c) Aikasuodatus (incidentDate tai timestamp):
      - LOST → etsii FOUND jotka löydetty ≥ (katoamisaika - 1 pv)
      - FOUND → etsii LOST jotka kadonneet ≤ (löytöaika + 1 pv)

4. Lajittelu etäisyyden mukaan (lähin ensin)
5. take(5) → palauttaa max 5 osumaa
```

### Kutsu-paikka: `AddLostItemScreen.kt` rivit 492–505

```kotlin
// Kutsutaan VASTA kun addItem() on jo onnistunut
val matches = firebaseService.getPotentialMatches(
    newCategory = newItem.category,
    newLat = newItem.latitude,
    newLng = newItem.longitude,
    area = currentSelectedArea,
    newItemTimestamp = ts,
    newItemIncidentDate = newItem.incidentDate
)
// Jos osumia löytyy → näytetään AlertDialog käyttäjälle
// Jos ei → onBack() (palataan listaukseen)
```

---

## 2. Auditointikysymysten vastaukset

### Voiko yksi ilmoitus saada useita mahdollisia osumia?
**Kyllä.** Funktio palauttaa `List<LostItem>` ja dialog näyttää kaikki max 5 osumaa. Käyttäjälle näytetään lista, ei vain yksi ehdotus.

### Voiko sama tarjoaja kohdata useita tarvitsijoita?
**Kyllä, teknisesti — mutta ei hallitusti.** Ilmoitukset ovat Firestoressä, ja useampi FOUND-ilmoitus voi täsmätä samaan LOST-ilmoitukseen. Mitään varausmekanismia ei ole: samaan FOUND-ilmoitukseen voivat saada matchin kaikki, jotka jättävät LOST-ilmoituksen samalle alueelle. **Ei lukitusta, ei varausstatusta.**

### Poistuuko ilmoitus matchaushausta varaamisen jälkeen?
**Ei.** Kun match esitetään dialogissa, käyttäjällä on vain yksi nappi: "Sulje ja siirry listaukseen" (rivi 626). Mitään varausta tai tilamuutosta ei tehdä matchatulle ilmoitukselle. Ilmoitus jää `APPROVED`-tilaan ja löytyy seuraavasta hausta myös.

> **Tämä on nykyisen LOST/FOUND-logiikan kannalta täysin oikea ratkaisu** — sama löytöilmoitus voi kuulua monelle etsijälle, tai kukaan heistä ei ole oikea omistaja. Match on **vihje**, ei varaus.

### Voidaanko osittainen määrä yhdistää useampaan tarvitsijaan?
**Ei relevantti nyt.** Nykyinen logiikka on tavarakohtainen (yksi esine = yksi ilmoitus). Määräkäsitettä ei ole.

### Miten jo hyväksytyt ja hylätyt matchit muistetaan?
**Ei mitenkään.** Tätä ei tallenneta mihinkään. Jokainen uusi ilmoitus tuottaa puhtaalta pöydältä uuden matchaus-haun. Ei `matches`-taulua, ei historiatietoa, ei käyttäjän reaktion muistamista.

### Onko ViewModel mukana matchauslogiikassa?
**Ei.** `LostFoundViewModel.kt` on 29 riviä pitkä ja sisältää vain `searchById()`-funktion ja tyhjän `showToast()`. **Koko matchauslogiikka tapahtuu suoraan Composable-tasolla** (`AddLostItemScreen.kt`), ei ViewModelissa. Tämä on arkkitehtuurinen velka, mutta ei este laajentamiselle.

---

## 3. Vahvuudet — mitä säilytetään sellaisenaan

| Vahvuus | Merkitys kiertotalouslaajennukselle |
|---|---|
| `haversineDistance()` on tarkka ja toimiva | Siirtyy suoraan, ei tarvitse koskea |
| `incidentDate`-logiikka (fallback timestampiin) | Kiertotaloudessa `deadlineAt` toimii samalla periaatteella |
| Client-side suodatus Firestore-kyselyn jälkeen | Helppo lisätä tagi/taksonomiapisteytys tähän ketjuun |
| `expiresAt`-tarkistus | Kiertotalousilmoitusten deadline-logiikka sopii tähän |
| `take(5)` -rajaus | Estää liiallisen data-haun; voidaan muuttaa parametriksi |
| `open`-avainsana kaikissa metodeissa | Testattavissa mock-implementaatiolla; laajennettavissa periytymällä |

---

## 4. Puutteet ja riskit

### Puute 1: Matching tapahtuu vain ilmoituksen luontihetkellä
Funktio kutsutaan **kerran, heti `addItem()`-kutsun jälkeen**. Jos sopiva vastailmoitus tehdään vasta huomenna, käyttäjät eivät koskaan kohtaa. Ei tausta-ajoa, ei push-notifikaatioita uusille matcheille vanhoihin ilmoituksiin.

> **Kiertotaloudessa tämä on kriittinen rajoite.** Tarjoaja jättää ilmoituksen maanantaina, hakija tekee WANTED-ilmoituksen tiistaina — ei kohtaamista.

### Puute 2: Firestore-kysely hakee kaikki alueen APPROVED-ilmoitukset muistiin
```kotlin
val query = db.collection(itemsCollection)
    .whereEqualTo("status", "APPROVED")
    .whereEqualTo("category", oppositeCategory.name)
    .let { q -> if (area != null) q.whereEqualTo("area", area) else q }

val allCandidates = query.get().await().toObjects(...)  // ← KAIKKI muistiin
```
Etäisyys- ja aikasuodatus tehdään **client-side**, ei Firestoressä. Tämä skaalautuu huonosti: jos alueen APPROVED-ilmoituksia on 500 kpl, kaikki 500 ladataan ja suodatetaan laitteessa.

> **Supabase + PostGIS** ratkaisisi tämän — `ST_DWithin()` hakee vain oikeasti lähellä olevat koordinaateilla suoraan tietokantakyselyssä.

### Puute 3: Kategoria on binäärinen (LOST ↔ FOUND)
```kotlin
val oppositeCategory = if (newCategory == ItemCategory.LOST) ItemCategory.FOUND else ItemCategory.LOST
```
Kun `CIRCULAR_OFFER` ja `CIRCULAR_WANTED` lisätään, tämä if-lause on laajennettava. Myös `DELIVERED`-kategoria ohitetaan hiljaisesti (se ei ole LOST eikä FOUND — funktion kutsussa käytettäisiin sitä virheellisesti jos kategoria on DELIVERED).

### Puute 4: Ei pisteytystä — vain binäärinen suodatus
Ilmoitus joko läpäisee tai ei läpäise etäisyys- ja aikasuodatuksen. Ei `match_confidence`-arvoa, ei prioriteettia parhaimmalle osumalle — vain lajittelu etäisyyden mukaan.

### Puute 5: `getStorageLocations()` on organisaatiokohtainen
```kotlin
fun getStorageLocations(orgId: String): List<StorageLocation>
// WHERE organizationId = orgId
```
Varastopaikkoja ei voi hakea **koordinaateilla** tai **place_id:llä**. Ei ole metodia "hae lähin varastopaikka koordinaateista X, Y säteellä Z km". Tämä on se puuttuva linkki, joka estää mikrovaraston reititysehdotuksen.

### Puute 6: Matching-tulos on ohimenevä UI-tila
`potentialMatches` on `remember { mutableStateOf(...) }` AddLostItemScreen-composablessa — se häviää, kun screen suljetaan. Ei persistointia, ei historiatietoa, ei mahdollisuutta palata matcheihin myöhemmin.

---

## 5. Laajennettavuusarvio: CIRCULAR_OFFER ja CIRCULAR_WANTED

Nykyinen `getPotentialMatches()` on laajennettavissa **rikkomatta nykyistä LOST/FOUND-toimintaa** seuraavasti:

```kotlin
// Laajennettu kategoriamatch (ehdotus)
val oppositeCategory = when (newCategory) {
    ItemCategory.LOST            -> ItemCategory.FOUND
    ItemCategory.FOUND           -> ItemCategory.LOST
    ItemCategory.CIRCULAR_OFFER  -> ItemCategory.CIRCULAR_WANTED
    ItemCategory.CIRCULAR_WANTED -> ItemCategory.CIRCULAR_OFFER
    ItemCategory.DELIVERED       -> return emptyList() // ei matchausta
}
```

Aikasuodatus muuttuu kiertotaloudessa:
- LOST/FOUND: `incidentDate`-pohjainen (mitä tapahtui milloin)
- CIRCULAR_OFFER: `deadlineAt`-pohjainen (milloin eroon päästy viimeistään)
- CIRCULAR_WANTED: `expiresAt`-pohjainen (kuinka kauan hakija on vielä kiinnostunut)

---

## 6. Firebase vs. Supabase: vastuunjako nyt ja tulevaisuudessa

| Toiminto | Nyt | Suositus jatkossa |
|---|---|---|
| `lostItems`-kokoelma | Firestore | Jää Firestoreen (LOST/FOUND toimii) |
| `storage_locations` | Firestore | Siirrettävä Supabaseen (koordinaattihaku) |
| `matches`-taulu | Ei ole | Supabase (relaatiot, scoring) |
| `taxonomy_*`-taulut | Ei ole | Supabase |
| `item_attributes` | Ei ole | Supabase |
| Paikkatietokyselyt | Client-side Haversine | Supabase + PostGIS `ST_DWithin()` |
| CIRCULAR_OFFER/WANTED-ilmoitukset | Ei ole | Harkittava: Firestore (yhtenäisyys) vai Supabase (tehokkuus) |

---

## 7. Suositus: mitä tehdään seuraavaksi

### Vaihe A — Ei koodimuutoksia, vain valmistelu (1–2 päivää)

1. Lisätään `val placeId: String? = null` → `StorageLocation.kt`
2. Lisätään `CIRCULAR_OFFER`, `CIRCULAR_WANTED` → `ItemCategory.kt`
3. Lisätään `deadlineAt: Timestamp?`, `condition: String?`, `preferredPickup: String?` → `LostItem.kt`
4. Luodaan Supabaseen `matches`-taulu (tyhjä, ei vielä logiikkaa)

**Nämä muutokset eivät riko mitään** — kaikki uudet kentät ovat nullable, olemassa olevat Firestore-dokumentit deserialisoituvat edelleen oikein.

### Vaihe B — `getPotentialMatches()` -laajennos (2–3 päivää)

1. Laajennetaan kategoria-switch `CIRCULAR_OFFER ↔ CIRCULAR_WANTED`.
2. Lisätään `deadlineAt`-aikasuodatus kiertotalousilmoituksille.
3. Lisätään yksinkertainen tagi-overlap laskenta: `tags.intersect(otherTags).size / tags.union(otherTags).size` → `matchScore`
4. Palautetaan `Pair<LostItem, Float>` (ilmoitus + pisteet) LOST/FOUND:ille voidaan palauttaa pisteet `1.0f` (binäärinen kuten nyt).

### Vaihe C — Mikrovaraston kytkentä (2–3 päivää)

1. Lisätään `getStorageLocationsNearby(lat, lon, radiusKm)` → `FirebaseService.kt` (tai Supabase-kysely jos `storage_locations` siirretty).
2. Kun CIRCULAR-match löytyy mutta `deadlineAt` tai etäisyys estää suoran nouttoa → haetaan lähin varastopaikka.
3. Ehdotus matchingdialogissa: "Sopiva varastopiste löytyi X km päässä."

---

## 8. Yhteenveto: kriittisimmät havainnot

```
SÄILYTETÄÄN SELLAISENAAN:
✅ haversineDistance() — tarkka, toimii
✅ incidentDate-fallback-logiikka — periyttyy deadlineAt-käyttöön
✅ expiresAt-suodatus — toimii myös kiertotaloudessa
✅ open-avainsana — laajennettava, mockattava

LAAJENNETAAN:
⚠️ Kategoria-switch: CIRCULAR_OFFER ↔ CIRCULAR_WANTED lisätään
⚠️ Aikalogiikka: deadlineAt kiertotalousilmoituksille
⚠️ Pisteytys: tagi-overlap match_confidence-arvoksi

RAKENNETAAN UUTENA (Supabaseen):
🆕 matches-taulu — persistoitu match-historia
🆕 getStorageLocationsNearby() — koordinaattipohjainen varastohaku
🆕 taxonomy_* — myöhemmässä vaiheessa

ARKKITEHTUURINEN VELKA (ei akuutti):
⚡ Matching-logiikka ViewModeliin, pois Composablesta
⚡ Taustaprosessi vanhojen ilmoitusten uudelleenmatchaukseen
⚡ Firestore client-side suodatus → Supabase server-side (skaalautuvuus)
```

---

*Auditointi tehty koodipohjaisesti — 20.11.2026*  
*Tiedostot: `FirebaseService.kt` (r. 113–176, 1524–1570), `AddLostItemScreen.kt` (r. 492–630), `LostFoundViewModel.kt`*

