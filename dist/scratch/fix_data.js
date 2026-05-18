
const fs = require('fs');
const filePath = 'd:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const companiesToUpdate = ['company-2', 'company-133', 'company-154'];

companiesToUpdate.forEach(id => {
    const profile = data.profiles[id];
    if (!profile) return;

    // Add muistotilaisuus to sub_contexts
    if (!profile.core.sub_contexts) profile.core.sub_contexts = [];
    if (!profile.core.sub_contexts.includes('muistotilaisuus')) {
        profile.core.sub_contexts.unshift('muistotilaisuus');
    }

    // Standardize funerals_and_memorials refinement_tags
    const funerals = profile.funerals_and_memorials || profile['funerals-and-memorials'];
    if (funerals) {
        if (typeof funerals.refinement_tags === 'object' && !Array.isArray(funerals.refinement_tags)) {
            funerals.refinement_tags = Object.values(funerals.refinement_tags).flat();
        }
        if (Array.isArray(funerals.refinement_tags)) {
            if (!funerals.refinement_tags.includes('hautajaiskuvaus')) {
                funerals.refinement_tags.push('hautajaiskuvaus');
            }
        } else {
            funerals.refinement_tags = ['hautajaiskuvaus'];
        }
    }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('Updated companies successfully.');
