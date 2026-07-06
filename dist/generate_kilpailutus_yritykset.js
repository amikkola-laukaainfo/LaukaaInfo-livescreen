// generate_kilpailutus_yritykset.js
// Poimii company_profiling_data.json:sta yritykset, joilla on sähköposti,
// ja tallentaa kevyen yritykset-kilpailutus.json:n tarjouspyynto-kansioon.

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, 'company_profiling_data.json');
const DEST = path.join(__dirname, '..', 'laukaainfo-web', 'tarjouspyynto', 'yritykset-kilpailutus.json');

console.log('Luetaan:', SRC);

let raw = fs.readFileSync(SRC, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // poista BOM
const data = JSON.parse(raw);

const profiles = data.profiles || {};
const tulokset = [];

// Puhdistaa sähköpostin markdown-linkistä: "[foo@bar.fi](mailto:foo@bar.fi)" -> "foo@bar.fi"
function puhdistaEmail(raw) {
    if (!raw) return '';
    const mdMatch = raw.match(/\[([^\]]+)\]\([^)]*\)/);
    if (mdMatch) return mdMatch[1].trim();
    return raw.replace(/^mailto:/i, '').trim();
}

for (const [id, p] of Object.entries(profiles)) {
    const email = puhdistaEmail(p.categories?.core?.email || '');
    if (!email || !email.includes('@')) continue; // vain yritykset joilla on sähköposti

    tulokset.push({
        id,
        nimi:          p.name || id,
        email,
        intent_codes:  p.core?.intent_codes  || [],
        fits_for:      p.core?.fits_for || {},   // { "media-and-marketing": 85, ... } pisteineen
    });
}

// Lajittele nimen mukaan
tulokset.sort((a, b) => a.nimi.localeCompare(b.nimi, 'fi'));

const output = { yritykset: tulokset, luotu: new Date().toISOString(), maara: tulokset.length };
fs.writeFileSync(DEST, JSON.stringify(output, null, 2), 'utf8');

console.log(`✓ Valmis! ${tulokset.length} yritystä (joilla sähköposti) tallennettu:`);
console.log(' ->', DEST);
