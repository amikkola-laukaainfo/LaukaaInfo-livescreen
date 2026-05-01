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

## 4. Specialization vs. General Discovery
The discovery engine now uses a two-tiered approach:

1. **General Discovery (Core Node Links)**: If a company has a core node link (e.g., `VALOKUVAUS`), they will appear in ANY search for that category (e.g., a "Valokuvaaja" option in a wedding flow).
2. **Specialized Match (Refinement Tags & High Scores)**: To be highlighted as a **"TOP MATCH"** or to match specific filters (e.g., "Hääkuvaaja"), the company MUST have the specific tag in their `refinement_tags` (e.g., `hääkuvaus`) or a high `fits_for` score for that intent.

**AI Tip**: When profiling, always add the broad node link first, and then add specific sub-contexts and refinement tags for areas where the company truly excels.

## 5. Capacity Rules
For any company with `JUHLATILA` or `MAJOITUS` links, ensure the following fields are populated if known:
- `capacity_max`
- `seated_capacity`
- `accommodation_beds` (for accommodation)

## 5. Important Filtering Keywords
Avoid using "tilaisuus" (event/occasion) when you mean "tila" (space/venue). The word "tila" triggers venue-specific filtering, while "tilaisuus" is treated as a general service term.
