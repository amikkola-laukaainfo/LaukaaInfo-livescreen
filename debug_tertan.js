// debug_tertan.js - Testaa scoreCompanies logiikka paikallisesti
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./live_companies.json', 'utf8'));
const allCompanies = data.results || [];

// Simuloi "Tertan alue" placeData Supabasesta
// Jos et tiedä tarkkoja arvoja, kokeile eri koordinaatteja
const placeData = {
    name: 'Tertan alue',
    canonical_name: 'Tertan alue',
    lat: 62.3421842,   // Tertan kahvila koordinaatit
    lon: 25.9688631,
    alue_slug: null,
    commercial_visibility: undefined  // undefined = ei asetettu = sallitaan
};

// Simuloi parentPlace (Vihtavuori)
const parentPlace = {
    name: 'Vihtavuori',
    lat: 62.3166191,  // Vuonteen Helmen koordinaatit approx Vihtavuori-alue
    lon: 25.9856448
};

function haversineKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

const toSlugGlobal = (text) => text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
    .replace(/[^\w\-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');

// Tarkista Tertan kahvila ja Vuonteen Helmi
const targets = ['company-270', 'company-276'];

for (const targetId of targets) {
    const company = allCompanies.find(c => c.id === targetId);
    if (!company) { console.log(`${targetId}: EI LÖYDY`); continue; }

    let score = 0, tier = 99;
    const reasons = [];

    if (placeData.commercial_visibility !== false) {
        const cSlug = toSlugGlobal(company.alue_slug || '');
        const pSlug = toSlugGlobal(placeData.name || '');
        const pAreaSlug = placeData.alue_slug ? toSlugGlobal(placeData.alue_slug) : '';
        const parentSlug = parentPlace ? toSlugGlobal(parentPlace.name || '') : '';

        console.log(`\n${company.nimi} (${targetId}):`);
        console.log(`  cSlug="${cSlug}" pSlug="${pSlug}" parentSlug="${parentSlug}" pAreaSlug="${pAreaSlug}"`);

        if (cSlug && pSlug && cSlug === pSlug) {
            score += 80; tier = 1;
            reasons.push('AREA_EXACT');
        } else if (cSlug && ((parentSlug && cSlug === parentSlug) || (pAreaSlug && cSlug === pAreaSlug))) {
            score += 50; tier = Math.min(tier, 2);
            reasons.push('PARENT_AREA');
        }

        const cLon = company.lon || company.lng;
        const distToPlace = (placeData.lat && placeData.lon && company.lat && cLon) ? haversineKm(Number(company.lat), Number(cLon), Number(placeData.lat), Number(placeData.lon)) : null;
        const distToParent = (parentPlace?.lat && parentPlace?.lon && company.lat && cLon) ? haversineKm(Number(company.lat), Number(cLon), Number(parentPlace.lat), Number(parentPlace.lon)) : null;

        const dist = distToPlace !== null ? distToPlace : distToParent;
        const distThreshold = distToPlace !== null ? 3.0 : 5.0;

        if (dist !== null) {
            console.log(`  Etäisyys: ${dist?.toFixed(3)} km (threshold: ${distThreshold} km, distToPlace: ${distToPlace?.toFixed(3)}, distToParent: ${distToParent?.toFixed(3)})`);
            if (dist < distThreshold) {
                score += Math.max(10, Math.round(70 - (dist / distThreshold) * 60));
                tier = Math.min(tier, 1);
                reasons.push(`NEAR_${dist.toFixed(2)}km`);
            } else {
                console.log(`  !! ETÄISYYS YLITTYY - ei mukaan`);
            }
        } else {
            console.log(`  !! Etäisyyslasku ohitettu: company.lat=${company.lat}`);
        }
    } else {
        console.log(`  !! commercial_visibility === false -> ohitetaan`);
    }

    console.log(`  Tulos: score=${score} tier=${tier} reasons=${JSON.stringify(reasons)}`);
    console.log(`  Mukaan tulostukseen: ${tier <= 99 && score > 0 ? 'KYLLÄ ✓' : 'EI ✗'}`);
}
