const fs = require('fs');

// Mock data and environment
const profilingData = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));
const allCompanies = Object.keys(profilingData.profiles).map(id => ({
    id: id,
    nimi: profilingData.profiles[id].name,
    profiling: profilingData.profiles[id]
}));

// Mock functions from palvelu.html
function getFitsForScore(c, key) {
    if (!c.profiling || !c.profiling.core || !c.profiling.core.fits_for) return 0;
    const score = c.profiling.core.fits_for[key] || c.profiling.core.fits_for[key.replace(/_/g, '-')] || 0;
    return score;
}

// Test target option
const opt = { "label": "Kukkakauppa & Koristelu", "tags": ["kukkakauppa", "kukat"] };
const currentProfilingKey = 'events_and_celebrations';

console.log(`--- Testing Search for: "${opt.label}" ---`);

const floristId = 'company-131'; // Vehviläinen

const results = allCompanies.filter(c => {
    // Simplified filter logic
    const labelLower = (opt.label || '').toLowerCase();
    
    let isProfiledMatch = false;
    
    // Taxonomy match logic (mocked for 'kukat' in events_and_celebrations)
    const intentSubcontexts = ['juhlatila', 'kukat', 'kukkakauppa']; // Mocked updated taxonomy
    const isTaxonomyTerm = intentSubcontexts.some(s => labelLower.includes(s.toLowerCase()));
    
    if (isTaxonomyTerm) {
        const companyContent = (
            (c.tags || '') + ' ' + 
            (c.kategoria || '') + ' ' + 
            (c.nimi || '') + ' ' +
            (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
            (c.profiling?.core?.node_links?.join(' ') || '')
        ).toLowerCase();
        
        const taxonomyMatch = intentSubcontexts.some(term => {
            const t = term.toLowerCase();
            return labelLower.includes(t) && companyContent.includes(t);
        });
        if (taxonomyMatch) isProfiledMatch = true;
    }

    // Specialized broadening
    if (!isProfiledMatch && opt.tags) {
        const isFloristSearch = opt.tags.some(t => t.includes('kukka'));
        const coreNodeLinks = c.profiling?.core?.node_links || [];
        if (isFloristSearch && coreNodeLinks.includes('KUKAT')) {
            isProfiledMatch = true;
        }
    }

    // Final tag match
    const companyContent = (
        (c.tags || '') + ' ' + 
        (c.nimi || '') + ' ' +
        (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
        (c.profiling?.core?.node_links?.join(' ') || '')
    ).toLowerCase();
    const tagMatch = opt.tags.some(tag => companyContent.includes(tag.toLowerCase()));

    return isProfiledMatch || tagMatch;
});

const foundFlorist = results.find(r => r.id === floristId);
if (foundFlorist) {
    console.log(`SUCCESS: Florist "${foundFlorist.nimi}" found!`);
} else {
    console.log("FAILURE: Florist not found in results.");
}

console.log(`Total results found: ${results.length}`);
results.forEach(r => {
    if (r.id === floristId || results.length < 10) console.log(` - ${r.nimi} (${r.id})`);
});
