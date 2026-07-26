// fix_aluesivut.js – Aluesivujen selkeytysskripti
// Aja: node scratch/fix_aluesivut.js

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const FILES = ['laukaa.html', 'lievestuore.html', 'leppavesi.html', 'vehnia.html', 'vihtavuori.html', 'koko-laukaa.html'];

for (const f of FILES) {
    const fp = path.join(BASE, f);
    if (!fs.existsSync(fp)) { console.log('PUUTTUU:', f); continue; }

    let c = fs.readFileSync(fp, 'utf8');
    let changed = false;

    // -----------------------------------------------------------------------
    // 1. KILPAILUTUS: siirrä banneri uutisosion (region-dashboard) jälkeen,
    //    mutta ennen nearby-section-osiota.
    // -----------------------------------------------------------------------
    const kilpRe = /(\s*<!--\s*KILPAILUTUS BANNER\s*-->[\s\S]*?<\/section>)/;
    const insertAnchor = '<section id="nearby-section"';

    const kilpMatch = c.match(kilpRe);
    if (kilpMatch && c.includes(insertAnchor)) {
        const kilpBlock = kilpMatch[1];
        // Poista kilpailutus-lohko alkuperäiseltä paikalta
        c = c.replace(kilpRe, '');
        // Lisää se ennen nearby-sectionia
        c = c.replace(insertAnchor, kilpBlock + '\n' + insertAnchor);
        console.log('  [OK] Kilpailutus siirretty alemmaksi:', f);
        changed = true;
    } else if (!kilpMatch) {
        console.log('  [SKIP] Kilpailutus ei löydy:', f);
    }

    // -----------------------------------------------------------------------
    // 2. KATEGORIAT-OSIO: Selkeämpi otsikko + ohjekuvaus
    // -----------------------------------------------------------------------
    c = c.replace(
        /(<h2 id="categories-title"[^>]*>)Kategoriat alueella(<\/h2>)/,
        '$1Selaa toimialoittain$2'
    );

    if (!c.includes('Valitse toimiala')) {
        c = c.replace(
            /(<div id="region-categories")/,
            '<p style="text-align:center;color:#64748b;margin:-0.5rem auto 1.5rem;max-width:600px;font-size:0.9rem;">' +
            'Valitse toimiala n&auml;hd&auml;ksesi kaikki alueen palveluntarjoajat kyseiselt&auml; alalta.' +
            '</p>\n$1'
        );
        console.log('  [OK] Kategoriat-kuvaus lisätty:', f);
        changed = true;
    }

    // -----------------------------------------------------------------------
    // 3. SUOSITELLUT YRITYKSET: Lisätään kuvausteksti
    // -----------------------------------------------------------------------
    if (!c.includes('Seuraavat yritykset')) {
        c = c.replace(
            /(<div id="catalog-list")/,
            '<p style="text-align:center;color:#e0f2fe;margin:-0.5rem auto 1.5rem;max-width:600px;font-size:0.9rem;opacity:0.85;">' +
            'Seuraavat yritykset tarjoavat palveluja t&auml;ll&auml; alueella &mdash; klikkaa korttia yhteys- ja lis&auml;tietoihin.' +
            '</p>\n$1'
        );
        console.log('  [OK] Suositellut-kuvaus lisätty:', f);
        changed = true;
    }

    // -----------------------------------------------------------------------
    // 4. LÄHELLÄ-OSIO: Parempi otsikko
    // -----------------------------------------------------------------------
    c = c.replace(
        /(<h2 data-i18n="title_nearby_area">)(L.hell. t.t. aluetta|Lähellä tätä aluetta)(<\/h2>)/,
        '$1Lähialueen palveluntarjoajat$3'
    );

    fs.writeFileSync(fp, c, 'utf8');
    console.log('Päivitetty:', f);
}

console.log('\nValmis!');
