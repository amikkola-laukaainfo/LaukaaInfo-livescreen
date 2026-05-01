# LaukaaInfo - AI Profiling Guide (Keywords & Taxonomy)

This guide is intended for AI agents responsible for profiling companies in the LaukaaInfo ecosystem. Use these standardized tags, sub-contexts, and node links to ensure consistent service discovery.

## 1. Primary Intents (fits_for)
Use these keys in the `fits_for` section of the profiling JSON.
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

## 2. Standardized Node Links (node_links)
Always include these in uppercase in the `node_links` array if applicable:
- `JUHLATILA` (Venues, meeting spaces)
- `DIGITOINTI` (Digitization services: VHS, photos, film)
- `VALOKUVAUS` (Photography)
- `VIDEOTUOTANTO` (Video production, editing)
- `CATERING` (Food services, pitopalvelu)
- `MAJOITUS` (Accommodation)
- `SAUNA` (Sauna facilities)
- `KUKAT` (Flowers and decoration)
- `YRITYSTAPAHTUMAT` (Business-specific events)
- `VERKKOSIVUT` (Web development)
- `BRÄNDÄYS` (Branding and logos)

## 3. Recommended Sub-Contexts (Keywords)
Use these in `sub_contexts` to improve search relevance:

### Events & Celebrations
`juhlatila`, `kartano`, `kylätalo`, `sauna`, `ranta`, `pitopalvelu`, `valokuvaaja`, `videokuvaaja`, `häävideo`, `digitointi`, `häävideon editointi`, `musiikki`, `ohjelmapalvelut`, `drone-kuvaus`, `hääkooste`, `juhlakuvaus`

### Business Events
`kokoustila`, `seminaari`, `yritysjuhlat`, `tyhypäivä`, `koulutus`, `streamaus`, `videotuotanto`, `presentaatiotekniikka`

### Funerals & Memorials
`hautauspalvelu`, `muistotilaisuus`, `perunkirjoitus`, `hautakivi`, `muistovideo`, `digitointi`, `muistotilaisuuskuvaus`, `hautajaiskuvaus`

### Professional Services
`yritysneuvonta`, `konsultointi`, `tilitoimisto`, `vakuutus`, `lakipalvelut`, `verkkosivut`, `brändäys`, `logo`, `yrityskuvat`, `google-mainonta`, `somemainonta`, `myynnin kehittäminen`, `verkkokauppa`, `rekrytointi`

## 4. Capacity Rules
For any company with `JUHLATILA` or `MAJOITUS` links, ensure the following fields are populated if known:
- `capacity_max`
- `seated_capacity`
- `accommodation_beds` (for accommodation)

## 5. Important Filtering Keywords
Avoid using "tilaisuus" (event/occasion) when you mean "tila" (space/venue). The word "tila" triggers venue-specific filtering, while "tilaisuus" is treated as a general service term.
