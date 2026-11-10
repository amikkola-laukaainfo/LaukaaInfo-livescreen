# LaukaaInfo-livescreen — Kehitysideat

> Koottu 10.11.2026 | Vertailukohteena myös SÄIE-HUB (saiehub.eu) -toteutus

---

## 1. Arkkitehtuuri — Yksi sivupohja per sisältötyyppi ⭐ TÄRKEIN

**Nykytila:** Jokaiselle alueelle, kohteelle tai yritystyypille on oma HTML-sivu.

**Idea:** Yksi geneerinen pohja + `place_id` URL-parametrina.

```
kohde.html?id=laukaa-kirkko
tapahtuma.html?id=abc123
yritys.html?id=vuonteen-helmi
```

**Hyödyt:**
- Uuden kohteen lisääminen ei vaadi HTML-tiedostoa — pelkkä Supabase-rivi riittää
- Sivun sisältö (kuvat, kuvaus, tapahtumat, reitit) haetaan dynaamisesti `place_id`:llä
- Paikkasivujen laajuus määräytyy automaattisesti tietokannan täyttöasteen mukaan
- SEO: canonical-URL ja meta-tiedot generoidaan dynaamisesti

**Tekninen toteutus:**
```javascript
const params = new URLSearchParams(location.search);
const placeId = params.get('id');
// → Hae Supabasesta: places, events, routes, companies where place_id = placeId
```

---

## 2. Monikielisyys — Suomi + Englanti `data-i18n`-attribuuteilla

**Nykytila:** Sivusto on vain suomeksi.

**Idea:** SÄIE-HUBin tyylinen `data-i18n`-attribuuttipohjainen käännösjärjestelmä.

```html
<h1 data-i18n="hero.title">Laukaa</h1>
<p data-i18n="hero.lead">Keski-Suomen sydämessä...</p>
```

**Kielitiedostot:**
```
content/
  fi.js   ← suomenkieliset tekstit
  en.js   ← englanninkieliset tekstit
```

**URL-parametri kielenvalintaan:** `?lang=en`

**Hyöty:** Ei erillistä domainia tai versiosivua — sama HTML, eri teksti.

**Erityisen tärkeä sivuille:** `ajankohtaista.html`, tapahtumasivut, `kohdekortit.html`

---

## 3. Staattinen JS-fallback Supabase-hauille

**Nykytila:** Jos Supabase ei vastaa → tyhjä lista ilman selitystä.

**Idea:** Jokaiselle kriittiselle hakulle varmuuskopio paikallisesta JS-tiedostosta.

```javascript
async function fetchEvents() {
  try {
    return await supabase.from('events').select('*')...;
  } catch {
    return window.FALLBACK_EVENTS || []; // content/events-fallback.js
  }
}
```

**Hyöty:** Sivusto näyttää aina jotain — myös offlinessa tai verkkokatkoksen aikana.

---

## 4. Tapahtumakorttien jako-toiminto

**Nykytila:** Ei jakopainiketta tapahtumakorteissa.

**Idea:** SÄIE-HUBin jako-nappi jokaisen tapahtumakortin alas.

**Toiminta:**
- Mobiilissa: avaa laitteen oman jakovalikon (`navigator.share`)
- Tietokoneella: kopioi leikepöydälle tapahtuman nimi + URL + päivämäärä
- URL muoto: `laukaainfo.fi/tapahtuma?id=abc123&lang=fi`

```javascript
navigator.share({
  title: event.title,
  text: `${event.title} – ${formatDate(event.start_date)}`,
  url: `https://laukaainfo.fi/tapahtuma?id=${event.id}`
});
```

---

## 5. Sivunavigaatio sisältötiedostosta (`sivunav`)

**Nykytila:** Navigaatio on kovakoodattu jokaiseen HTML-tiedostoon erikseen.

**Idea:** Yksi `content/sivut.js` josta navigaatio generoidaan automaattisesti.

```javascript
// content/sivut.js
window.HHDATA = window.HHDATA || {};
window.HHDATA.sivut = [
  { tiedosto: 'index.html',          nimi: { fi: 'Etusivu',      en: 'Home' } },
  { tiedosto: 'ajankohtaista.html',  nimi: { fi: 'Ajankohtaista', en: 'News' } },
  { tiedosto: 'kohdekortit.html',    nimi: { fi: 'Kohteet',       en: 'Places' } },
  { tiedosto: 'tapahtumat',          nimi: { fi: 'Tapahtumat',    en: 'Events' } },
];
```

**Hyöty:** Uuden sivun lisääminen ei vaadi kaikkien muiden sivujen muokkaamista.

---

## 6. Kohdekorttien näkyvyyssuodatus koontisivulla

**Nykytila:** *(Korjattu 10.11.2026)* Piilotetut kortit (`visibility = link/unlisted/private`) voivat vuotaa `kohdekortit.html`-koontisivulle ja nostoslideriin.

**Suositusarkkitehtuuri jatkossa:**
```
visibility = 'public'    → näkyy koontisivuilla + sliderissä
visibility = 'link'      → näkyy vain suoralla URL:lla (kohdekortti.html?id=xxx)
visibility = 'unlisted'  → piilotettu kaikista koontilistoista
visibility = 'private'   → vaatii kirjautumisen
visibility = 'draft'     → vain ylläpitäjälle
```

**Tarkistettavat kohdat:**
- `kohdekortit.html` — suodatus Supabase-haussa
- `index.html` nostoslideri — `HeroDataFetcher`-logiikka (Android ✅ korjattu)
- `ajankohtaista.html` — tapahtumanostot

---

## 7. Paikkakortin dynaaminen SEO

**Nykytila:** Meta-kuvaus ja otsikko ovat staattisia HTML:ssä.

**Idea:** Generoidaan `<title>` ja `<meta description>` dynaamisesti paikan tiedoista.

```javascript
document.title = `${place.name} – LaukaaInfo`;
document.querySelector('meta[name="description"]')
  .setAttribute('content', place.description?.slice(0, 160) || '');
```

**Open Graph -tiedot samalla:**
```javascript
document.querySelector('meta[property="og:image"]')
  .setAttribute('content', place.cover_image || 'assets/default-og.png');
```

---

## 8. Supabase `place_id` — Tiedon yhtenäistäminen sovellusten välillä

**Nykytila:** Paikka, tapahtumat, reitit ja yritykset voivat olla irrallaan toisistaan.

**Tavoite:** `place_id` yhdistää kaiken:

| Sovellus | Linkitys |
|---|---|
| LaukaaInfo | `places`, `events`, `posts` |
| Wonderin | `routes.place_id`, reitin lähtöpiste |
| Mixonet | `companies.place_id`, toimijan sijainti |
| LaukaaLive | Tapahtumaseinä, lähikohteet |

**Hyöty:** Sama tieto näkyy oikeassa kontekstissa kaikissa sovelluksissa ilman duplikaatteja.

---

## 9. Verkostotoimijoiden esittely (`kohtaamiset.html`)

**Idea SÄIE-HUBilta:** Toimijat esitellään kortteina, joissa on rooli + paikka + yhteydenottolinkki.

**LaukaaInfossa:** `kohtaamiset.html` tai uusi `toimijat.html` Supabasesta haettavilla yrityksillä/yhdistyksillä, jotka ovat antaneet luvan julkiseen esittelyyn.

```sql
SELECT * FROM companies 
WHERE visibility = 'public' AND show_in_network = true
ORDER BY name;
```

---

## 10. `build.js` — Wonderin web-buildin automaattinen kopiointi

**Nykytila:** Wonderin `dist/`-kansio kopioidaan manuaalisesti.

**Idea:** Lisää `build.js`-skriptiin vaihe joka tunnistaa, onko Wonderin dist päivittynyt.

```javascript
// build.js loppuun
const wonderinSrc = '../../../Wonderin/dist';
const wonderinDst = './wonderin/web';
if (fs.existsSync(wonderinSrc)) {
  copyDir(wonderinSrc, wonderinDst);
  console.log('✓ Wonderin web päivitetty');
}
```

---

## Prioriteettijärjestys

| # | Idea | Työmäärä | Vaikutus |
|---|---|---|---|
| 1 | Yksi sivupohja per sisältötyyppi | Suuri | ⭐⭐⭐ Korkea |
| 2 | Näkyvyyssuodatus koontisivuilla | Pieni | ⭐⭐⭐ Korkea |
| 3 | Tapahtumakorttien jako-toiminto | Pieni | ⭐⭐ Keskitaso |
| 4 | Staattinen JS-fallback | Pieni | ⭐⭐ Keskitaso |
| 5 | Monikielisyys | Keskisuuri | ⭐⭐ Keskitaso |
| 6 | `place_id` yhtenäistäminen | Suuri | ⭐⭐⭐ Strateginen |
| 7 | Dynaaminen SEO | Pieni | ⭐⭐ Keskitaso |
| 8 | Sivunavigaatio tiedostosta | Pieni | ⭐ Mukavuus |
| 9 | build.js Wonderin-integraatio | Pieni | ⭐ Mukavuus |

---

## Viitteet

- **SÄIE-HUB** `app.js` — kielenvaihto, sisällön renderöinti, jako-toiminto
- **LaukaaLive Android** `HeroDataFetcher.kt` — näkyvyyssuodatus (toteutettu 10.11.2026)
- **Wonderin** `RoutePlayerView.tsx` — oikaisutoiminto (toteutettu 10.11.2026)
- Supabase-tietokannan `places`-taulu — `visibility`, `place_id`, `status`

