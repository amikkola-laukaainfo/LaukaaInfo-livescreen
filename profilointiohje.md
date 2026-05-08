# LaukaaInfo - Yritysprofiloinnin Perusohje (v5)

Tämä ohje auttaa ylläpitäjää ja AI-avustajaa profiloimaan yrityksiä LaukaaInfo-ekosysteemiin. Profilointi etenee ylätasolta yksityiskohtiin viidessä eri vaiheessa.

---

## 1. TASO: Intent-pohjainen profilointi (Ydinosaaminen)

**Kysymys:** Mikä on yrityksen "pääintentio" eli mihin tarkoitukseen asiakas ensisijaisesti heidät valitsee?

- **Mitä tehdään:** Valitaan 1-3 koodia (esim. `EVT_WEDDING`, `BIZ_CATERING`).

- **Pisteytys (0-100):**

    - **100:** Yrityksen ehdoton ydinosaaminen (esim. juhlatila saa 100 pistettä `VENUE_PARTY`).

    - **80:** Vahva palvelu, mutta ei ainoa fokus.

    - **50:** Kyvykkyys löytyy, mutta yritys ei ole ensisijaisesti erikoistunut tähän.

- **Vaikutus:** Tämä ohjaa hakutulosten järjestystä. 100 pisteen yritykset nousevat kärkeen.

## 2. TASO: Elämäntilanteet ja Pääpolut (Legacy)

**Kysymys:** Mihin LaukaaInfon valmiisiin palvelupolkuihin yritys kuuluu?

- **Mitä tehdään:** Säädetään `fits_for`-pisteet (esim. "Häät ja Juhlat", "Yritystapahtumat").

- **Workflow:** Varmista, että nämä täsmäävät Tason 1 intentien kanssa (esim. jos intent on `EVT_WEDDING`, "Häät ja Juhlat" polun tulisi olla 80-100).

## 3. TASO: Alikategoriat ja Avainsanat (Sub-contexts)

**Kysymys:** Millä tarkemmilla sanoilla asiakas etsii palvelua?

- **Mitä tehdään:** Lisätään avainsanoja `sub_contexts`-listaan (esim. "hääkuvaus", "vhs-digitointi").

- **Vinkki:** Käytä pieniä kirjaimia. Nämä toimivat suodattimina palvelupolun sisällä.

## 4. TASO: Tekniset Yksityiskohdat (Kapasiteetti ja Ominaisuudet)

**Kysymys:** Mitkä ovat yrityksen konkreettiset resurssit?

- **Etene tässä järjestyksessä:**

    1. **Kapasiteetti:** Max henkilömäärä, majoituspaikat (KRIITTINEN tiloille).

    2. **Ominaisuudet:** Onko saunaa? Onko esteetön? Saako tuoda omat juomat?

    3. **Erityisalat:** Onko drone-kuvausta? Onko hääkakku-palvelua?

- **Vaikutus:** Jos kapasiteetti on 0, yritys ei löydy hakuvalinnoilla, joissa kysytään henkilömäärää.

## 5. TASO: Ristikkäissuositukset ja Kumppanit (Graafi)

**Kysymys:** Mitä muuta asiakas tarvitsee tämän palvelun yhteydessä?

- **Solmulinkit (Node Links):** Lisää suuret kategoriat (esim. `CATERING`, `VALOKUVAUS`), jotka auttavat tekoälyä yhdistämään yrityksen muihin palveluihin.

- **Yhteistyökumppanit:** Merkitse yritykset, joiden kanssa tämä yritys tekee yhteistyötä (Taso 4).

---

## Profiloinnin Työjärjestys (Workflow)

1. **Perustiedot:** Nimi, verkkosivut, puhelin ja lyhyt kuvaus.

2. **AI-Avustaja:** Käytä "Kopioi AI-prompt" -toimintoa ja anna tekoälyn tehdä ensimmäinen analyysi.

3. **Intent-tarkistus:** Varmista, että AI:n ehdottamat `intent_codes` ja pisteet ovat oikein.

4. **Kapasiteetin hienosäätö:** Syötä tarkat henkilömäärät ja vuodepaikat.

5. **Solmulinkit:** Tarkista, että yrityksellä on vähintään yksi iso solmulinkki (esim. `JUHLATILA`), jotta se näkyy graafivisualisoinneissa.

6. **Vahvistus:** Aseta tilaksi "Vahvistettu" (Verified) ja tallenna/exporttaa.

---

# LIITE: Palvelupolut ja Intent-koodit

Tämä lista sisältää kaikki LaukaaInfon palvelupolut ja niihin liittyvät tekniset koodit, joita AI-avustaja ja ylläpitäjä tarvitsevat tarkassa profiloinnissa.

| Polun nimi (ID) | Tärkeimmät Intent-koodit (Taso 1) | Alikategoriat / Sub-contexts (Taso 3) | Tekniset Filtterit (Taso 4) |

| :--- | :--- | :--- | :--- |

| **Häät** (`haat`) | `EVT_WEDDING`, `VENUE_PARTY`, `BIZ_CATERING`, `MEDIA_PHOTO`, `MEDIA_VIDEO`, `BIZ_FLORIST`, `ENT_MUSIC` | `perinteiset häät`, `pienet häät`, `teemahäät`, `vihkiminen` | `own_catering_allowed`, `accommodation_available` |

| **Yritysjuhlat** (`yritysjuhlat`) | `EVT_PARTY`, `BIZ_CATERING`, `ENT_MUSIC`, `VENUE_PARTY` | `pikkujoulut`, `henkilöstöjuhlat`, `tyky-paiva` | `has_sauna`, `has_av_tech`, `capacity_max` |

| **Yritystilaisuudet** (`yritystilaisuudet`) | `BIZ_MEETING`, `BIZ_SEMINAR`, `MEDIA_PHOTO`, `MEDIA_VIDEO` | `kokous`, `seminaari`, `konferenssi` | `has_projector`, `meeting_capacity` |

| **Syntymäpäivät** (`syntymapaivat`) | `EVT_PARTY`, `BIZ_CATERING`, `BIZ_FLORIST` | `lasten synttärit`, `aikuisten synttärit`, `sukujuhlat` | `cake_service` |

| **Hautajaiset** (`hautajaiset`) | `HAUTAUS`, `VENUE_PARTY`, `BIZ_CATERING`, `BIZ_FLORIST`, `BIZ_LEGAL` | `hautauspalvelu`, `muistotilaisuus`, `perunkirjoitus` | `quiet_private_space`, `memorial_catering`, `funeral_flowers` |

| **Muutto** (`muutto`) | `BIZ_TRANSPORT`, `BIZ_CLEANING` | `muuttopalvelu`, `varastointi` | `cleaning_after_move` |

| **Remontti** (`remontti`) | `BIZ_CONSTRUCTION`, `BIZ_RENOVATION`, `BIZ_ELECTRIC`, `BIZ_HVAC` | `kylpyhuoneremontti`, `keittiöremontti`, `pintaremontti`, `uudisrakentaminen` | `kalustekorjaus` |

| **Mökkipalvelut** (`mokkipalvelut`) | `BIZ_MAINTENANCE`, `BIZ_FIREWOOD` | `talvivalvonta`, `kevatkunnostus`, `polttopuut`, `mokkiremontti` | `key_holding`, `dock_maintenance` |

| **Kiinteistöpalvelut** (`kiinteistopalvelut`) | `BIZ_PROPERTY_MGMT`, `BIZ_CLEANING`, `BIZ_LEGAL` | `kiinteistöhuolto`, `isännöinti`, `linjasaneeraus` | |

| **Yrityksen perustaminen** (`yrityksen-perustaminen`) | `BIZ_CONSULTING`, `BIZ_ACCOUNTING`, `BIZ_MARKETING` | `liikeidea`, `rekisterointi`, `digimarkkinointi` | `business_advisory` |

| **Yrityksen kehittäminen** (`yrityksen-kehittaminen`) | `BIZ_CONSULTING`, `BIZ_MARKETING`, `BIZ_HR` | `digitalinen myynti`, `rekrytointi`, `konsultointi` | |

| **Terveys & Hyvinvointi** (`terveys-ja-hyvinvointi`) | `WELLBEING_HEALTH`, `WELLBEING_BEAUTY`, `WELLBEING_THERAPY` | `hieronta`, `kauneudenhoito`, `terveyspalvelut`, `terapia`, `kotihoito` | |

| **Eläimet ja lemmikit** (`elaimet`) | `PET_HEALTH`, `PET_GROOMING`, `PET_TRAINING` | `elainlaakari`, `elaintarvikkeet`, `trimmaus`, `elainhoitola` | |

| **Lapset ja perhe** (`lapset-ja-perhe`) | `EDU_DAYCARE`, `REC_CHILDREN`, `SHOP_CHILDREN`, `WELLBEING_FAMILY` | `paivahoito`, `lasten harrastukset`, `lastentarvikkeet`, `perhetuki` | |

| **Autohuollot** (`autohuollot`) | `AUTO_REPAIR`, `AUTO_TIRES`, `AUTO_WASH`, `AUTO_HEAVY` | `autokorjaamo`, `rengasliike`, `autopesu`, `raskaskonehuolto` | |

| **Päivystävät palvelut** (`paivystavat-palvelut`) | `BIZ_EMERGENCY`, `BIZ_HVAC`, `BIZ_ELECTRIC`, `BIZ_TRANSPORT` | (Käytä suoraan pääintentioita) | `emergency_service` |

| **Liikunta & Vapaa-aika** (`liikunta-ja-vapaaaika`) | `ENT_SPORTS`, `ENT_NATURE`, `ENT_KIDS` | (Käytä suoraan pääintentioita) | |

| **Vakituinen kumppani** (`vakituinen-palvelukumppani`) | `BIZ_PARTNER`, `BIZ_IT`, `BIZ_ACCOUNTING` | (Käytä suoraan pääintentioita) | |
