/**
 * generate_kohteet_index.js
 * 
 * Generoi kohteet/index.html -hakemistosivun Supabase places-taulun pohjalta.
 * Ryhmittelee paikat importance-tason mukaan:
 *   4 = Pääkohteet (kortteina ylhäällä)
 *   3 = Merkittävät kohteet (linkkilistana alueittain)
 *   1–2 = Pienemmät kohteet (tiivistetty alueittain)
 *
 * Ajo: node generate_kohteet_index.js
 * Lisää package.json scripts: "kohteet": "node generate_kohteet_index.js"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Supabase-konfiguraatio ───────────────────────────────────────────────────
// Sama projekti kuin generate_seo_pages.js:ssa (places-taulu sijaitsee täällä)
const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

// ─── SEO-pääkohteet (importance=4) – slug-kuva-mapping ───────────────────────
const MAIN_PLACE_META = {
    'vihtavuori':    { slug: 'vihtavuori',     emoji: '🏭', desc: 'Perinteikäs taajama ja teollisuushistorian kaupunginosa', image: '../laukaan_ravintolat_header.png' },
    'laukaa':        { slug: null,              emoji: '🏛️', desc: 'Laukaan kunnan hallinnollinen keskus ja kirkonkylä', image: '../hero-kuva.webp' },
    'lievestuore':   { slug: 'lievestuore',     emoji: '🏞️', desc: 'Laukaan itäinen taajama järvien ja teollisuushistorian ympäröimänä', image: '../hero-kuva.webp' },
    'leppävesi':     { slug: null,              emoji: '💧', desc: 'Rauhallinen taajama Leppäveden rannalla', image: '../hero-kuva.webp' },
    'vehniä':        { slug: null,              emoji: '🌾', desc: 'Maaseutumainen kylä Laukaan pohjoisosassa', image: '../hero-kuva.webp' },
    'tiituspohja':   { slug: null,              emoji: '🌲', desc: 'Pieni kylä Laukaan alueella', image: '../hero-kuva.webp' },
    'peurunka':      { slug: 'peurunka',        emoji: '🏊', desc: 'Matkailu- ja kylpyläkeskus Peurunka-järven rannalla', image: '../hero-kuva.webp' },
};

// ─── Importance 3 -kohteet joilla on oma SEO-sivu ────────────────────────────
const SEO_PAGE_SLUGS = {
    'hitonhauta':                   'hitonhauta',
    'saraakallion kalliomaalaukset': 'saraakallio',
    'laukaan satama':               'laukaan-satama',
    'kuusankoski ja koskikara':     'kuusankoski',
    'hyyppäänvuori':                'hyyppaanvuori',
    'haarlan tehdas':               'haaralan-tehdas',
    'tarvaalan maaseututaajama':    'tarvaala',
};

// ─── Paikkatyyppien suomennokset ─────────────────────────────────────────────
const TYPE_LABELS = {
    AREA:     'Alue',
    LANDMARK: 'Nähtävyys',
    SERVICE:  'Palvelu',
    BUILDING: 'Rakennus',
    ROUTE:    'Reitti',
    NATURE:   'Luontokohde',
};

// ─── Fallback-data jos Supabase ei vastaa ─────────────────────────────────────
const FALLBACK_PLACES = [
    { id: 'vihtavuori',  name: 'Vihtavuori',  type: 'AREA', municipality: 'Vihtavuori', importance: 4, status: 'active' },
    { id: 'laukaa',      name: 'Laukaa',       type: 'AREA', municipality: 'Laukaa',     importance: 4, status: 'active' },
    { id: 'lievestuore', name: 'Lievestuore',  type: 'AREA', municipality: 'Lievestuore',importance: 4, status: 'active' },
    { id: 'leppavesi',   name: 'Leppävesi',    type: 'AREA', municipality: 'Leppävesi',  importance: 4, status: 'active' },
    { id: 'peurunka',    name: 'Peurunka',     type: 'AREA', municipality: 'Peurunka',   importance: 4, status: 'active' },
    { id: 'hitonhauta',  name: 'Hitonhauta',   type: 'LANDMARK', municipality: 'Valkola', importance: 3, status: 'active' },
    { id: 'saraakallio', name: 'Saraakallion kalliomaalaukset', type: 'LANDMARK', municipality: 'Laukaa', importance: 3, status: 'active' },
    { id: 'laukaan-satama', name: 'Laukaan Satama', type: 'AREA', municipality: 'Laukaa', importance: 3, status: 'active' },
    { id: 'kuusankoski', name: 'Kuusankoski ja Koskikara', type: 'LANDMARK', municipality: 'Kuusa', importance: 3, status: 'active' },
    { id: 'hyyppaanvuori', name: 'Hyyppäänvuori', type: 'LANDMARK', municipality: 'Lievestuore', importance: 3, status: 'active' },
    { id: 'pk001', name: 'Laukaan pääkirjasto', type: 'SERVICE', municipality: 'Laukaa', importance: 2, status: 'active' },
    { id: 'pk002', name: 'Laukaan kirkko',      type: 'LANDMARK', municipality: 'Laukaa', importance: 2, status: 'active' },
    { id: 'pk003', name: 'Lievestuoreen kirkko', type: 'LANDMARK', municipality: 'Lievestuore', importance: 2, status: 'active' },
];

// ─── Supabase REST API -haku ──────────────────────────────────────────────────
function fetchPlaces() {
    return new Promise((resolve) => {
        // status voi olla 'PUBLISHED', 'active', tai NULL – haetaan kaikki ja suodatetaan
        // importance on 0-100 asteikolla (vanha) tai 1-4 (uusi)
        const endpoint = '/rest/v1/places?select=id,name,type,municipality,importance,status,canonical_name,lat,lon&order=importance.desc,name.asc&limit=500';
        const options = {
            hostname: new URL(SUPABASE_URL).hostname,
            path: endpoint,
            method: 'GET',
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Accept':        'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Normalisoi importance: vanha 0-100 → uusi 1-4
                        const normalized = parsed.map(p => ({
                            ...p,
                            importance: normalizeImportance(p.importance)
                        }));
                        console.log(`  ✓ Supabase palautti ${normalized.length} kohdetta`);
                        resolve(normalized);
                    } else {
                        console.warn('  ⚠ Supabase palautti tyhjän tai virheellisen vastauksen, käytetään fallback-dataa.');
                        resolve(FALLBACK_PLACES);
                    }
                } catch (e) {
                    console.warn('  ⚠ JSON-parsinta epäonnistui, käytetään fallback-dataa.');
                    resolve(FALLBACK_PLACES);
                }
            });
        });
        req.on('error', (err) => {
            console.warn('  ⚠ Supabase-yhteys epäonnistui (' + err.message + '), käytetään fallback-dataa.');
            resolve(FALLBACK_PLACES);
        });
        req.setTimeout(6000, () => { req.destroy(); resolve(FALLBACK_PLACES); });
        req.end();
    });
}

// ─── Apufunktiot ─────────────────────────────────────────────────────────────

/** Normalisoi vanha 0-100 importance → 1-4 asteikko */
function normalizeImportance(val) {
    const n = Number(val) || 0;
    if (n >= 1 && n <= 4) return n;   // jo oikealla asteikolla
    if (n >= 80) return 4;
    if (n >= 50) return 3;
    if (n >= 20) return 2;
    return 1;
}

function slugify(str) {
    return (str || '').toLowerCase()
        .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getPlaceLink(place) {
    const nameLower = (place.name || '').toLowerCase();
    for (const [key, slug] of Object.entries(SEO_PAGE_SLUGS)) {
        if (nameLower.includes(key)) return `${slug}.html`;
    }
    const seoSlug = place.seo_slug || place.place_id;
    if (seoSlug) {
        const htmlFile = `${seoSlug}.html`;
        if (fs.existsSync(path.join(__dirname, 'kohteet', htmlFile))) {
            return htmlFile;
        }
    }
    const pid = place.place_id || place.id;
    return `../tietoa-paikasta.html?id=${encodeURIComponent(pid || slugify(place.name))}`;
}

function hasSeoPage(place) {
    const nameLower = (place.name || '').toLowerCase();
    for (const key of Object.keys(SEO_PAGE_SLUGS)) {
        if (nameLower.includes(key)) return true;
    }
    const seoSlug = place.seo_slug || place.place_id;
    if (seoSlug && fs.existsSync(path.join(__dirname, 'kohteet', `${seoSlug}.html`))) return true;
    return false;
}

// ─── HTML-generaattori ───────────────────────────────────────────────────────
function renderKohteetIndex(places, generatedAt) {
    // Hyväksy PUBLISHED ja active, poissulje ARCHIVED ja DELETED
    const active = places.filter(p => {
        const s = (p.status || '').toUpperCase();
        return s === 'PUBLISHED' || s === 'ACTIVE' || s === '';
    });

    const level4  = active.filter(p => (p.importance || 2) >= 4);
    const level3  = active.filter(p => (p.importance || 2) === 3);
    const level12 = active.filter(p => (p.importance || 2) <= 2);

    // Ryhmittele level3 alueen mukaan
    const byMuni3 = {};
    level3.forEach(p => {
        const m = p.municipality || 'Muu';
        if (!byMuni3[m]) byMuni3[m] = [];
        byMuni3[m].push(p);
    });

    // Ryhmittele level1-2 alueen mukaan
    const byMuni12 = {};
    level12.forEach(p => {
        const m = p.municipality || 'Muu';
        if (!byMuni12[m]) byMuni12[m] = [];
        byMuni12[m].push(p);
    });

    // ── Pääkohde-kortit ────────────────────────────────────────────────────
    const mainCards = level4.map(place => {
        const nameLower = (place.name || '').toLowerCase();
        const meta = Object.entries(MAIN_PLACE_META).find(([k]) => nameLower.includes(k))?.[1] || {};
        const emoji  = meta.emoji  || '📍';
        const desc   = meta.desc   || `${place.municipality || place.name} – Laukaan alue`;
        const image  = meta.image  || '../hero-kuva.webp';
        const slug   = meta.slug;
        const link   = slug
            ? `${slug}.html`
            : `../tietoa-paikasta.html?id=${encodeURIComponent(place.place_id || slugify(place.name))}`;

        return `
        <article class="main-card">
          <div class="main-card-image" style="background-image:url('${image}')">
            <div class="main-card-overlay"></div>
            <div class="main-card-body">
              <span class="imp-badge">Päätaajama</span>
              <h2 class="main-card-title">${emoji} ${place.name}</h2>
              <p class="main-card-desc">${desc}</p>
              <a href="${link}" class="card-link">Tutustu →</a>
            </div>
          </div>
        </article>`;
    }).join('\n');

    // ── Merkittävät kohteet alueittain ─────────────────────────────────────
    let html3 = '';
    Object.keys(byMuni3).sort().forEach(muni => {
        const items = byMuni3[muni];
        const listItems = items.map(p => {
            const link   = getPlaceLink(p);
            const seo    = hasSeoPage(p);
            const tlabel = TYPE_LABELS[p.type] || p.type || '';
            return `<li>
              <a href="${link}" class="place-link${seo ? ' place-link--seo' : ''}">
                <span class="pln">${p.name}</span>
                ${tlabel ? `<span class="plt">${tlabel}</span>` : ''}
                ${seo ? '<span class="plb">📄 Oma sivu</span>' : ''}
              </a>
            </li>`;
        }).join('');
        html3 += `
        <div class="area-group">
          <h3 class="area-title"><span class="adot"></span>${muni}</h3>
          <ul class="place-list">${listItems}</ul>
        </div>`;
    });

    // ── Pienemmät kohteet alueittain ───────────────────────────────────────
    let html12 = '';
    Object.keys(byMuni12).sort().forEach(muni => {
        const items = byMuni12[muni];
        const byType = {};
        items.forEach(p => {
            const t = TYPE_LABELS[p.type] || p.type || 'Muu';
            if (!byType[t]) byType[t] = [];
            byType[t].push(p);
        });
        const typeBlocks = Object.entries(byType).map(([type, ps]) => {
            const links = ps.map(p => {
                const pid  = p.place_id || p.id;
                const link = `../tietoa-paikasta.html?id=${encodeURIComponent(pid || slugify(p.name))}`;
                return `<a href="${link}" class="small-link">${p.name}</a>`;
            }).join('');
            return `<div class="stg"><span class="stl">${type}:</span>${links}</div>`;
        }).join('');
        html12 += `
        <details class="area-details">
          <summary class="area-summary">
            <span>${muni}</span>
            <span class="area-count">${items.length} kohdetta</span>
          </summary>
          <div class="adb">${typeBlocks}</div>
        </details>`;
    });

    const dateStr = new Date(generatedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' });
    const total   = active.length;

    return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Kaikki Laukaan kohteet – paikat, nähtävyydet ja alueet | LaukaaInfo</title>
<meta name="description" content="Kattava hakemisto Laukaan kunnasta: pääkohteet, nähtävyydet, palvelut ja alueet – ${total} kohdetta. Hitonhauta, Saraakallio, Peurunka, Vihtavuori ja paljon muuta.">
<link rel="canonical" href="https://laukaainfo.fi/kohteet/">
<meta name="robots" content="index,follow">
<meta property="og:type" content="website">
<meta property="og:title" content="Kaikki Laukaan kohteet | LaukaaInfo">
<meta property="og:description" content="Kattava hakemisto Laukaan paikoista: ${total} kohdetta luokiteltuina.">
<meta property="og:url" content="https://laukaainfo.fi/kohteet/">
<meta property="og:image" content="https://laukaainfo.fi/hero-kuva.webp">
<meta property="og:site_name" content="LaukaaInfo">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage","name":"Laukaan kohteet – LaukaaInfo","description":"Kattava hakemisto Laukaan kunnasta – paikat, nähtävyydet, alueet ja palvelut.","url":"https://laukaainfo.fi/kohteet/","breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Etusivu","item":"https://laukaainfo.fi/"},{"@type":"ListItem","position":2,"name":"Kohteet","item":"https://laukaainfo.fi/kohteet/"}]}}</script>
<style>
:root{--primary:#0f766e;--primary-dark:#115e59;--bg:#0f172a;--card-bg:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8;--teal:#2dd4bf;--sky:#38bdf8;--font-h:'Outfit',sans-serif;--font-b:'Inter',sans-serif;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:var(--font-b);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;}
a{color:var(--sky);text-decoration:none;transition:color .2s;}
a:hover{color:#7dd3fc;text-decoration:underline;}
.site-header{background:rgba(15,23,42,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;}
.nav-container{max-width:1200px;margin:0 auto;padding:1rem 1.5rem;display:flex;align-items:center;justify-content:space-between;}
.brand-logo{font-family:var(--font-h);font-size:1.5rem;font-weight:800;color:#fff;display:flex;align-items:center;gap:.5rem;text-decoration:none;}
.brand-logo span{color:var(--teal);}
.nav-links{display:flex;gap:1.5rem;list-style:none;}
.nav-links a{color:var(--muted);font-weight:500;font-size:.95rem;text-decoration:none;}
.nav-links a:hover{color:#fff;}
.page-hero{background:linear-gradient(135deg,#0c1a2e 0%,#1a2744 50%,#0f2020 100%);padding:3.5rem 1.5rem 2.5rem;border-bottom:1px solid var(--border);}
.page-hero-inner{max-width:1200px;margin:0 auto;}
.breadcrumb{font-size:.875rem;color:var(--muted);margin-bottom:1.5rem;}
.breadcrumb a{color:var(--muted);}
.page-hero h1{font-family:var(--font-h);font-size:clamp(1.8rem,4vw,3rem);font-weight:800;margin-bottom:.75rem;}
.page-hero h1 em{color:var(--teal);font-style:normal;}
.page-hero-desc{color:#cbd5e1;font-size:1.1rem;max-width:680px;}
.meta-row{margin-top:1.25rem;display:flex;gap:1rem;flex-wrap:wrap;}
.meta-chip{background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.25);color:var(--teal);border-radius:9999px;padding:.3rem .9rem;font-size:.85rem;font-weight:600;}
.page-content{max-width:1200px;margin:0 auto;padding:2.5rem 1.5rem 5rem;}
.section-header{display:flex;align-items:center;gap:.75rem;margin:3rem 0 1.5rem;}
.section-header h2{font-family:var(--font-h);font-size:1.5rem;font-weight:700;}
.section-line{flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent);}
.section-badge{background:var(--card-bg);border:1px solid var(--border);color:var(--muted);border-radius:9999px;padding:.25rem .75rem;font-size:.8rem;white-space:nowrap;}
.main-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.25rem;}
.main-card{border-radius:1rem;overflow:hidden;height:240px;}
.main-card-image{width:100%;height:100%;background-size:cover;background-position:center;position:relative;}
.main-card-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.2) 0%,rgba(15,23,42,.88) 100%);}
.main-card-body{position:absolute;bottom:0;left:0;right:0;padding:1.25rem 1.5rem;z-index:1;}
.imp-badge{display:inline-block;background:rgba(45,212,191,.2);color:var(--teal);border:1px solid rgba(45,212,191,.35);padding:.2rem .7rem;border-radius:9999px;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;}
.main-card-title{font-family:var(--font-h);font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:.3rem;}
.main-card-desc{font-size:.875rem;color:#cbd5e1;margin-bottom:.75rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.card-link{color:var(--teal);font-weight:600;font-size:.9rem;text-decoration:none;transition:color .2s;}
.card-link:hover{color:#fff;text-decoration:none;}
.area-groups-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;}
.area-group{background:var(--card-bg);border:1px solid var(--border);border-radius:.875rem;padding:1.25rem;}
.area-title{font-family:var(--font-h);font-size:1rem;font-weight:700;color:var(--teal);margin-bottom:.875rem;display:flex;align-items:center;gap:.5rem;}
.adot{width:8px;height:8px;border-radius:50%;background:var(--teal);flex-shrink:0;}
.place-list{list-style:none;display:flex;flex-direction:column;gap:.45rem;}
.place-link{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.45rem .75rem;background:rgba(255,255,255,.03);border:1px solid transparent;border-radius:.5rem;transition:all .2s;color:#cbd5e1;text-decoration:none;font-size:.9rem;}
.place-link:hover{background:rgba(45,212,191,.07);border-color:rgba(45,212,191,.3);color:var(--teal);text-decoration:none;}
.place-link--seo{border-color:rgba(45,212,191,.2);}
.pln{flex:1;font-weight:500;}
.plt{font-size:.75rem;color:var(--muted);background:var(--bg);border-radius:.35rem;padding:.15rem .5rem;}
.plb{font-size:.7rem;color:var(--teal);background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.25);border-radius:.35rem;padding:.1rem .45rem;white-space:nowrap;}
.area-details{background:var(--card-bg);border:1px solid var(--border);border-radius:.75rem;margin-bottom:.75rem;overflow:hidden;}
.area-summary{display:flex;align-items:center;justify-content:space-between;padding:.875rem 1.25rem;cursor:pointer;list-style:none;font-weight:600;color:#e2e8f0;font-size:.95rem;transition:background .15s;}
.area-summary:hover{background:rgba(255,255,255,.04);}
.area-summary::-webkit-details-marker{display:none;}
.area-count{background:var(--bg);color:var(--muted);border-radius:9999px;padding:.2rem .7rem;font-size:.8rem;font-weight:500;}
.adb{padding:.75rem 1.25rem 1rem;border-top:1px solid var(--border);}
.stg{margin-bottom:.6rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;}
.stl{font-size:.8rem;color:var(--muted);font-weight:600;min-width:80px;margin-right:.25rem;}
.small-link{font-size:.82rem;color:#94a3b8;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:.4rem;padding:.2rem .6rem;text-decoration:none;transition:all .15s;white-space:nowrap;}
.small-link:hover{color:var(--sky);border-color:var(--sky);background:rgba(56,189,248,.06);text-decoration:none;}
.site-footer{background:#090d16;border-top:1px solid var(--border);padding:2.5rem 1.5rem;color:var(--muted);font-size:.9rem;}
.footer-inner{max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1.5rem;}
.footer-inner h4{color:#fff;font-family:var(--font-h);margin-bottom:.3rem;}
.update-note{font-size:.8rem;color:var(--muted);margin-top:.5rem;font-style:italic;}
@media(max-width:640px){.main-cards-grid{grid-template-columns:1fr;}.area-groups-grid{grid-template-columns:1fr;}.nav-links{gap:.75rem;}}
</style>
</head>
<body>
<header class="site-header">
  <div class="nav-container">
    <a href="../index.html" class="brand-logo">Laukaa<span>Info</span></a>
    <ul class="nav-links">
      <li><a href="../index.html">Etusivu</a></li>
      <li><a href="../laukaa.html">Paikat</a></li>
      <li><a href="../asiahaku.html">Teemat</a></li>
      <li><a href="../ajankohtaista.html">Ajankohtaista</a></li>
    </ul>
  </div>
</header>

<section class="page-hero">
  <div class="page-hero-inner">
    <nav class="breadcrumb" aria-label="Murupolku">
      <a href="../index.html">Etusivu</a> &rsaquo; <span>Kohteet</span>
    </nav>
    <h1>Laukaan <em>kohteet</em> hakemisto</h1>
    <p class="page-hero-desc">Kattava luettelo Laukaan kunnan paikoista, nähtävyyksistä, alueista ja palveluista. Löydä päätaajamat, merkittävät kohteet ja pienemmät paikat – kaikki yhdestä paikasta.</p>
    <div class="meta-row">
      <span class="meta-chip">📍 ${total} kohdetta</span>
      <span class="meta-chip">🏘️ ${level4.length} päätaajamaa</span>
      <span class="meta-chip">🗺️ ${level3.length} merkittävää kohdetta</span>
      <span class="meta-chip">🔗 ${level12.length} pienempää paikkaa</span>
    </div>
  </div>
</section>

<main class="page-content">

  <div class="section-header">
    <h2>🏘️ Päätaajamat ja pääalueet</h2>
    <div class="section-line"></div>
    <span class="section-badge">${level4.length} aluetta</span>
  </div>
  <div class="main-cards-grid">
    ${mainCards || '<p style="color:var(--muted)">Ei pääkohteita</p>'}
  </div>

  <div class="section-header">
    <h2>🗺️ Merkittävät kohteet</h2>
    <div class="section-line"></div>
    <span class="section-badge">${level3.length} kohdetta</span>
  </div>
  <div class="area-groups-grid">
    ${html3 || '<p style="color:var(--muted)">Ei merkittäviä kohteita</p>'}
  </div>

  <div class="section-header">
    <h2>📋 Muut paikat alueittain</h2>
    <div class="section-line"></div>
    <span class="section-badge">${level12.length} kohdetta</span>
  </div>
  <p style="color:var(--muted);font-size:.9rem;margin-bottom:1.25rem;">Koulut, urheilu- ja vapaa-ajan kohteet, rakennukset ja muut paikat – avaa alue nähdäksesi kohteet.</p>
  ${html12 || '<p style="color:var(--muted)">Ei kohteita</p>'}

</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div>
      <h4>LaukaaInfo – Kohteet</h4>
      <p>Laukaan paikkojen, teemojen ja kokemusten digitaalinen hakemisto.</p>
      <p class="update-note">Päivitetty: ${dateStr} | Lähde: Supabase places-taulu</p>
    </div>
    <div>
      <p>&copy; 2026 LaukaaInfo &nbsp;•&nbsp;
         <a href="../tietosuoja.html">Tietosuoja</a> &nbsp;•&nbsp;
         <a href="../index.html">Palaa etusivulle</a>
      </p>
    </div>
  </div>
</footer>
</body>
</html>`;
}

// ─── Pääohjelma ───────────────────────────────────────────────────────────────
async function main() {
    console.log('============================================');
    console.log('📍 LaukaaInfo – Kohteet-hakemiston generointi');
    console.log('============================================');
    console.log('📡 Haetaan places-taulu Supabasesta...');

    const places = await fetchPlaces();

    const generatedAt = new Date().toISOString();
    const html = renderKohteetIndex(places, generatedAt);

    const outDir  = path.join(__dirname, 'kohteet');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, 'index.html');
    fs.writeFileSync(outFile, html, 'utf8');

    const active = places.filter(p => {
        const s = (p.status || '').toUpperCase();
        return s === 'PUBLISHED' || s === 'ACTIVE' || s === '';
    });
    console.log('\n✅ Valmis!');
    console.log(`   📄 Tiedosto: kohteet/index.html`);
    console.log(`   📊 Yhteensä: ${active.length} kohdetta`);
    console.log(`   🏘️  Importance 4+: ${active.filter(p => (p.importance||2) >= 4).length} pääkohdetta`);
    console.log(`   🗺️  Importance 3:  ${active.filter(p => (p.importance||2) === 3).length} merkittävää`);
    console.log(`   📋 Importance 1-2: ${active.filter(p => (p.importance||2) <= 2).length} pienempää`);
    console.log('============================================\n');
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ Virhe:', err);
        process.exit(1);
    });
}

module.exports = { main };
