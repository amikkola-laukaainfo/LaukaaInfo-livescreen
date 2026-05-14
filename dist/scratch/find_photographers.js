
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));

const results = [];
for (const id in data.profiles) {
    const profile = data.profiles[id];
    const funerals = profile.funerals_and_memorials || profile['funerals-and-memorials'] || {};
    
    let hasHautajaiskuvaus = false;
    
    // Check refinement_tags
    if (funerals.refinement_tags) {
        if (Array.isArray(funerals.refinement_tags)) {
            if (funerals.refinement_tags.includes('hautajaiskuvaus')) hasHautajaiskuvaus = true;
        } else if (typeof funerals.refinement_tags === 'object') {
            const allTags = Object.values(funerals.refinement_tags).flat();
            if (allTags.includes('hautajaiskuvaus')) hasHautajaiskuvaus = true;
        }
    }
    
    // Check sub_contexts in core
    if (profile.core && profile.core.sub_contexts) {
        if (Array.isArray(profile.core.sub_contexts)) {
            if (profile.core.sub_contexts.includes('hautajaiskuvaus')) hasHautajaiskuvaus = true;
        }
    }
    
    if (hasHautajaiskuvaus) {
        results.push({
            id,
            name: profile.name,
            fits_for_funerals: profile.core?.fits_for?.['funerals-and-memorials'] || profile.core?.fits_for?.['funerals_and_memorials'] || 0
        });
    }
}

console.log(JSON.stringify(results, null, 2));
