const fs = require('fs');
const path = require('path');

const companies = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/companies_data.json', 'utf8')).results;
const profiling = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));

const riina = companies.find(c => c.id === 'company-269');
if (!riina) {
    console.error("Riina Raitio not found in companies_data.json");
    process.exit(1);
}

riina.profiling = profiling.profiles['company-269'];

const opt = { 
    label: { fi: "Terveyspalvelut" }, 
    sub_context: "terveyspalvelut", 
    tags: ["terveyspalvelut"] 
};

const currentProfilingKey = "wellbeing_and_beauty";

function getFitsForScore(c, profilingKey) {
    const fits = c.profiling?.core?.fits_for || {};
    let score = fits[profilingKey] || fits[profilingKey.replace(/_/g, '-')] || 0;
    return score;
}

// Simulation of the filter logic in palvelu.html
const matches = companies.filter(c => {
    if (c.id === 'company-269') {
        c.profiling = profiling.profiles[c.id];
    }
    
    // Profiling score check (line 1417 in palvelu.html)
    if (c.profiling && c.profiling.core && c.profiling.core.fits_for) {
        const fitsScore = getFitsForScore(c, currentProfilingKey);
        const hasProfiling = (currentProfilingKey in c.profiling.core.fits_for) || (currentProfilingKey.replace(/_/g, '-') in c.profiling.core.fits_for);
        if (hasProfiling && fitsScore === 0) {
            if (c.id === 'company-269') console.log("Riina filtered out by score 0");
            return false;
        }
    }

    // Tag match
    const companyContent = ((c.tags || '') + ' ' + (c.kategoria || '') + ' ' + (c.nimi || '') + ' ' + (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' + (c.profiling?.core?.node_links?.join(' ') || '')).toLowerCase();
    const tagMatch = opt.tags.some(tag => companyContent.includes(tag.toLowerCase()));
    
    return tagMatch;
});

console.log("Matches found:", matches.length);
if (matches.find(m => m.id === 'company-269')) {
    console.log("Riina Raitio IS in matches.");
} else {
    console.log("Riina Raitio IS NOT in matches.");
    const c = riina;
    const companyContent = ((c.tags || '') + ' ' + (c.kategoria || '') + ' ' + (c.nimi || '') + ' ' + (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' + (c.profiling?.core?.node_links?.join(' ') || '')).toLowerCase();
    console.log("Company Content:", companyContent);
    console.log("Opt Tags:", opt.tags);
}
