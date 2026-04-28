# LaukaaInfo Palvelupolut: Ohje ja Profilointi

Tämä ohje auttaa ymmärtämään LaukaaInfo-livescreenin palvelupolkujen rakenteen ja sen, miten yritykset tulisi profiloida, jotta ne näkyvät oikeissa kohdissa ja oikealla prioriteetilla.

---

## 1. Miten haku ja sijoittuminen toimii?

Järjestelmä käyttää kolmitasoista logiikkaa yritysten etsimiseen:

*   **Pääkonteksti (`fits_for`):** Jokaisella palvelupolulla on oma avain (esim. `häät`). Mitä korkeammat pisteet (0–100) yrityksellä on tässä kohdassa, sitä ylempänä se näkyy hakutuloksissa.
*   **Tarkentavat tarpeet (`sub_contexts` ja `tags`):** Kun käyttäjä valitsee polulla tietyn vaihtoehdon (esim. "Valokuvaaja"), järjestelmä etsii yrityksiä, joiden `sub_contexts`-listalta löytyy vastaava sana tai joiden avainsanoissa (`tags`) se esiintyy.
*   **Profilointisuodattimet (`profilointi_filter`):** Joissakin valinnoissa on tiukka suodatin. Esimerkiksi jos käyttäjä etsii "Drone-kuvausta", järjestelmä tarkistaa yrityksen profiilista, onko `drone_available` asetettu arvoon `true`.

---

## 2. Palvelupolut ja niiden vaihtoehdot

Tässä on listaus nykyisistä palvelupoluista ja siitä, mitä yritykseltä vaaditaan niihin pääsemiseksi.

### 💒 Häät (`haat`)
*   **Pääkonteksti:** `fits_for: { "häät": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Juhlatila:** `sub_contexts: ["juhlatila"]`, `capacity_max` (henkilömäärä).
    *   **Kartano:** `sub_contexts: ["kartano"]`.
    *   **Luonnonläheinen tila:** Profiilissa `is_lakeside: true`.
    *   **Pitopalvelu:** `sub_contexts: ["pitopalvelu"]`.
    *   **Valokuvaus:** Profiilissa `wedding_photography: true`.
    *   **Kukat:** `sub_contexts: ["kukkakauppa"]`.
    *   **Musiikki/DJ:** Profiilissa `live_music: true`.
    *   **Majoitus:** `sub_contexts: ["majoitus"]`.
    *   **Videotuotanto/Drone:** Profiilissa `video_production: true` tai `drone_available: true`.

### 🕯️ Hautajaiset (`hautajaiset`)
*   **Pääkonteksti:** `fits_for: { "hautajaiset": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Hautauspalvelu:** `sub_contexts: ["hautauspalvelu"]`.
    *   **Rauhallinen muistotila:** Profiilissa `quiet_private_space: true`.
    *   **Pitopalvelu/Catering:** Profiilissa `memorial_catering: true`.
    *   **Kukat:** Profiilissa `funeral_flowers: true`.
    *   **Kuljetus:** Profiilissa `transport_assistance: true`.
    *   **Digitointi:** `sub_contexts: ["digitointi"]`.

### 🥂 Yritysjuhlat ja 💼 Kokoukset (`yritysjuhlat`, `kokoukset`)
*   **Pääkonteksti:** `fits_for: { "yritysjuhlat": XX, "kokoukset": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Kokous/Seminaaritilat:** `sub_contexts: ["kokoustilat", "seminaaritilat"]`, `meeting_capacity`.
    *   **Tyky-päivä/Ohjelma:** `sub_contexts: ["ohjelmapalvelut", "tyky-paiva"]`.
    *   **AV-tekniikka:** Profiilissa `av_support: true` tai `has_projector: true`.
    *   **Saunatilat:** Profiilissa `has_sauna: true`.
    *   **Yrityshyvinvointi:** Profiilissa `corporate_wellbeing_services: true`.

### 🎂 Syntymäpäivät (`syntymapaivat`)
*   **Pääkonteksti:** `fits_for: { "syntymäpäivät": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Lasten juhlat:** `sub_contexts: ["lasten synttärit"]`.
    *   **Kakut/Leivonnaiset:** Profiilissa `cake_service: true` tai `sub_contexts: ["leipomo"]`.
    *   **Ohjelma/Esiintyjä:** Profiilissa `live_music: true`.

### 📦 Muutto ja 🔨 Remontti (`muutto`, `remontti`)
*   **Pääkonteksti:** `fits_for: { "muutto": XX, "remontti": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Muuttopalvelu:** `sub_contexts: ["muuttopalvelu"]`.
    *   **Siivous:** Profiilissa `cleaning_after_move: true`.
    *   **Sähköasennukset:** Profiilissa `electrician_available: true`.
    *   **LVI/Putkimies:** `sub_contexts: ["LVI"]`.
    *   **Pintaremontti:** `sub_contexts: ["pintaremontti", "maalaustyöt"]`.

### 🏡 Mökkipalvelut (`mokkipalvelut`)
*   **Pääkonteksti:** `fits_for: { "mökkipalvelut": XX }`
*   **Vaihtoehdot ja vaatimukset:**
    *   **Talvivalvonta/Avainpalvelu:** Profiilissa `key_holding: true`.
    *   **Laiturihuolto:** Profiilissa `dock_maintenance: true`.
    *   **Polttopuut:** `sub_contexts: ["polttopuut"]`.

---

## 3. Miten yrityksiä kannattaa profiloida?

Yrityksen profilointi tehdään `company_profiling_data.json` -tiedostoon. Seuraa näitä askeleita:

### Vaihe 1: Aseta sopivuuspisteet (`fits_for`)
Mieti, mihin tilanteisiin yritys sopii parhaiten.
*   **80–100:** Yritys on erikoistunut tähän (esim. Hääkuvaajalle `häät: 95`).
*   **40–79:** Yritys tarjoaa palveluita tähän, mutta se ei ole päätoimiala (esim. Monitoimihallille `häät: 50`).
*   **10–39:** Yritys voi auttaa, mutta on "sivuosumana" (esim. IT-yritykselle `häät: 20` digitoinnin takia).

### Vaihe 2: Määritä tarkentavat roolit (`sub_contexts`)
Lisää listaan sanat, jotka kuvaavat yrityksen tarjoamia ratkaisuja. Käytä **pieniä alkukirjaimia** ja **yksikkömuotoa**.
*   *Esimerkki:* `["digitointi", "valokuvaus", "pitopalvelu", "juhlatila"]`.

### Vaihe 3: Täytä tekniset profiilikentät
Jos yritys tarjoaa jotain erityistä, varmista että vastaava profiilikenttä on `true`.
*   *Esimerkki:* Jos yrityksellä on sauna, aseta `events_and_celebrations: { "has_sauna": true }`.
*   *Esimerkki:* Jos yritys tekee häämeikkejä, aseta `wellbeing_and_beauty: { "bridal_services": true }`.

### Vaihe 4: Estä väärät osumat (`not_suitable_for`)
Jos yritys on esimerkiksi ravintola, se saattaa tulla hakuun tageilla "ruoka", mutta se ei kuulu "muutto"-polkuun.
*   *Esimerkki:* `"not_suitable_for": ["muutto", "remontti"]`.

---

## 4. Muistilista tarkistukseen
1.  **Onko avain kirjoitettu oikein?** Käytä väliviivoja: `yrityksen-kehittäminen`, ei välilyöntejä.
2.  **Onko kapasiteetti ilmoitettu?** Jos kyseessä on tila, `capacity_max` on pakollinen, jotta yritys näkyy henkilömäärään perustuvissa hauissa.
3.  **Onko pisteet suhteessa muihin?** Jos kaikki saavat 100 pistettä, järjestys on satunnainen. Käytä pisteitä kertomaan, kuka on todellinen asiantuntija.
