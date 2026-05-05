# LaukaaInfo - AI Profiling Guide (Keywords & Taxonomy)

This guide is intended for AI agents responsible for profiling companies in the LaukaaInfo ecosystem. Use these standardized tags, sub-contexts, and node links to ensure consistent service discovery across the **palvelu.html** guided flow and general searches.

## 1. Business Sectors (Toimialat)
The discovery engine uses broad business sectors to organize companies. Ensure the `kategoria` field in the core data matches one of these if possible:
- `Palvelut`, `Kaupat ja putiikit`, `Ravintolat ja kahvilat`, `Terveys ja hyvinvointi`, `Kulttuuri ja vapaa-aika`, `Majoitus`, `Teollisuus ja rakentaminen`, `Asiantuntijapalvelut`, `Kuljetus ja logistiikka`, `Autoilu ja liikenne`, `Juhlat ja tapahtumat`.

## 2. Primary Intents (fits_for)
Use these keys in the `fits_for` section. High scores (80+) prioritize the company in these flows.
- `events-and-celebrations` (Häät ja juhlat)
- `business-events` (Yritystapahtumat)
- `funerals-and-memorials` (Hautajaiset ja muistotilaisuudet)
- `startup-services` (Yrityksen perustaminen)
- `business-growth` (Yrityksen kehittäminen)
- `moving-and-housing` (Muutto ja asuminen)
- `construction-and-maintenance` (Rakentaminen ja remontti)
- `cottage-services` (Mökkipalvelut)
- `accommodation` (Majoitus)
- `wellbeing-and-beauty` (Hyvinvointi ja kauneus)

## 3. Standardized Node Links (node_links)
Node links are the **primary discovery mechanism**. If a company has a node link, they are automatically eligible for category-wide results.
- `JUHLATILA`: Venues, meeting spaces. (Triggers capacity filtering)
- `DIGITOINTI`: VHS, photos, film, slides. Covers: `vhs-digitointi`, `valokuvien digitointi`, `diojen digitointi`, `kaitafilmien digitointi`, `diashow-esitykset`.
- `VALOKUVAUS`: Photography (General).
- `VIDEOTUOTANTO`: Video production, editing.
- `CATERING`: Food services, pitopalvelu.
- `MAJOITUS`: Accommodation.
- `SAUNA`: Sauna facilities.
- `KUKAT`: Flowers and decoration.

## 4. Sub-Contexts & Refinement Tags (The Guided Flow)
The `palvelu.html` engine uses these to match specific user choices in the guided steps defined in `needs_config.js`.

### Matching Principles:
1. **Direct Match**: If a user selects "Hääkuvaaja", the engine looks for `hääkuvaus` in `refinement_tags` or `sub_contexts`.
2. **Category Fallback**: If no specific refinement matches, companies with the relevant `node_link` (e.g., `VALOKUVAUS`) are shown as general options.
3. **Fuzzy Matching**: The engine matches plural forms (e.g., `kukka` matches `kukat`) and partial strings.
4. **Exclusion (`not_suitable_for`)**: Use this array to prevent a company from appearing in specific contexts (e.g., a "Party DJ" might not be suitable for `funerals-and-memorials`).

### Recommended Keywords by Intent:
- **Events**: `juhlatila`, `kartano`, `kylätalo`, `sauna`, `ranta`, `pitopalvelu`, `valokuvaaja`, `videokuvaaja`, `häävideo`, `hääkuvaus`, `juhlakuvaus`, `musiikki`, `ohjelmapalvelut`, `drone-kuvaus`, `ilmakuvaus`, `digitointi`, `vhs-digitointi`, `valokuvien digitointi`.
- **Business**: `kokoustila`, `seminaari`, `yritysjuhlat`, `tyhypäivä`, `streamaus`, `videotuotanto`, `presentaatiotekniikka`, `ilmakuvaus`.
- **Funerals**: `hautauspalvelu`, `muistotilaisuus`, `perunkirjoitus`, `hautakivi`, `muistovideo`, `muistotilaisuuskuvaus`, `hautajaiskuvaus`, `digitointi`, `vhs-digitointi`, `valokuvien digitointi`, `diashow-esitys`.
- **Professional**: `yritysneuvonta`, `tilitoimisto`, `vakuutus`, `lakipalvelut`, `verkkosivut`, `brändäys`, `logo`, `yrityskuvat`, `google-mainonta`, `somemainonta`, `rekrytointi`.
- **Real Estate & Construction**: `muuttopalvelu`, `varastointi`, `asuntovideo`, `kiinteistökuvaus`, `timelapse`, `rakennuskuvaus`, `ilmakuvaus`.
- **Leisure Destinations**: Use these for major sites: `peurunka`, `varjola`, `revontuli`, `ranch`, `nokkakivi`, `multamäki`.

## 5. Capacity & Feature Rules
For any company with `JUHLATILA` or `MAJOITUS`:
- **Capacity**: Must have `capacity_max` and `seated_capacity`.
  - `standing_guests`: Use for cocktail/party capacity without seating.
  - `outdoor_capacity`: Capacity for terraces/garden areas.
- **Hybrid Service Rules**:
  - If a company provides a venue **and** catering, use `inhouse_catering_available: true`.
  - If a company allows outside catering, use `own_catering_allowed: true`.
  - Ensure `node_links` includes both `JUHLATILA` and `CATERING` for such companies.
- **Specific Features**: Use boolean flags in the profiling JSON for:
  - `has_sauna`, `is_accessible`, `accommodation_available` (with `accommodation_beds`), `late_night_events`, `alcohol_license`.

## 7. Master Keyword Table (Guided Flow Sync)
Use these exact terms in `sub_contexts` or `refinement_tags` to ensure companies appear in the corresponding guided flow steps:

| Category | Step / Need | Required Keywords (Tags) |
| :--- | :--- | :--- |
| **Legal** | Perunkirjoitus, Lakipalvelut | `lakiasiaintoimistot`, `perunkirjoitus`, `sopimukset` |
| **Accounting** | Kirjanpito, Hallinto | `tilitoimisto`, `kirjanpito` |
| **Construction** | Sähkötyöt, Maalaus, Suunnittelu | `sähköasennukset`, `maalaustyöt`, `suunnittelutoimisto` |
| **Maintenance** | Kiinteistöhuolto, Isännöinti | `kiinteistöhuolto`, `isännöinti`, `siivous`, `viherrakentaminen` |
| **Wellness** | Hyvinvointi, Terapia, Kauneus | `terveyspalvelut`, `hieronta`, `kauneus`, `kampaamo`, `terapia` |
| **Leisure** | Peurunka, Varjola, Ranch | `peurunka`, `varjola`, `revontuli`, `ranch`, `nokkakivi`, `multamäki` |
| **Animals** | Eläinlääkäri, Hevonen, Hoito | `eläinlääkäri`, `hevonen`, `trimmaus`, `koirahoitola` |
| **Business** | Rekrytointi, Markkinointi | `henkilöstöpalvelut`, `mainostoimisto`, `markkinointikumppani` |
| **Emergency** | Hinaus, Lukot, Sähkö | `hinaus`, `lukkoseppä`, `päivystys` |
| **Mökki** | Polttopuut, Laiturit | `polttopuut`, `laituritarvikkeet` |
| **Family** | Lapset, Harrastukset | `lapset`, `harrastukset` |
