const fs = require('fs');

// Mock data and environment
const profilingData = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));
const allCompanies = Object.keys(profilingData.profiles).map(id => ({
    id: id,
    nimi: profilingData.profiles[id].name,
    profiling: profilingData.profiles[id]
}));

// Mock functions from palvelu.html
function getCategoryData(c, section) {
    if (!c.profiling || !c.profiling[section]) return null;
    return c.profiling[section];
}

function checkFuzzyMatch(target, query) {
    if (target === undefined || target === null || query === undefined || query === null) return false;
    const t = String(target).toLowerCase();
    const q = String(query).toLowerCase();
    const isPluralMatch = (t === q + 't' || q === t + 't');
    return t === q || t.includes(q) || q.includes(t) || isPluralMatch;
}

// Test target option
const opt = { 
    "label": "Tila omilla tarjoiluilla", 
    "tags": ["juhlatila"], 
    "capacity_req": 20, 
    "node_link": "JUHLATILA", 
    "profilointi_filter": { "section": "events_and_celebrations", "field": "own_catering_allowed", "value": true } 
};

const currentProfilingKey = 'events_and_celebrations';

console.log(`--- Testing Search for: "${opt.label}" ---`);

const problematicIds = ['company-290', 'company-289']; // Revontuli Resort and Taulun Kartano

const results = allCompanies.filter(c => {
    // START FILTER LOGIC (copied from palvelu.html)
    const isMediazoo = false;
    
    // Tarkista not_suitable_for
    if (c.profiling?.core?.not_suitable_for?.length > 0) {
        const notSuitable = c.profiling.core.not_suitable_for.map(s => s.toLowerCase());
        const labelLower = (opt.label || '').toLowerCase();
        const optTagsLower = (opt.tags || []).map(t => t.toLowerCase());

        const labelBlocked = notSuitable.some(s => labelLower.includes(s));
        const tagBlocked = optTagsLower.some(tag => notSuitable.includes(tag));

        if (labelBlocked || tagBlocked) {
            return false;
        }
    }

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
            if (match && c.id === 'company-282') console.log(`DEBUG company-282: Match on primary field: ${pf.field} = ${actualVal}`);
            
            if (!match && Array.isArray(catData.refinement_tags)) {
                match = catData.refinement_tags.some(v => checkFuzzyMatch(v, pf.value));
                if (match && c.id === 'company-282') console.log(`DEBUG company-282: Match on refinement_tags`);
            }
        }

        if (!match && c.profiling?.core?.sub_contexts) {
            const subContexts = c.profiling.core.sub_contexts;
            if (Array.isArray(subContexts)) {
                match = subContexts.some(v => checkFuzzyMatch(v, pf.value));
                if (match && c.id === 'company-282') console.log(`DEBUG company-282: Match on sub_contexts: ${subContexts}`);
            }
        }

        if (opt.node_link || opt.node_links) {
            // Node link check
            const links = c.profiling?.core?.node_links || [];
            let nodeLinkMatch = false;
            if (opt.node_link && links.includes(opt.node_link)) nodeLinkMatch = true;
            if (opt.node_links && opt.node_links.some(l => links.includes(l))) nodeLinkMatch = true;
            
            if (c.id === 'company-282') console.log(`DEBUG company-282: nodeLinkMatch=${nodeLinkMatch}, match=${match}`);
            isProfiledMatch = nodeLinkMatch && match;
        } else {
            isProfiledMatch = match;
        }
    }

    // Taxonomy fallback (simplified for node link check)
    // In our fix, this is skipped if opt.profilointi_filter is present
    if (false && !isProfiledMatch && !opt.profilointi_filter) {
        // ... (skipped as per fix)
    }

    return isProfiledMatch;
    // END FILTER LOGIC
});

const foundProblematic = results.filter(r => problematicIds.includes(r.id));
if (foundProblematic.length === 0) {
    console.log("SUCCESS: Problematic companies are correctly excluded!");
} else {
    console.log("FAILURE: Found problematic companies in results:");
    foundProblematic.forEach(r => console.log(` - ${r.nimi} (${r.id})`));
}

console.log(`Total results found: ${results.length}`);
results.forEach(r => console.log(` - Match: ${r.nimi} (${r.id})`));
