# LaukaaInfo - Profilointiohje (Taksonomia & Säännöt)

Tämä ohje on tarkoitettu yritysten profilointiin LaukaaInfo-ekosysteemissä. Käytä näitä sääntöjä varmistaaksesi, että yritykset löytyvät oikein **palvelu.html**-ohjatussa haussa.

## 1. Pääkategoriat (fits_for)
Käytä näitä avaimia `fits_for`-osiossa (arvo 0-100).
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

## 2. Solmulingit (node_links)
Solmulingit ovat tärkein löydettävyyden kriteeri.
- `JUHLATILA`: Tilat, kokoustilat. Aktivoi kapasiteettisuodatuksen.
- `CATERING`: Pitopalvelu ja ruokapalvelut.
- `MAJOITUS`: Majoituspalvelut.
- `DIGITOINTI`: Valokuvien ja videoiden digitointi.

## 3. Kapasiteetti ja Hybridiyritykset
Jos yritys on `JUHLATILA`:
- **Istumapaikat**: `seated_capacity` (ruokailuun sopivat paikat).
- **Seisomapaikat**: `standing_guests` (cocktail-tilaisuudet).
- **Ulkopaikat**: `outdoor_capacity` (terassit).

**Hybridisääntö (Tila + Palvelu):**
- Jos tilalla on oma pitopalvelu: `inhouse_catering_available: true`.
- Jos tilaan saa tuoda omat ruoat: `own_catering_allowed: true`.
- Muista lisätä molemmat solmut: `node_links: ["JUHLATILA", "CATERING"]`.

## 4. Nimikäytännöt
- **Väliviiva vs. Alaviiva**: Taksonomian ID:t käyttävät väliviivaa (`events-and-celebrations`), mutta JSON-datan kategoriatason avaimet alaviivaa (`events_and_celebrations`).
- **Tila vs. Tilaisuus**: Käytä sanaa "tila", kun kyseessä on fyysinen paikka. Käytä sanaa "tilaisuus", kun kyseessä on palvelu (esim. juhlien valokuvaus).

## 5. Lisäominaisuudet (Boolean-liput)
Käytä näitä totuusarvoja (true/false) tarkennuksissa:
- `is_accessible` (esteetön)
- `has_sauna` (sauna käytettävissä)
- `accommodation_available` (majoitus mahdollinen)
- `alcohol_license` (anniskeluoikeudet)
- `late_night_events` (jatkoaika/yöjuhlat mahdollisia)

## 6. Hakusanojen synkronointi (Guided Flow)
Käytä näitä tarkkoja termejä `sub_contexts`- tai `refinement_tags`-kentissä varmistaaksesi yritysten löytymisen ohjatussa haussa:

| Kategoria | Tarve / Vaihe | Suositellut avainsanat (Tägit) |
| :--- | :--- | :--- |
| **Laki** | Perunkirjoitus, Sopimukset | `lakiasiaintoimistot`, `perunkirjoitus`, `sopimukset` |
| **Talous** | Kirjanpito, Hallinto | `tilitoimisto`, `kirjanpito` |
| **Rakentaminen** | Sähkötyöt, Maalaus | `sähköasennukset`, `maalaustyöt`, `suunnittelutoimisto` |
| **Ylläpito** | Nuohous, Huolto | `nuohouspalvelut`, `kiinteistöhuolto` |
| **Hyvinvointi** | Kauneus, Terapia | `meikki`, `kampaus`, `psykologi`, `terveyspalvelut` |
| **Eläimet** | Eläinlääkäri, Hoito | `eläinlääkäri`, `trimmaus`, `koirahoitola` |
| **Yritys** | Rekrytointi, Mainos | `henkilöstöpalvelut`, `mainostoimisto`, `koulutus` |
| **Hätä** | Hinaus, Lukot | `hinaus`, `lukkoseppä`, `päivystys` |
| **Mökki** | Polttopuut | `polttopuut`, `laituritarvikkeet` |
| **Perhe** | Päivähoito, Lapset | `päiväkoti`, `lapset`, `harrastukset` |