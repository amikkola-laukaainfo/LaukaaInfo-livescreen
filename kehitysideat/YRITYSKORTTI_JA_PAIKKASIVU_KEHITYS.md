# LaukaaInfo – Paikkasivun ja Yrityskortin Kehitysdokumentaatio

Tämä dokumentti kokoaa yhteen marraskuussa 2026 toteutetut visuaaliset, rakenteelliset ja arkkitehtoniset uudistukset LaukaaInfon paikkasivulle (`tietoa-paikasta.html`) ja yrityskortille (`yrityskortti.html`), sekä varautumisen tulevaan Wonderin-yhteisöpisteeseen ja yrittäjän omapäivitettävään lohkoon.

---

## 1. Paikkasivu (`tietoa-paikasta.html`) – 3-tasoinen elävä näkymä

Paikkasivu ei ole staattinen tietolomake, vaan **paikan sisältöjen mukaan dynaamisesti elävä kokonaisuus**, joka jäsentyy kolmeen loogiseen tasoon:
1. **Mikä tämä paikka on?** – Perustiedot ja paikan tunnistaminen.
2. **Mitä täällä tapahtuu nyt?** – Ajankohtaisuus, uutiset ja ihmisten tuottama reaaliaikainen sisältö.
3. **Mitä täällä voi kokea ja löytää?** – Pysyvämpi sisältö, reitit, verkosto ja historia.

### Työpöytänäkymän 2-palstainen rakenne (`grid-template-columns: 1.5fr 1fr`):

#### Vasen pääsarake (`.left-col`):
1. **Tietoa paikasta** (`#intro-section`) – AI-yhteenveto ja perustiedot
2. **Tähän paikkaan kuuluu** (`#subplaces-section`) – Alikohteet (näkyy vain jos alikohteita on)
3. **Ajankohtaista täällä** (`#wall-posts-section`) – Seinäjulkaisut ja tuoreet uutiset
4. **Viimeisimmät havainnot** (`#timeline-section`) – LostReFound-maastohavainnot
5. **Tapahtumat lähellä** (`#place-kse-events`) – Keski-Suomen tapahtumakalenteri
6. **Ilmoitukset ja tarjoukset** (`#encounters-section`) – Tori-ilmoitukset ja kohtaamiset
7. **Tähän paikkaan liittyy** (`#services-main-section`) – Reitit, elämykset, yritykset ja kumppanit
8. **Kuvat paikasta** (`#media-section`) – Visuaalinen kuvagalleria
9. *Varaus & Mixonet-projektit/ideat*

#### Oikea sivupalkki (`.sidebar`):
1. 🧗 **Mitä täällä voi tehdä?** (`#activities-section`)
2. 👥 **Sopii erityisesti** (`#visitor-types-section`)
3. 📍 **Lähipaikat** (`#nearby-places-section`)
4. 🗺️ **Kartta** (`#map-section`) – *Nostettu heti lähipaikkojen perään!*
5. 🌲 **Liittyy teemoihin** (`#themes-section`)
6. ⏳ **Aikamatka ja historia** (`#memories-section`)
7. ❓ **Usein kysyttyä** (`#faq-section`)
8. 📊 **Verkoston tilanne** (`#mixonet-network-banner` + `#network-stats-section`)
9. 🤝 **Osallistu** (`#participate-section`)

### Mobiilijärjestys (`@media (max-width: 992px)`):
Mobiilissa lohkot asettuvat yhteen jatkuvaan ja optimoituun virtaan:
1. Hero & perustiedot $\rightarrow$ 2. Tietoa paikasta $\rightarrow$ 3. Tähän paikkaan kuuluu $\rightarrow$ 4. Ajankohtaista $\rightarrow$ 5. Viimeisimmät havainnot $\rightarrow$ 6. Tapahtumat lähellä $\rightarrow$ 7. Ilmoitukset ja tarjoukset $\rightarrow$ 8. Mitä voi tehdä $\rightarrow$ 9. Lähipaikat $\rightarrow$ 10. Kartta $\rightarrow$ 11. Sopii erityisesti $\rightarrow$ 12. Kuvat $\rightarrow$ 13. Palvelut ja yritykset $\rightarrow$ 14. Teemat $\rightarrow$ 15. Aikamatka ja historia $\rightarrow$ 16. Usein kysyttyä $\rightarrow$ 17. Verkostotilanne $\rightarrow$ 18. Osallistu.

### Sisällön mukaan elävä logiikka & osallistamiskutsu:
- **Maastohavainnot (LostReFound):** Jos paikalla ei ole vielä havaintoja, lohkoa ei piiloteta, vaan näytetään käyttäjää aktivoiva kutsu:
  > *”Tälle paikalle ei ole vielä ilmoitettu havaintoja. Huomasitko jotain luonnossa tai reitillä? Lisää ensimmäinen havainto!”* `[ + Ilmoita havainto ]`
- **Historia & muistot:** Jos paikkaan ei liity toimituksellista tai historiallista materiaalia, lohko pysyy täysin piilossa (`display: none`), jotta sivulle ei synny harmaita tyhjiä laatikoita.

---

## 2. Yrityskortti (`yrityskortti.html`) – Muotoilu ja koherenssi

Yrityskortin visuaalinen ilme yhtenäistettiin vastaamaan `tietoa-paikasta-testi.html` ja `reitti.html` sivujen modernia ja raikasta design-kieltä.

### Välilehtien uudelleennimeäminen:
- *Digitaalinen käyntikortti* $\rightarrow$ **Etusivu** (`#btn-tab-business-card`)
- *Laaja esittelyprofiili* $\rightarrow$ **Tiedot** (`#btn-tab-extended-profile`)
- **Lisätiedot** (`#btn-tab-ai-info`)
- **Paikat** (`#btn-tab-places`)

### Välilehtien mobiili sivuslider:
- Mobiilissa välilehdet on kiedottu vaakasuuntaiseen pyyhkäistävään slideriin (`.tab-container` / `.tab-slider-wrapper`):
  - `overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory;`
  - Painikkeet eivät enää litisty tai katkea, vaan pysyvät luettavina (`flex: 0 0 auto; white-space: nowrap;`).
  - Kaikki 4 välilehteä (mukaan lukien **Paikat**) ovat aina saavutettavissa puhelimilla.
  - Välilehteä napautettaessa se keskittyy ruutuun automaattisesti (`scrollIntoView`).

### Mobiiliyläosa (Hero & Logo):
- **Hillitty luonne:** Yläosa ei veny liian korkeaksi lohkoksi (`min-height: 180px`).
- **Tasaus vasempaan yläreunaan:**
  - Yrityksen nimi on vasemmassa yläkulmassa isommalla fontilla (`Outfit`, `clamp(1.4rem, 5.5vw, 1.85rem)`).
  - Sen alla vasempaan reunaan tasattuina kategoria-badge, katuosoite, kunta ja tähtiarviot.
- **Kompakti logo:**
  - Siirretty mobiilissa tyylikkääksi 60×60 px merkiksi oikeaan yläkulmaan (`position: absolute; top: 1.15rem; right: 1.15rem`).
  - Logo ei pakkaudu tai taistele tilasta otsikon kanssa, vaan pysyy rauhallisena ja tyylikkäänä.

### Laaja esittelyprofiili ("Tiedot"):
- **Järjestys:**
  1. **Esittelyteksti** (`.description-section` / `#display-description`) tulee nyt **ensimmäisenä**.
  2. **Kuvaslideri ja galleria** (`.gallery-container`) esitetään tekstin jälkeen.
  3. **Video** (`#video-section`).
  4. **Yhteystiedot ja kartta** (`#info-panel`).

---

## 3. Varautuminen tulevaan

### A. Omapäivitettävä lohko (`#company-self-service-block`)
- Yrityskortin etusivulle lisättiin valmis lohko yrittäjän itsepalvelusisällölle:
  - Tunniste: `#company-self-service-block`
  - Luokat: `.bc-block .owner-update-block`
  - Data-attribuutti: `data-wonderin-section="owner-announcement"`
  - Tila: Oletuksena piilossa (`display: none`), joten se voidaan aktivoida heti, kun yrittäjän päivitysrajapinta tai tietokantakenttä valmistuu.

### B. Wonderin-yhteisöpisteen sisällönluku
- Yrityskortin lohkoihin lisättiin semanttiset `data-wonderin-section` -attribuutit:
  - `basic-info`: Yrityksen nimi, logo, kategoria ja lyhytosoite
  - `quick-actions`: Pikatoiminnot (soita, reitti, www, WhatsApp)
  - `services`: Tarjotut palvelut / avainkyvykkyydet
  - `news`: Ajankohtaiset tiedotteet ja uutiset
  - `intro`: Yrittäjän esittelylausahdus
  - `ai-summary`: Tekoälyn koostama tiivistelmä
  - `encounters`: Kohtaamispaikan ilmoitukset ja tarjoukset
  - `extended-profile`: Laajempi esittelyteksti ja galleria
- **JavaScript API-lukutoiminto:**
  - Lisätty globaali funktio: `window.getWonderinCompanyData()`
  - Palauttaa siistin JSON-rakenteen (nimi, kategoria, osoite, puhelin, kotisivut, logo, esittely, palvelut, aikaleima), jolloin tuleva Wonderin-yhteisöpiste tai sovellus voi lukea tiedot koneellisesti yhdellä kutsulla.

---

## 4. Android-sovelluksen kehitysaskeleet (LaukaaLive)

- **Tapahtumat lähellä -sädevalitsin (`PlaceDetailScreen.kt`):**
  - Paikkasivulle toteutettu reaaliaikainen sädevalitsin (`500 m` | `3 km` | `5 km`).
  - Hakee taustalla tapahtumia 5000 metriin asti ja suodattaa näkymää muistissa välittömästi ilman uutta verkkoviiveestä kärsivää kyselyä.
- **Viimeisimmät haut (`HakuScreen.kt` & `RecentPlacesManager.kt`):**
  - Hakusivun hakukentän alapuolelle lisätty 5 viimeisimmän avatun kohteen muisti/ehdotuslista pikanappeina.
