# LaukaaInfo-livescreen — Uusien testisivujen vertailu & tulokset

> Kirjattu 11.11.2026 | Testiversiot kehitysidean #1 ("Yksi sivupohja per sisältötyyppi") pohjalta

---

## 1. Tausta ja toteutus

Kehitysideoiden kohdan #1 pohjalta luotiin kaksi dynaamista, kevyttä testipohjaa korvaamaan aiemmat raskaat ja monimutkaiset sivurakenteet:

1. **`kohdekortti-testi.html`**
   - Yksittäisen ilmoituksen, tapahtuman tai tarjouksen dynaaminen esityspohja (`posts`-taulu).
   - Käyttö: `kohdekortti-testi.html?id=<POST_UUID>` tai `?place=<PLACE_UUID>`
2. **`tietoa-paikasta-testi.html`**
   - Paikan tai alueen kattava tietopohja (`places`-taulu).
   - Käyttö: `tietoa-paikasta-testi.html?id=<SLUG_TAI_PLACE_ID_TAI_UUID>` (esim. `?id=Peurunka`, `?id=Saraakallio`, `?id=Hitonhauta`)

Molemmat sivut lukevat datan suoraan Supabasesta URL-parametrin perusteella ilman kovakoodattuja valikoita (`demo-selector`).

---

## 2. Keskeiset hyödyt nykytoteutukseen verrattuna

### 1. Suorituskyky ja koodin keveys (yli 80–90 % kevyempi)
- **Nykytilanne:** `kohdekortti.html` on kooltaan n. **155 kB** ja vanha `tietoa-paikasta.html` n. **99 kB**. Sivut sisältävät mittavan määrän legacy-CSS:ää, raskaasti latautuvia oheisskriptejä sekä kovakoodattuja vaihtoehtolistoja.
- **Uusi ratkaisu:** Testipohjat ovat kooltaan vain **15–20 kB** per sivu. Sivut avautuvat heti ilman viivettä myös heikommilla mobiiliyhteyksillä ja minimoivat selaimen muistinkulutuksen.

### 2. Aito URL- ja jakolinkkivetoisuus (Deep Linking & Natiivijako)
- **Nykytilanne:** Sivut ovat nojanneet sisäiseen tilaan tai valikkovalintoihin. Linkin jakaminen toiselle käyttäjälle ei aina kohdistunut oikeaan kohteeseen tai esikatselu oli puutteellinen.
- **Uusi ratkaisu:** Sivun sisältö määräytyy 100 % URL-osoitteen `?id=`-arvon mukaan. Mukana on **natiivi jako-ominaisuus** (`navigator.share` mobiilissa, leikepöydälle kopiointi tietokoneella).

### 3. Dynaaminen SEO ja Open Graph -metatiedot
- **Nykytilanne:** Sivujen `<title>` ja `<meta description>` olivat usein staattisia yleistekstejä.
- **Uusi ratkaisu:** Sivupohja päivittää selaimen välilehden otsikon, kuvaustekstin ja sosiaalisen median esikatselukuvat (`og:title`, `og:description`, `og:image`, `canonical`) lennosta haetun paikan tai ilmoituksen tiedoista.

### 4. Skaalautuva arkkitehtuuri ilman HTML-muutoksia
- **Nykytilanne:** Uuden alueen, kohteen tai ilmoitustyypin esittäminen on vaatinut usein uusia HTML-tiedostoja tai olemassa olevien tiedostojen koodimuutoksia.
- **Uusi ratkaisu:** Yksi geneerinen pohja riittää. Uuden paikan lisääminen järjestelmään vaatii ainoastaan uuden rivin Supabasen tietokantaan – sivusto osaa näyttää sen välittömästi.

### 5. Saumattomat ristiinlinkitykset (Wonderin, tapahtumat, toimijat)
- **Nykytilanne:** Tapahtumat, reitit ja yritykset ovat olleet osittain irrallaan omissa näkymissään.
- **Uusi ratkaisu:** `place_id` toimii liimana. `tietoa-paikasta-testi.html` yhdistää automaattisesti:
  - Paikan perustiedot ja koordinaatit Leaflet-kartalle
  - Tulevat tapahtumat ja ilmoitukset kohteesta (linkit `kohdekortti-testi.html`-pohjaan)
  - Alueeseen liittyvät **Wonderin-äänireitit** suorilla linkeillä reittisoittimeen
  - Paikkaan rekisteröidyt yritykset ja palvelut (`place_relations`)
  - Ulkoiset mediat (YouTube-upotukset ja kuvagalleriat)

### 6. Hallitut lataus- ja virhetilat (UX)
- **Nykytilanne:** Jos tietokantahaussa tuli häiriö tai id puuttui, sivu saattoi jäädä tyhjäksi tai rikkoutua ilman selitystä.
- **Uusi ratkaisu:** Selkeä tilakone:
  - Latausanimaatio haun aikana
  - Informatiivinen virheilmoitus ("Paikkaa ei löytynyt tunnuksella X") ja paluupainike, jos parametria ei löydy tai yhteys katkeaa.

---

## 3. Vertailutaulukko

| Ominaisuus | Nykytoteutus (`kohdekortti.html` / `tietoa-paikasta.html`) | Uusi toteutus (`*-testi.html`) |
| :--- | :--- | :--- |
| **HTML-koko** | ~100–155 kB | **~15–20 kB** (-85 %) |
| **Valikkoriippuvuus** | Vaatinut `demo-selector`-valikon tai kiinteitä listoja | **Täysin URL-ohjattu (`?id=`)** |
| **Uuden kohteen lisäys** | Vaatinut usein koodipäivityksiä | **Pelkkä tietokantarivi riittää** |
| **SEO & OpenGraph** | Puolittainen / staattinen | **Täysin dynaaminen** |
| **Sosiaalisen median jako** | Rajoitettu / puuttuva | **Natiivi mobiilijako + linkkikopiointi** |
| **Monisovelluslinkitys** | Hajallaan | **Yhtenäinen `place_id`-ekosysteemi** |
| **Lataustilat** | Epäyhtenäiset | **Selkeä lataus- ja virhetilakone** |

---

## 4. Testilinkit

### `tietoa-paikasta-testi.html`
- `?id=Peurunka`
- `?id=Saraakallio`
- `?id=Hitonhauta`
- `?id=Lievestuore`
- `?id=laukaan-kirkko`

### `kohdekortti-testi.html`
- `?id=<POST_UUID>`
- `?place=<PLACE_UUID>`

---

## 5. Suositus jatkotoimiksi

1. **Testaus & käyttäjäpalaute:** Testataan mobiililaitteilla ja varmistetaan visuaalinen ilme.
2. **Tuotantoon siirtäminen:** Korvataan vanhat raskaat tiedostot näillä uusilla pohjilla tai ohjataan liikenne niihin.
3. **Monikielisyys (Kehitysidea #2):** Lisätään pohjiin `data-i18n`-tuki ja kielitiedostot (`?lang=en`).

