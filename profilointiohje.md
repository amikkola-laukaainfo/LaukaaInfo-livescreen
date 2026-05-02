# Yritysten Profilointiohje ja Hakulogiikka

Tämä ohje selittää, miten LaukaaInfo-livescreenin palvelupolkujärjestelmä (palvelu.html) etsii ja asettaa yrityksiä paremmuusjärjestykseen.

## 1. Miten hakulogiikka toimii?

Haku perustuu kolmeen vaiheeseen:

1.  **Profilointisuodatin (Vahvin):** Jos palvelupolun valinnassa on määritetty `profilointi_filter` (esim. "digitointi"), järjestelmä tarkistaa ensin yrityksen profiilin. Jos profiilista löytyy vastaava tieto, yritys otetaan mukaan riippumatta sen tageista. Jos profiili on olemassa mutta tieto ei täsmää, yritys hylätään heti.
2.  **Tagi-haku (Fallback):** Jos yrityksellä ei ole profilointitietoa kyseisestä aiheesta, järjestelmä etsii perinteisiä avainsanoja (tagit, nimi, kategoria).
3.  **Sijoitus (Ranking):** Tulokset järjestetään `fits_for`-pisteiden mukaan. Mitä korkeampi pistemäärä yrityksellä on valittuun kontekstiin (esim. `hautajaiset`), sitä ylempänä se näkyy.

## 2. Profiloinnin parhaat käytännöt

### Core (Ydin) -osio
Tämä on tärkein osio jokaiselle yritykselle tiedostossa `company_profiling_data.json`.

*   **`fits_for`**: Määritä soveltuvuus eri elämäntilanteisiin. Käytä avaimina seuraavia (huom: käytä väliviivoja, ei välilyöntejä):
    *   `häät`, `hautajaiset`, `yritysjuhlat`, `kokoukset`, `syntymäpäivät`, `muutto`, `remontti`, `mökkipalvelut`, `yrityksen-perustaminen`, `yrityksen-kehittäminen`, `vapaa-aika`.
    *   *Esimerkki:* `"häät": 90` (Yritys on hääasiantuntija).
*   **`sub_contexts`**: Tämä on "silta" palvelupolun valintojen ja yrityksen välillä. Lisää tähän tarkempia palveluita.
    *   *Esimerkki:* `["digitointi", "valokuvaus", "catering"]`.
*   **`not_suitable_for`**: Estä yrityksen näkyminen täysin väärissä paikoissa.
    *   *Esimerkki:* `["muutto"]` (Jos yritys on ravintola, se ei kuulu muutto-polkuun).

### Kontekstikohtaiset tiedot
Voit antaa lisätietoja eri kategorioissa (esim. `events_and_celebrations` tai `funerals_and_memorials`):

*   **`capacity_max`**: Henkilömäärä (jos kyseessä on tila).
*   **`digitization_features`**: Tarkemmat tiedot digitoinnista (esim. "VHS", "kaitafilmit", "valokuvien digitointi", "diashow-palvelu").
*   **`is_accessible`**: Onko tila esteetön.

## 3. Esimerkki hyvästä profiloinnista (Mediazoo)

```json
"company-2": {
    "name": "Mediazoo",
    "core": {
        "fits_for": {
            "kokoukset": 35,
            "yrityksen-kehittäminen": 75,
            "häät": 40,
            "hautajaiset": 40
        },
        "sub_contexts": [
            "digitointi",
            "videotuotanto",
            "valokuvaus"
        ],
        "not_suitable_for": ["muutto"]
    }
}
```

## 4. Muista nämä!
1.  **Väliviivat avaimissa:** Käytä `yrityksen-kehittäminen`, EI `yrityksen kehittäminen`.
2.  **Pienet alkukirjaimet:** `sub_contexts`-listan arvot kannattaa kirjoittaa pienellä (esim. `digitointi`).
3.  **Kapasiteetti:** Jos `capacity_max` on 0 tai puuttuu, yritystä ei ehdoteta tilaksi, jos haku vaatii tiettyä henkilömäärää.

## 5. Alihankkijat ja yhteistyökumppanit

Jos yritys tarjoaa palveluitaan toisen yrityksen (esim. juhlatilan) kautta tai toimii suositeltuna kumppanina, käytä näitä kenttiä:

### `paired_with_by_context` (Yleiset palvelukumppanit)
Käytetään, kun yritys tarjoaa lisäpalvelua (kuten kukat, kuljetus) tietyssä elämäntilanteessa, mutta se ei ole yrityksen pääkategoria.
*   **Käyttö:** Lisää `core`-osioon. Avaimena konteksti (esim. `funerals-and-memorials`) ja arvona lista palveluista.
*   **Esimerkki:** Ruokakauppa, joka myy myös kukkia hautajaisiin:
    ```json
    "paired_with_by_context": {
        "funerals-and-memorials": ["Kukat"]
    }
    ```

### `collaborated_with` (Suorat yrityskumppanit)
Käytetään, kun halutaan linkittää kaksi tiettyä yritystä toisiinsa (esim. hääpaikka ja sen vakio-DJ tai pitopalvelu).
*   **Käyttö:** Lisää kontekstikohtaiseen osioon (esim. `events_and_celebrations`). Arvona lista kumppaniyritysten ID-tunnuksista.
*   **Esimerkki:** Juhlatila, jolla on vakiokumppanina kukkakauppa (company-94):
    ```json
    "events_and_celebrations": {
        "collaborated_with": ["company-94"]
    }
    ```

### Esimerkki: Juhlatila ja Kukkakauppa
Jos taso 1 on **Juhlatila** ja käyttäjä valitsee **Hautajaiset**, järjestelmä suosittelee:
1.  Juhlatilaa, jonka `fits_for` hautajaisiin on korkea.
2.  Kukkakauppaa, jolla on joko `sub_contexts: ["kukkakauppa"]` tai joka on merkitty juhlatilan kumppaniksi (`collaborated_with`).

