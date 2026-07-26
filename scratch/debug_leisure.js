
const fs = require('fs');
const path = require('path');

// Mock NEEDS_CONFIG
const NEEDS_CONFIG = {
    "liikunta-ja-vapaaaika": {
        "title": "Liikunta ja vapaa-aika",
        "icon": "⚽",
        "description": "Harrastuksia ja liikuntaa kaikenikäisille.",
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tyyppi",
                "question": "Millaista vapaa-ajan kohdetta tai palvelua etsit?",
                "options": [
                    { "label": "Uinti", "tags": ["uinti", "uimahalli", "kylpylä"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "peurunka" } },
                    { "label": "Koskenlasku", "tags": ["koskenlasku", "vesiaktiviteetit"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "varjola" } },
                    { "label": "Golf", "tags": ["golf", "ulkoilu"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "revontuli" } },
                    { "label": "Ratsastus", "tags": ["ratsastus", "hevonen"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "ratsastus" } },
                    { "label": "Huvipuisto", "tags": ["lapset", "huvipuisto"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "nokkakivi" } },
                    { "label": "Luontoretkeily", "tags": ["retkeily", "luonto"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "multamäki" } },
                    { "label": "Kuntosali", "tags": ["kuntosali", "liikuntakeskus"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "refinement_tags", "value": "kuntosali" } }
                ]
            }
        ]
    }
};

const companyProfilingData = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));
const companiesData = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/companies_data.json', 'utf8'));

const allCompanies = companiesData.results || companiesData;

function getCategoryData(c, key) {
    if (!c || !c.profiling) return null;
    const keyMap = {
        'weddings_and_parties': 'events_and_celebrations',
        'corporate_parties_and_events': 'events_and_celebrations',
        'meetings_and_seminars': 'business_events',
        'starting_a_business': 'startup_services',
        'business_growth_and_dev': 'business_growth',
        'construction_and_renovation': 'construction_and_maintenance',
        'housing_companies_and_real_estate': 'housing_company_and_contracts'
    };
    const mappedKey = keyMap[key] || key;
    const underscoreKey = mappedKey.replace(/-/g, '_');
    const hyphenKey = mappedKey.replace(/_/g, '-');
    return c.profiling[underscoreKey] || c.profiling[hyphenKey] || c.profiling[mappedKey] || c.profiling[key];
}

const checkFuzzyMatch = (target, query) => {
    if (target === undefined || target === null || query === undefined || query === null) return false;
    const t = String(target).toLowerCase();
    const q = String(query).toLowerCase();
    const isPluralMatch = (t === q + 't' || q === t + 't');
    return t === q || t.includes(q) || q.includes(t) || isPluralMatch;
};

const need = NEEDS_CONFIG["liikunta-ja-vapaaaika"];
const step = need.steps[0];

console.log(`Checking ${allCompanies.length} companies...`);

step.options.forEach(opt => {
    const matches = allCompanies.filter(c => {
        // Attach profiling
        const id = c.id.startsWith('company-') ? c.id : `company-${c.id}`;
        c.profiling = companyProfilingData.profiles[id];
        if (!c.profiling) return false;

        let isProfiledMatch = false;
        if (opt.profilointi_filter) {
            const pf = opt.profilointi_filter;
            const catData = getCategoryData(c, pf.section);
            let match = false;

            if (catData) {
                const actualVal = catData[pf.field];
                if (Array.isArray(actualVal)) {
                    match = actualVal.some(v => checkFuzzyMatch(v, pf.value));
                } else if (typeof actualVal === 'object' && actualVal !== null) {
                    match = Object.values(actualVal).flat().some(v => checkFuzzyMatch(v, pf.value));
                } else {
                    match = checkFuzzyMatch(actualVal, pf.value);
                }

                if (!match && Array.isArray(catData.refinement_tags)) {
                    match = catData.refinement_tags.some(v => checkFuzzyMatch(v, pf.value));
                }
            }
            isProfiledMatch = match;
        }

        if (isProfiledMatch) return true;

        const companyContent = (
            (c.tags || '') + ' ' + 
            (c.kategoria || '') + ' ' + 
            (c.nimi || '') + ' ' +
            (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
            (c.profiling?.core?.node_links?.join(' ') || '')
        ).toLowerCase();
        
        const tagMatch = opt.tags.some(tag => companyContent.includes(tag.toLowerCase()));
        return tagMatch;
    });

    console.log(`Option "${opt.label}" matches ${matches.length} companies.`);
    if (matches.length > 0) {
        console.log(`   Sample: ${matches.slice(0, 3).map(m => m.nimi).join(', ')}`);
    }
});
