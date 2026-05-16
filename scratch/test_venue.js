const fs = require('fs');

const companies = JSON.parse(fs.readFileSync('./company_profiling_data.json', 'utf8'));
const tupaswillaData = companies.profiles['company-243'];
const tupaswilla = { id: 'company-243', profiling: tupaswillaData, nimi: tupaswillaData.name, tags: tupaswillaData.tags, kategoria: '' };
console.log("Found Tupaswilla:", !!tupaswillaData);

const opt = { 
    "id": "OPT_WED_VENUE_LARGE", 
    "label": { "fi": "Iso juhlatila (yli 50 hlö)", "en": "Large party venue (over 50 ppl)" }, 
    "tags": ["juhlatila"], 
    "capacity_req": 100, 
    "node_link": "JUHLATILA", 
    "intent_codes": ["VENUE_PARTY"] 
};

function getCategoryData(c, profilingKey) {
    if (!c.profiling) return null;
    const hyphenKey = profilingKey.replace(/_/g, '-');
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
    console.log("getCategoryData for", profilingKey, ":", data);
    if (!data) return 0;
    return data.capacity_max || 
           data.meeting_capacity || 
           data.seminar_capacity || 
           data.seated_capacity || 
           data.memorial_service_capacity || 
           data.outdoor_capacity || 
           data.catering_max_capacity || 0;
}

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

const THRESHOLD_STRICT = 80;

function isMatchTrace(c, opt, context, subContextsReq, noCateringSelected, taxonomyData) {
    const labelLower = normalizeText(opt.label && opt.label.fi ? opt.label.fi : opt.label).toLowerCase();
    const fitsScore = getFitsForScore(c, context);
    console.log("fitsScore:", fitsScore);
    const underscoreKey = context.replace(/-/g, '_');
    const hyphenKey = context.replace(/_/g, '-');
    
    let isProfiledMatch = false;

    const exclusions = (c.profiling && c.profiling.core && c.profiling.core.not_suitable_for) ? c.profiling.core.not_suitable_for : [];
    if (exclusions.some(exc => exc && labelLower.includes(normalizeText(exc).toLowerCase()))) {
        console.log("failed at exclusions");
        return false;
    }
    
    if (opt.intent_codes && c.profiling && c.profiling.core && c.profiling.core.intent_codes) {
        if (opt.intent_codes.some(code => c.profiling.core.intent_codes.includes(code))) {
            isProfiledMatch = true;
            console.log("isProfiledMatch set to true by intent_codes");
        }
    }

    if (opt.require_fits_for) {
        const rfKey = opt.require_fits_for.key;
        const rfMin = opt.require_fits_for.min || 20;
        const rfScore = getFitsForScore(c, rfKey);
        if (rfScore < rfMin) {
            console.log("failed at require_fits_for");
            return false;
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
                          
    console.log("isVenueSearch:", isVenueSearch);

    if (subContextsReq && subContextsReq.length > 0) {
        const companySubContexts = (c.profiling && c.profiling.core) ? c.profiling.core.sub_contexts : null;
        let isSubContextMatch = false;

        if (Array.isArray(companySubContexts)) {
            if (companySubContexts.length === 0) isSubContextMatch = true;
            else isSubContextMatch = subContextsReq.some(sc => companySubContexts.includes(sc));
        } else if (companySubContexts && typeof companySubContexts === 'object') {
            const relevantSubContexts = companySubContexts[underscoreKey] || companySubContexts[hyphenKey];
            if (relevantSubContexts) isSubContextMatch = subContextsReq.some(sc => relevantSubContexts.includes(sc));
            else isSubContextMatch = true; 
        } else {
            isSubContextMatch = true;
        }

        console.log("isSubContextMatch:", isSubContextMatch);

        if (!isSubContextMatch) {
            const hasAnySubContexts = Array.isArray(companySubContexts) ? companySubContexts.length > 0 : !!companySubContexts;
            const isConstruction = context.includes('construction') || context.includes('housing') || context.includes('remontti');
            const isCatering = labelLower.includes('pitopalvelu') || labelLower.includes('leipomo') || (opt.intent_codes || []).includes('BIZ_CATERING');
            
            if (opt.sub_context && hasAnySubContexts && !isConstruction && !isCatering) {
                console.log("failed at opt.sub_context && hasAnySubContexts");
                return false; 
            }
            if (isVenueSearch && hasAnySubContexts && fitsScore < THRESHOLD_STRICT && !isCatering) {
                console.log("failed at isVenueSearch && hasAnySubContexts && fitsScore < THRESHOLD_STRICT");
                return false; 
            }
        }
    }

    if (opt.node_link || opt.node_links) {
        const cLinks = (c.profiling && c.profiling.core) ? c.profiling.core.node_links || [] : [];
        const oLinks = opt.node_links || [opt.node_link];
        if (oLinks.some(l => l && cLinks.includes(l))) {
            isProfiledMatch = true;
            console.log("isProfiledMatch set to true by node_links");
        }
    }

    if (opt.capacity_req > 0) {
        const cap = getCompanyCapacity(c, context);
        console.log("capacity_req check. Company cap:", cap, "req:", opt.capacity_req);
        if (cap === 0) {
            console.log("failed at capacity_req > 0");
            return false;
        }
    }

    if (!opt.capacity_req && opt.node_link !== 'JUHLATILA') {
        const companyCap = getCompanyCapacity(c, context);
        if (companyCap > 0) {
            const intentScores = (c.profiling && c.profiling.core) ? c.profiling.core.intent_scores || {} : {};
            const hasStrongServiceMatch = (opt.intent_codes || []).some(code => (intentScores[code] || 0) >= THRESHOLD_STRICT);
            
            if (!hasStrongServiceMatch && fitsScore < THRESHOLD_STRICT) {
                console.log("failed at service-only check");
                return false;
            }
        }
    }

    if (isProfiledMatch) {
        if (isVenueSearch) {
            const cap = getCompanyCapacity(c, context);
            if (cap === 0) {
                console.log("failed at final isVenueSearch check");
                return false;
            }
        }
        console.log("returned true from isProfiledMatch");
        return true;
    }

    if (fitsScore === 0 && (c.profiling && c.profiling.core && c.profiling.core.fits_for)) {
        const hasProfiling = (context in c.profiling.core.fits_for) || (context.replace(/_/g, '-') in c.profiling.core.fits_for);
        if (hasProfiling) {
            console.log("failed at fitsScore === 0");
            return false;
        }
    }

    console.log("returned false at the end");
    return false;
}

const result = isMatchTrace(tupaswilla, opt, 'events_and_celebrations', ["perinteiset häät"], false, null);
console.log("isMatch result:", result);
