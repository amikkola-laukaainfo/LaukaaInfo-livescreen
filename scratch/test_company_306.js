const fs = require('fs');

const THRESHOLD_STRICT = 80;

function normalizeText(txt) {
    if (!txt) return "";
    return String(txt).toLowerCase()
        .replace(/Ã£Â¤/g, 'ä').replace(/Ã£Â¶/g, 'ö')
        .replace(/Ã£â€ž/g, 'ä').replace(/Ã£â€“/g, 'ö')
        .replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö')
        .replace(/Ã„/g, 'ä').replace(/Ã–/g, 'ö')
        .replace(/Ã¥/g, 'å').replace(/Ã…/g, 'å')
        .trim();
}

function getCategoryData(c, profilingKey) {
    if (!c.profiling) return null;
    const hyphenKey = profilingKey.replace(/_/g, '-');
    if (c.profiling.categories) {
        return c.profiling.categories[profilingKey] || c.profiling.categories[hyphenKey] || c.profiling[profilingKey] || c.profiling[hyphenKey] || null;
    }
    return c.profiling[profilingKey] || c.profiling[hyphenKey] || null;
}

function getFitsForScore(c, profilingKey) {
    if (!c.profiling?.core?.fits_for) return 0;
    const fits = c.profiling.core.fits_for;
    const hyphenKey = profilingKey.replace(/_/g, '-');
    return fits[profilingKey] || fits[hyphenKey] || 0;
}

function getCompanyCapacity(c, profilingKey) {
    const data = getCategoryData(c, profilingKey);
    if (!data) return 0;
    return data.capacity_max || 
           data.meeting_capacity || 
           data.seminar_capacity || 
           data.seated_capacity || 
           data.memorial_service_capacity || 
           data.outdoor_capacity || 
           data.catering_max_capacity || 0;
}

function isMatch(c, opt, context, subContextsReq, noCateringSelected, taxonomyData) {
    const labelLower = normalizeText(opt.label && opt.label.fi ? opt.label.fi : opt.label).toLowerCase();
    const fitsScore = getFitsForScore(c, context);
    
    console.log(`Checking ${c.id} (${c.name}). FitsScore:`, fitsScore);
    
    let isProfiledMatch = false;

    const exclusions = (c.profiling && c.profiling.core && c.profiling.core.not_suitable_for) ? c.profiling.core.not_suitable_for : [];
    if (exclusions.some(exc => exc && labelLower.includes(normalizeText(exc).toLowerCase()))) {
        console.log("  Filtered by exclusion!");
        return false;
    }
    
    if (opt.intent_codes && c.profiling && c.profiling.core && c.profiling.core.intent_codes) {
        if (opt.intent_codes.some(code => c.profiling.core.intent_codes.includes(code))) {
            console.log("  Matched by intent code!");
            isProfiledMatch = true;
        }
    }

    if (opt.profilointi_filter) {
        const pf = opt.profilointi_filter;
        const sectionData = getCategoryData(c, pf.section);
        let match = false;

        console.log("  Has profilointi_filter:", pf);
        if (sectionData) {
            const actualVal = sectionData[pf.field];
            const checkFuzzyMatch = (a, b) => {
                if (a === b) return true;
                if (typeof a === 'string' && typeof b === 'string') {
                    const na = normalizeText(a);
                    const nb = normalizeText(b);
                    return na === nb || na === nb + 't' || nb === na + 't' || na.includes(nb) || nb.includes(na);
                }
                return false;
            };

            if (Array.isArray(actualVal)) match = actualVal.some(v => checkFuzzyMatch(v, pf.value));
            else if (typeof actualVal === 'object' && actualVal !== null) match = Object.values(actualVal).flat().some(v => checkFuzzyMatch(v, pf.value));
            else match = checkFuzzyMatch(actualVal, pf.value);

            if (!match && Array.isArray(sectionData.refinement_tags)) {
                match = sectionData.refinement_tags.some(v => checkFuzzyMatch(v, pf.value));
            }
            console.log("  Profilointi filter match result:", match);
        }
        
        isProfiledMatch = match;
    }

    if (!isProfiledMatch && opt.tags) {
        const companyContent = (
            (c.tags || '') + ' ' + 
            (c.kategoria || c.category || '') + ' ' + 
            (c.nimi || c.name || '')
        ).toLowerCase();

        console.log("  Checking tags in companyContent:", companyContent);
        const optTagsLower = opt.tags.map(t => normalizeText(t));
        if (optTagsLower.some(tag => {
            const nt = normalizeText(tag);
            const match = companyContent.includes(nt) || nt.split(' ').some(word => word.length > 3 && companyContent.includes(word));
            console.log(`    Tag "${tag}" match:`, match);
            return match;
        })) {
            console.log("  Matched by tags!");
            isProfiledMatch = true;
        }
    }

    const isVenueType = (opt.tags && opt.tags.includes('juhlatila')) || 
                        opt.node_link === 'JUHLATILA' || 
                        (labelLower.includes('tila') && !labelLower.includes('tilaisuus'));

    const isVenueSearch = (opt.capacity_req > 0 || 
                          isVenueType ||
                          labelLower.includes('muistotilaisuus') ||
                          labelLower.includes('kokous') ||
                          labelLower.includes('sauna') ||
                          labelLower.includes('juhla') ||
                          labelLower.includes('häät') ||
                          labelLower.includes('pikkujoulut')) && !opt.is_service;

    console.log("  isVenueSearch:", isVenueSearch, "isProfiledMatch:", isProfiledMatch);

    if (!opt.capacity_req && opt.node_link !== 'JUHLATILA') {
        const companyCap = getCompanyCapacity(c, context);
        console.log("  Company capacity for", context, ":", companyCap);
        if (companyCap > 0) {
            const intentScores = (c.profiling && c.profiling.core) ? c.profiling.core.intent_scores || {} : {};
            const hasStrongServiceMatch = (opt.intent_codes || []).some(code => (intentScores[code] || 0) >= THRESHOLD_STRICT);
            
            console.log("  hasStrongServiceMatch:", hasStrongServiceMatch);
            if (!hasStrongServiceMatch && fitsScore < THRESHOLD_STRICT) {
                console.log("  Filtered by capacity check (no strong match and low fitsScore)!");
                return false;
            }
        }
    }

    if (isProfiledMatch) {
        if (isVenueSearch) {
            const cap = getCompanyCapacity(c, context);
            if (cap === 0) {
                console.log("  Filtered by zero capacity in venue search!");
                return false;
            }
        }
        return true;
    }

    if (fitsScore === 0 && (c.profiling && c.profiling.core && c.profiling.core.fits_for)) {
        const hasProfiling = (context in c.profiling.core.fits_for) || (context.replace(/_/g, '-') in c.profiling.core.fits_for);
        if (hasProfiling) {
            console.log("  Filtered by zero fitsScore with profiling present!");
            return false;
        }
    }

    return false;
}

// Load Data
const companiesRaw = JSON.parse(fs.readFileSync('companies_data.json', 'utf8')).results;
let profilingContent = fs.readFileSync('company_profiling_data.json', 'utf8');
if (profilingContent.charCodeAt(0) === 0xFEFF) profilingContent = profilingContent.slice(1);
const profiling = JSON.parse(profilingContent);

const company = companiesRaw.find(c => c.id === 'company-306');
company.profiling = profiling.profiles['company-306'] || {};

const opt = { 
    label: { fi: "Kakut / Leivonnaiset" }, 
    tags: ["leipomo", "elintarvike"], 
    profilointi_filter: { section: "events_and_celebrations", field: "refinement_tags", value: "juhlakakku" } 
};

const result = isMatch(company, opt, 'syntymapaivat', [], false);
console.log("Final Result for company-306:", result);
