const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, 'company_profiling_data.json');
const outputDir = path.join(__dirname, 'profiling');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Read and strip BOM if present
let content = fs.readFileSync(dataFile, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
}
const data = JSON.parse(content);

const sectorFiles = {
    'venues-and-events.json': ['events-and-celebrations', 'business-events', 'funerals-and-memorials', 'juhlat-ja-merkkipäivät', 'häät', 'yritysjuhlat', 'kokoukset', 'pitopalvelu', 'juhlat', 'muistotilaisuus', 'hautajaiset', 'tyhy-päivät', 'yritystapahtumat', 'tapahtumien-järjestäminen', 'kokouspalvelut', 'tilausravintola', 'juhlapalvelut', 'yritystilaisuudet', 'tapahtumapalvelut', 'tapahtumatuotanto'],
    'media-and-marketing.json': ['startup-services', 'business-growth', 'yrityksen-kehittäminen', 'yrityksen-perustaminen', 'yritysneuvonta', 'rahoitusneuvonta', 'hankeneuvonta', 'tapahtumatekniikka', 'aanentoisto-palvelut', 'dj-palvelut', 'ohjelmapalvelut', 'äänentoistopalvelut'],
    'property-and-maintenance.json': ['construction-and-maintenance', 'cottage-services', 'housing-company-and-contracts', 'taloyhtiöpalvelut', 'lvi-palvelut', 'mökkipalvelut', 'kiinteistönhuolto', 'talonmiespalvelut', 'rakennusten-ylläpito', 'isännöinti', 'kiinteistöhallinto', 'kiinteistokonsultointi'],
    'wellbeing-and-family.json': ['wellbeing-and-beauty', 'animals', 'family-and-children', 'moving-and-housing', 'hyvinvointi-ja-kauneus', 'ikäihmisten-palvelut', 'omaishoitajien-tuki', 'kotipalvelut', 'arjen-apu', 'hyvinvointi', 'hieronta', 'urheiluhieronta', 'hyvinvointipalvelut', 'kuntoutus', 'asumisen-palvelut', 'muutto'],
    'mixed-local-services.json': ['kahvila', 'ravintola', 'lounas', 'catering', 'majoituspalvelut', 'venevuokraus', 'kukkakauppa', 'huonekalumyynti', 'kodinsisustus', 'kuljetuspalvelut', 'autohuolto', 'rengaspalvelu']
};

const results = {
    'venues-and-events.json': {},
    'media-and-marketing.json': {},
    'property-and-maintenance.json': {},
    'wellbeing-and-family.json': {},
    'mixed-local-services.json': {},
    'business-services.json': {} // Optional, as in plan
};

const profiles = data.profiles;
const companyToFile = {};

Object.entries(profiles).forEach(([id, profile]) => {
    let assignedFile = 'mixed-local-services.json';
    let maxScore = 0;

    if (profile.core && profile.core.fits_for) {
        Object.entries(profile.core.fits_for).forEach(([key, score]) => {
            if (score > maxScore) {
                // Find which file this key belongs to
                for (const [filename, keys] of Object.entries(sectorFiles)) {
                    if (keys.includes(key)) {
                        assignedFile = filename;
                        maxScore = score;
                        break;
                    }
                }
            }
        });
    }

    // Special logic for categories if no fits_for matches
    if (maxScore === 0 && profile.categories) {
        if (profile.categories.events_and_celebrations || profile.categories.business_events) {
            assignedFile = 'venues-and-events.json';
        } else if (profile.categories.wellbeing_and_beauty || profile.categories.animals || profile.categories.family_and_children) {
            assignedFile = 'wellbeing-and-family.json';
        }
        // Add more heuristics as needed
    }

    results[assignedFile][id] = profile;
    companyToFile[id] = assignedFile;
});

// Write sector files
Object.entries(results).forEach(([filename, content]) => {
    if (Object.keys(content).length > 0) {
        fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(content, null, 4));
        console.log(`Wrote ${filename} with ${Object.keys(content).length} profiles.`);
    }
});

// Write metadata/index file
const metadata = {
    SCHEMA_VERSION: data.SCHEMA_VERSION,
    DESCRIPTION: data.DESCRIPTION,
    nodes: data.nodes || {},
    company_index: companyToFile,
    files: Object.keys(results).filter(f => Object.keys(results[f]).length > 0)
};

fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 4));
console.log('Wrote metadata.json');
