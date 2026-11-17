# Wonderin: Google Photos -integraatio, kommentointi ja yhteisöpisteet (Community POI)

Tämä dokumentti kuvaa arkkitehtuurin ja kehityssuunnitelman käyttäjälähtöiselle sisällöntuotannolle Wonderin-sovelluksissa (Web ja Android) sekä TARINAKartta-editorissa.

---

## 1. Yhteenveto & Tavoite

Tavoitteena on mahdollistaa käyttäjien osallistuminen reittikokemukseen kahdella tasolla:
1. **Kohteiden kommentointi ja kävijäkuvat:** Kävijät voivat lisätä havaintoja, ajantasaisia tilannetietoja (esim. kukinta, polun kunto) ja omia kuviaan virallisiin elämyspisteisiin.
2. **Uudet yhteisöpisteet (Community Points):** Kävijät voivat lisätä kartalle omia vinkkejään, taukopaikkoja tai muistoja omalla teemavärillään (esim. oranssi/keltainen).

---

## 2. Kuvalähteet: Google Photos vs. Suora mobiililataus

### Vertailu toteutustavoista

| Ominaisuus | Vaihtoehto A: Google Photos -jakolinkki | Vaihtoehto B: Suora lataus puhelimesta (Photo Picker + CDN) |
| :--- | :--- | :--- |
| **Käyttökokemus maastossa** | **Hankala:** Käyttäjän täytyy poistua sovelluksesta, avata Google Kuvat, luoda jakolinkki, kopioida leikepöydälle ja palata Wonderiin liittämään se. | **Saumaton:** Paina *"Lisää kuva"* -> kamera avautuu tai kuva valitaan galleriasta yhdellä kosketuksella. |
| **Google Kuvat -tuki** | Riippuu julkisesta jaetusta linkistä (`resolve-gphoto.php`). | **Automaattinen Androidissa:** Androidin virallinen *Photo Picker* näyttää käyttäjän Google Kuvat suoraan ilman API-tunnuksia. |
| **API & OAuth -vaatimukset** | Googlen Photos API vaatii tiukan OAuth2-kirjautumisen ja API-kiintiöt. | Ei vaadi Google-tiliä eikä kirjautumismuureja sovelluksen sisällä. |
| **Linkkien pysyvyys** | Googlen väliaikaiset `lh3.googleusercontent.com` -osoitteet voivat vanhentua tai poistua, jos käyttäjä poistaa albumin jaon. | Kuvat tallennetaan pysyvästi Wonderin Supabase Storageen / CDN:ään mobiilioptimoituna (WebP, max 1600px). |

### Suositeltu hybridimalli
- **Mobiili- ja loppukäyttäjille:** Suora kuvavalitsin puhelimesta (kamera tai galleria/Google Kuvat), josta kuva optimoidaan ja lähetetään suoraan Supabase Storageen.
- **Sisällöntuottajille ja TARINAKartta-editorille:** Säilytetään ja hyödynnetään nykyistä `resolve-gphoto.php`-ratkaisua, jolla reitintekijä voi liittää valmiita Google Photos -albumeita suoraan linkillä.

---

## 3. Käyttötapaukset

### Taso A: Elämyspisteen kommentointi & kävijäkuvat
- Käyttäjä avaa reitin virallisen pisteen (esim. *Saraakallio* tai *Tervamäen kappeli*).
- Pisteen infonäkymässä on osio: **"Kävijöiden havainnot ja kuvat"**.
- Käyttäjä voi syöttää:
  - Nimimerkin
  - Lyhyen kommentin / havainnon
  - Kuvan (vapaaehtoinen)
- Kuva ja teksti tallentuvat pisteen alle ja rikastuttavat kohdetta ilman, että kartalle tarvitsee luoda uutta pistettä.

### Taso B: Uudet yhteisöpisteet kartalle (Crowd-sourced POI)
- Käyttäjä on maastossa ja huomaa mielenkiintoisen paikan.
- Painetaan kartan **"+" (Lisää yhteisöpiste)** -painiketta:
  - Sovellus lukee käyttäjän nykyisen GPS-sijainnin (tai antaa siirtää nuppia kartalla).
  - Valitaan kategoria: *Luontohavainto*, *Taukopaikka / Laavu*, *Historiallinen muisto*, *Reittihuomio (esim. este/puu tiellä)*.
  - Lisätään otsikko, lyhyt kuvaus, kuva ja nimimerkki.
- Kartalle ilmestyy **oranssi/keltainen yhteisöpiste**, joka erottuu virallisista vihreistä elämyspisteistä.
- Kartalla on suodatin: `[X] Näytä yhteisöpisteet`, jolla ne saa tarvittaessa piiloon.

---

## 4. Tietokantarakenne (Supabase)

```sql
-- 1. Pisteiden kommentit ja kävijäkuvat
CREATE TABLE IF NOT EXISTS point_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    point_id UUID REFERENCES points(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    comment TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'approved', -- 'approved' | 'pending' | 'hidden'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Itsenäiset yhteisöpisteet
CREATE TABLE IF NOT EXISTS community_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE, -- mihin reittiin liittyy (tai NULL jos vapaa)
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    author_name TEXT NOT NULL,
    category TEXT DEFAULT 'observation', -- 'observation' | 'story' | 'rest_area' | 'notice'
    status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'hidden'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hakujen optimointi
CREATE INDEX IF NOT EXISTS idx_point_contributions_point_id ON point_contributions(point_id);
CREATE INDEX IF NOT EXISTS idx_community_points_route_id ON community_points(route_id);
```

---

## 5. Moderointi ja sisällönhallinta

1. **Julkaisumallit reittikohtaisesti:**
   - **Avoin yhteisö:** Kommentit ja kuvat ilmestyvät suoraan näkyviin. Käyttäjillä on *"Ilmoita asiaton sisältö"* -toiminto.
   - **Moderoitu yhteisö:** Pisteet menevät `pending`-tilaan, kunnes reitin omistaja hyväksyy ne TARINAKartta-editorissa.
2. **Editorin hallintanäkymä (TARINAKartta-editor):**
   - Reitin hallinnassa näkyy lista reitille jätetyistä yhteisöpisteistä ja kommenteista.
   - **"Hyväksy viralliseksi pisteeksi" -toiminto:** Tekijä voi yhdellä klikkauksella siirtää loistavan käyttäjän lisäämän yhteisöpisteen pysyväksi viralliseksi elämyspisteeksi (`points`-tauluun).

---

## 6. Vaiheistus (Toteutuspolku)

1. **Vaihe 1: Elämyspisteiden kommentit & kävijäkuvat (MVP)**
   - Pisteen infonäkymään (Web & Android) kommentointilomake ja kuvien selaus.
   - Tallennus Supabaseen (`point_contributions`).
2. **Vaihe 2: Omien yhteisöpisteiden lisäys maastossa**
   - Kartalle "+" -painike maastossa GPS-paikannuksella.
   - Erillinen oranssi visuaalinen ilme yhteisöpisteille kartalla.
3. **Vaihe 3: Editori-integraatio & moderointi**
   - TARINAKartta-editoriin yhteisöpisteiden hallinta ja moderointityökalut.

