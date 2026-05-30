const fs = require('fs');

const profiled = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));

// Canonical lists from needs_config.js
const canonicalTags = new Set(["LVI", "brändäys", "digimarkkinointi", "digitointi", "drone", "edustustila", "elintarvike", "eläinkoulutus", "eläinlääkäri", "erikoisliikkeet", "fysioterapia", "google-mainonta", "graafiset palvelut", "harrastukset", "hautajaiskuvaus", "hautauspalvelu", "henkilöstöpalvelut", "hevonen", "hieronta", "hinaus", "hoivapalvelu", "hyvinvointi", "häät", "isännöinti", "it-palvelut", "juhlatila", "kampaamo", "kampaus", "kartano", "kauneus", "kaupat ja ostokset", "kiinteistöhuolto", "kissa", "koira", "koirahoitola", "kokoustilat", "konsultointi", "kotihoito", "kotisivut", "koululainen", "koulutus", "kukkakauppa", "kuljetus", "kuljetusliike", "kuntosali", "lahjatavarat", "lakiasiaintoimistot", "lapset", "leipomo", "lemmikkitarvikkeet", "liikunta", "liikuntakeskus", "lukkoseppä", "luonto", "maalaustyöt", "mainostoimisto", "majoitus", "meikki", "muistotilaisuudet", "muistotilaisuus", "musiikki", "muuttopalvelu", "nuohouspalvelut", "nuoret", "ohjelmapalvelut", "perhe", "perhepalvelut", "perunkirjoitus", "pieneläin", "pienkonehuolto", "pihasuunnittelu", "pitopalvelu", "polttopuut", "psykologi", "puhdistuspalvelut", "päivystys", "päiväkoti", "rakennuskonevuokraus", "rakennustarvikkeet", "rakennustyöt", "rakentaminen", "rautakauppa", "ravintola", "retkeily", "saunatilat", "seminaaritilat", "seniorit", "seurakunta", "siivous", "somemainonta", "suunnittelutoimisto", "sähköasennukset", "taksi", "terapia", "terveyspalvelut", "tilitoimisto", "trimmaus", "uimahalli", "urheiluseura", "vakiopalvelu", "vakuutus", "valokuvaaja", "valokuvaus", "varastointi", "vauva", "verkkokauppa", "verkkosivut", "video", "videokuvaaja", "videokuvaus", "videomarkkinointi", "videotuotanto", "viherrakentaminen", "yrityslahjat", "yritysneuvonta"]);

const canonicalSubContexts = new Set(["aikuisten synttärit", "bridal_services", "digimarkkinointi", "digitaalinen myynti", "edustuskokous", "edustustilaisuus", "elainhoitola", "elainlaakari", "elaintarvikkeet", "hautauspalvelu", "henkilöstöjuhlat", "hieronta", "isännöinti", "kauneudenhoito", "keittiöremontti", "kevatkunnostus", "kiinteistöhuolto", "kodin muutto", "kokous", "konferenssi", "konsultointi", "kuntosali", "kylpyhuoneremontti", "lasten harrastukset", "lasten synttärit", "lastentarvikkeet", "liikeidea", "linjasaneeraus", "mokkiremontti", "muistotilaisuus", "paivahoito", "perhetuki", "perinteiset häät", "perunkirjoitus", "pienet häät", "pienmuutto", "pikkujoulut", "pintaremontti", "polttopuut", "rekisterointi", "rekrytointi", "retkeily", "seminaari", "sukujuhlat", "talvivalvonta", "teemahäät", "terapia", "terveyspalvelut", "trimmaus", "tyky-paiva", "uinti", "urheiluseura", "uudisrakentaminen", "vihkiminen", "yritysmuutto"]);

const canonicalRefinementTags = new Set(["VHS / DVD digitointi", "brändäys", "diojen, negatiivien ja kaitafilmien digitointi", "drone-kuvaus", "hautajaiskuvaus", "hääkakku", "hääkuvaus", "häävideo", "häävideoiden editointi", "juhlakuvaus", "live-musiikki", "muisteluun soveltuvat diashow- ja kuvakirjapalvelut", "muistotilaisuuskuvaus", "ranta", "sauna", "valokuvien, diojen ja negatiivien digitointi", "vanhojen valokuvien digitointi", "verkkosivut", "videomarkkinointi", "videotuotanto", "yrityskuvat", "yritysvideot"]);

const mappings = {
    // Plurals to singulars (or canonical plurals)
    "muistotilaisuudet": "muistotilaisuus",
    "hääkakut": "hääkakku",
    "juhlakakut": "juhlakakku",
    "tilauskakut": "tilauskakku",
    "kokoustilat": "kokoustila",
    "juhlatilat": "juhlatila",
    "lomamökit": "lomamökki",
    "mökit": "mökki",
    "saunat": "sauna",
    "tyhy-päivät": "tyhy-päivä",
    "tyhy-päivä": "tyhy-päivä", // Keep as is if refining to this
    "tyky-paiva": "tyky-paiva",
    "syntymapaivat": "syntymäpäivät",
    "pikkujoulu": "pikkujoulut",
    "yritystapahtumat": "yritystapahtuma",
    "yritystilaisuudet": "yritystapahtuma",
    "kokouspalvelut": "kokous",
    "juhlapalvelut": "juhlapalvelu",
    "valokuvauspalvelut": "valokuvaus",
    "videokuvaus": "videokuvaus",
    "dronekuvaus": "drone-kuvaus",
    "ilmakuvaus": "drone-kuvaus",
    "aanentoisto": "äänentoisto",
    "poytaliinat": "pöytäliinat",
    "jarjestysmies": "järjestysmies",
    "jarvinakyma": "järvinäkymä",
    "strategiapaiva": "strategiapäivä"
};

function normalize(list, canonicalSet) {
    if (!Array.isArray(list)) return list;
    const result = new Set();
    list.forEach(item => {
        let normalized = item.toLowerCase().trim();
        // Check manual mappings
        if (mappings[normalized]) {
            normalized = mappings[normalized];
        }
        
        // Final check against canonical set if it exists
        // (Optional: we might want to keep non-canonical tags in core tags for general search)
        result.add(normalized);
    });
    return Array.from(result);
}

Object.values(profiled.profiles).forEach(p => {
    if (p.core) {
        if (p.core.sub_contexts) {
            p.core.sub_contexts = normalize(p.core.sub_contexts, canonicalSubContexts);
        }
        if (p.core.tags) {
            // tags might be a string in some versions, but profiling data schema says array
            if (typeof p.core.tags === 'string') {
                p.core.tags = p.core.tags.split(',').map(s => s.trim());
            }
            p.core.tags = normalize(p.core.tags, canonicalTags);
        }
    }
    
    // Process all category objects
    for (const key in p) {
        if (typeof p[key] === 'object' && p[key] !== null && Array.isArray(p[key].refinement_tags)) {
            p[key].refinement_tags = normalize(p[key].refinement_tags, canonicalRefinementTags);
        }
    }
});

fs.writeFileSync('company_profiling_data.json', JSON.stringify(profiled, null, 4));
console.log('Normalized company_profiling_data.json');
