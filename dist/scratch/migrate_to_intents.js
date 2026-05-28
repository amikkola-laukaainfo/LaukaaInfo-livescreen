const fs = require('fs');
const path = require('path');

const profilingDataPath = path.join(__dirname, '..', 'company_profiling_data.json');
const taxonomyPath = path.join(__dirname, '..', 'taxonomy.json');

const profilingData = JSON.parse(fs.readFileSync(profilingDataPath, 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));

const nodeToIntent = {
    'JUHLATILA': 'VENUE_PARTY',
    'VALOKUVAUS': 'MEDIA_PHOTO',
    'VIDEOTUOTANTO': 'MEDIA_VIDEO',
    'DIGITOINTI': 'MEDIA_DIGITIZATION',
    'CATERING': 'BIZ_CATERING',
    'KUKAT': 'KUKAT', // Define code if needed
    'SAUNA': 'VENUE_PARTY', // Usually part of venue
    'MAJOITUS': 'VENUE_PARTY' // Usually part of venue or separate
};

const contextToIntent = {
    'events-and-celebrations': 'EVT_PARTY',
    'business-events': 'EVT_CORPORATE',
    'startup-services': 'BIZ_ADVISORY',
    'business-growth': 'BIZ_MARKETING',
    'moving-and-housing': 'HOME_MOVING',
    'construction-and-maintenance': 'HOME_RENOVATION',
    'cottage-services': 'HOME_MAINTENANCE',
    'funerals-and-memorials': 'EVT_MEMORIAL',
    'wellbeing-and-beauty': 'WELLBEING'
};

// Update taxonomy codes for better mapping
// Add generic codes to taxonomy if missing
if (!taxonomy.intents.EVT_PARTY) {
    taxonomy.intents.EVT_PARTY = { label: { fi: "Juhlat", en: "Parties" }, parent: "EVENTS", tags: ["juhla", "bileet"] };
}
if (!taxonomy.intents.WELLBEING) {
    taxonomy.intents.WELLBEING = { label: { fi: "Hyvinvointi", en: "Wellbeing" }, parent: "HEALTH", tags: ["hyvinvointi", "terveys"] };
}

Object.keys(profilingData.profiles).forEach(companyId => {
    const profile = profilingData.profiles[companyId];
    if (!profile.core) return;

    if (!profile.core.intent_codes) profile.core.intent_codes = [];
    if (!profile.core.intent_scores) profile.core.intent_scores = {};

    const intentCodes = new Set(profile.core.intent_codes);

    // 1. Map Node Links
    if (profile.core.node_links) {
        profile.core.node_links.forEach(node => {
            const intent = nodeToIntent[node];
            if (intent) {
                intentCodes.add(intent);
                if (!profile.core.intent_scores[intent]) {
                    profile.core.intent_scores[intent] = 100; // Direct node link is strong intent
                }
            }
        });
    }

    // 2. Map Fits For
    if (profile.core.fits_for) {
        Object.keys(profile.core.fits_for).forEach(context => {
            const score = profile.core.fits_for[context];
            if (score > 0) {
                const intent = contextToIntent[context];
                if (intent) {
                    intentCodes.add(intent);
                    profile.core.intent_scores[intent] = Math.max(profile.core.intent_scores[intent] || 0, score);
                }
            }
        });
    }

    // 3. Special Logic for Wedding (if it has wedding tags)
    const allTags = [
        ...(profile.core.sub_contexts || []),
        ...(profile.categories?.events_and_celebrations?.refinement_tags || [])
    ].map(t => t.toLowerCase());

    if (allTags.includes('häät') || allTags.includes('hääkuvaus') || allTags.includes('häävideo')) {
        intentCodes.add('EVT_WEDDING');
        const partyScore = profile.core.intent_scores['EVT_PARTY'] || 0;
        profile.core.intent_scores['EVT_WEDDING'] = Math.max(profile.core.intent_scores['EVT_WEDDING'] || 0, partyScore, 80);
    }

    profile.core.intent_codes = Array.from(intentCodes);
});

fs.writeFileSync(profilingDataPath, JSON.stringify(profilingData, null, 4), 'utf8');
console.log("Migration complete. Updated company_profiling_data.json");
