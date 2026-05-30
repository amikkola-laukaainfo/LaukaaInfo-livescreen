/**
 * Migroi olemassa olevat profiilisignaalit → capabilities-objekti (v6).
 *
 * Käyttö:
 *   node scratch/migrate_capabilities.js              # dry-run, yhteenveto
 *   node scratch/migrate_capabilities.js --write      # kirjoita tiedostoon
 *   node scratch/migrate_capabilities.js --write --ids company-278,company-263
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'company_profiling_data.json');
const WRITE = process.argv.includes('--write');
const ID_FILTER = (() => {
    const idx = process.argv.indexOf('--ids');
    if (idx === -1 || !process.argv[idx + 1]) return null;
    return new Set(process.argv[idx + 1].split(',').map(s => s.trim()));
})();

const SUBCONTEXT_MAP = {
    'sup-lauta': 'SUP_RENTAL',
    'sup': 'SUP_RENTAL',
    'vesijetti': 'WATERCRAFT_RENTAL',
    'veneily': 'WATERCRAFT_RENTAL',
    'venevuokraus': 'WATERCRAFT_RENTAL',
    'koskenlasku': 'CANOE_RENTAL',
    'melonta': 'CANOE_RENTAL',
    'kanootti': 'CANOE_RENTAL',
    'fatbike': 'FATBIKE_RENTAL',
    'drone-kuvaus': 'DRONE_FILMING',
    'ilmakuvaus': 'DRONE_FILMING',
    'drone': 'DRONE_FILMING',
    'rakennuskonevuokraus': 'EQUIPMENT_RENTAL',
    'konevuokraus': 'EQUIPMENT_RENTAL',
    'laitteistovuokraus': 'EQUIPMENT_RENTAL',
    'laitevuokraus': 'EQUIPMENT_RENTAL',
    'soitinvuokraus': 'AV_RENTAL',
    'peräkärry': 'TRAILER_RENTAL',
    'peräkärryn vuokraus': 'TRAILER_RENTAL',
    'striimaus': 'LIVE_STREAMING',
    'live-lähetys': 'LIVE_STREAMING',
    'saunavuokraus': 'SAUNA_FACILITY',
    'juhlateltta': 'TENT_RENTAL',
    'telttavuokraus': 'TENT_RENTAL',
    'vene': 'WATERCRAFT_RENTAL',
    'drone': 'DRONE_FILMING',
    'livestriimaus': 'LIVE_STREAMING'
};

const INTENT_TO_CAPABILITY = {
    MEDIA_DRONE: { code: 'DRONE_FILMING', minScore: 40 },
    RENO_RENTAL: { code: 'EQUIPMENT_RENTAL', minScore: 25 },
    MOVE_TRANSPORT: { code: 'TRAILER_RENTAL', minScore: 35 },
    REC_RAFTING: { code: 'CANOE_RENTAL', minScore: 50 },
    REC_OUTDOOR: { code: null } // vain tekstipohjainen, ei automaattista
};

const TEXT_PATTERNS = [
    { re: /astiavuokra|vuokra[- ]?astiat|astian vuokraus|astiaston vuokraus/i, code: 'DISH_RENTAL', priority: 0.85 },
    { re: /fatbike|fat[- ]?bike/i, code: 'FATBIKE_RENTAL', priority: 0.85 },
    { re: /kanoot|koskenlasku|melonta|kajak/i, code: 'CANOE_RENTAL', priority: 0.8 },
    { re: /\bsup\b|sup[- ]?lauta/i, code: 'SUP_RENTAL', priority: 0.85 },
    { re: /vesijetti|venevuokraus|veneen vuokra/i, code: 'WATERCRAFT_RENTAL', priority: 0.85 },
    { re: /rakennuskonevuokraus|konevuokraus|laitteistovuokraus|laitevuokraus/i, code: 'EQUIPMENT_RENTAL', priority: 0.8 },
    { re: /peräkärry|peräkärryn vuokraus/i, code: 'TRAILER_RENTAL', priority: 0.85 },
    { re: /(äänentoisto|tapahtumatekniikka|valotekniikka).{0,40}vuokra|vuokra.{0,40}(äänentoisto|tapahtumatekniikka)/i, code: 'AV_RENTAL', priority: 0.75 },
    { re: /\bdrone\b|ilmakuvaus/i, code: 'DRONE_FILMING', priority: 0.8 },
    { re: /live[- ]?striim|striimauspalvelu/i, code: 'LIVE_STREAMING', priority: 0.8 },
    { re: /juhlateltta|telttavuokraus/i, code: 'TENT_RENTAL', priority: 0.8 }
];

const CATEGORY_FIELDS = [
    { field: 'drone_available', code: 'DRONE_FILMING', when: v => v === true },
    { field: 'has_sauna', code: 'SAUNA_FACILITY', when: v => v === true },
    { field: 'is_accessible', code: 'ACCESSIBLE', when: v => v === true },
    { field: 'has_av_tech', code: 'AV_RENTAL', when: v => v === true }
];

const FEATURE_FIELDS = ['entertainment_features', 'digitization_features', 'equipment_features'];

function readJsonClean(filePath) {
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
}

function normalizeSub(s) {
    return String(s).toLowerCase().trim();
}

function normalizeCapabilityEntry(entry) {
    const next = entry ? { ...entry } : {};
    const specs = { ...(next.specs || {}) };

    if (!next.inventory && Array.isArray(specs.inventory)) {
        next.inventory = specs.inventory
            .filter(x => x != null)
            .map(x => (typeof x === 'string' ? { type: x } : x));
        delete specs.inventory;
    }
    if (!next.additional_inventory && Array.isArray(specs.additional_inventory)) {
        next.additional_inventory = [...specs.additional_inventory];
        delete specs.additional_inventory;
    }
    next.specs = specs;
    return next;
}

function mergeCapability(existing, code, meta) {
    const next = existing[code] ? normalizeCapabilityEntry(existing[code]) : normalizeCapabilityEntry({
        available: true,
        priority_score: 0.75,
        confidence: 'inferred',
        source: 'migration',
        inventory: [],
        additional_inventory: []
    });
    if (!next.specs) next.specs = {};
    if (meta.specs) Object.assign(next.specs, meta.specs);
    if (meta.priority_score != null) {
        next.priority_score = Math.max(next.priority_score || 0, meta.priority_score);
    }
    return next;
}

function mapToken(token) {
    const key = normalizeSub(token);
    return SUBCONTEXT_MAP[key] || null;
}

function collectStrings(value, out, depth = 0) {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
        out.push(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(v => collectStrings(v, out, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (k === 'capabilities' || k === 'paired_with_by_context') continue;
            collectStrings(v, out, depth + 1);
        }
    }
}

function inferCapabilities(profile) {
    const caps = {};
    const add = (code, meta = {}) => {
        if (!code) return;
        caps[code] = mergeCapability(caps, code, meta);
    };

    const subContexts = profile.core?.sub_contexts;
    const subList = Array.isArray(subContexts)
        ? subContexts
        : subContexts && typeof subContexts === 'object'
            ? Object.values(subContexts).flat()
            : [];

    subList.forEach(sc => {
        const mapped = mapToken(sc);
        if (mapped) add(mapped, { priority_score: 0.85 });
    });

    if (profile.tags) {
        String(profile.tags).split(/[,;|]/).forEach(t => {
            const mapped = mapToken(t);
            if (mapped) add(mapped, { priority_score: 0.8 });
        });
    }

    const intentCodes = profile.core?.intent_codes || [];
    const intentScores = profile.core?.intent_scores || {};
    intentCodes.forEach(code => {
        const rule = INTENT_TO_CAPABILITY[code];
        if (!rule || !rule.code) return;
        const score = intentScores[code];
        if (score != null && score < rule.minScore) return;
        const priority = score != null ? Math.min(1, score / 100) : 0.7;
        add(rule.code, { priority_score: priority });
    });

    const categories = profile.categories || {};
    Object.values(categories).forEach(section => {
        if (!section || typeof section !== 'object') return;
        CATEGORY_FIELDS.forEach(({ field, code, when }) => {
            if (field in section && when(section[field])) {
                add(code, { priority_score: 0.8 });
            }
        });

        const tags = section.refinement_tags;
        const tagList = Array.isArray(tags) ? tags : tags && typeof tags === 'object' ? Object.values(tags).flat() : [];
        tagList.forEach(t => {
            const mapped = mapToken(t);
            if (mapped) add(mapped, { priority_score: 0.8 });
        });

        FEATURE_FIELDS.forEach(field => {
            const feat = section[field];
            if (!feat) return;
            const list = Array.isArray(feat) ? feat : typeof feat === 'object' ? Object.values(feat).flat() : [feat];
            list.forEach(t => {
                const mapped = mapToken(t);
                if (mapped) add(mapped, { priority_score: 0.8 });
            });
        });
    });

    const textParts = [];
    collectStrings(profile, textParts);
    const blob = textParts.join(' ').toLowerCase();

    TEXT_PATTERNS.forEach(({ re, code, priority }) => {
        if (re.test(blob)) add(code, { priority_score: priority });
    });

    return caps;
}

function main() {
    const data = readJsonClean(DATA_PATH);
    const profiles = data.profiles || data;
    let updated = 0;
    const report = [];

    for (const [id, profile] of Object.entries(profiles)) {
        if (ID_FILTER && !ID_FILTER.has(id)) continue;
        if (!profile || typeof profile !== 'object') continue;

        const inferred = inferCapabilities(profile);
        const codes = Object.keys(inferred);
        if (codes.length === 0) continue;

        const existing = profile.capabilities || {};
        const merged = { ...existing };
        codes.forEach(code => {
            merged[code] = mergeCapability(merged, code, inferred[code]);
        });

        const added = codes.filter(c => !existing[c]);
        const changed = JSON.stringify(existing) !== JSON.stringify(merged);
        if (!changed) continue;

        report.push({ id, name: profile.name, added, total: Object.keys(merged).length });
        if (WRITE) {
            profile.capabilities = Object.fromEntries(
                Object.entries(merged).map(([k, v]) => [k, normalizeCapabilityEntry(v)])
            );
        }
        updated++;
    }

    const allIds = Object.keys(profiles);
    const withCaps = allIds.filter(id => {
        const c = profiles[id]?.capabilities;
        return c && Object.keys(c).length > 0;
    });

    console.log(WRITE ? 'WRITE mode' : 'DRY-RUN');
    console.log(`Profiles total: ${allIds.length}`);
    console.log(`With capabilities (after): ${withCaps.length}`);
    console.log(`Updated this run: ${updated}`);
    report.slice(0, 40).forEach(r => {
        console.log(`  ${r.id} (${r.name}): +[${r.added.join(', ')}] → ${r.total} capabilities`);
    });
    if (report.length > 40) console.log(`  ... and ${report.length - 40} more`);

    if (WRITE && updated > 0) {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4), 'utf8');
        console.log('Saved', DATA_PATH);
    } else if (!WRITE && updated > 0) {
        console.log('Run with --write to apply changes.');
    }
}

main();
