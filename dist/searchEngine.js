
/**
 * Shared Search Logic for LaukaaInfo
 * This file contains the extracted logic from palvelu.html for reuse in 
 * the Node validator and the React profiling app.
 */

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
    if (!data) return 0;
    return data.capacity_max || 
           data.meeting_capacity || 
           data.seminar_capacity || 
           data.seated_capacity || 
           data.memorial_service_capacity || 
           data.outdoor_capacity || 
           data.catering_max_capacity || 0;
}

function isMatch(c, opt, profilingKey) {
    const THRESHOLD_STRICT = 80;
    let matches = true;

    // 1. Basic Tag Match
    if (opt.tags && opt.tags.length > 0) {
        const companyTags = (c.tags || "").toLowerCase();
        const hasTag = opt.tags.some(tag => companyTags.includes(tag.toLowerCase()));
        if (!hasTag) matches = false;
    }

    // 2. Profiling Filter (Strict)
    if (opt.profilointi_filter) {
        const { section, field, value } = opt.profilointi_filter;
        const companyVal = c.profiling?.[section]?.[field];
        if (Array.isArray(companyVal)) {
            if (!companyVal.includes(value)) matches = false;
        } else {
            if (companyVal !== value) matches = false;
        }
    }

    // 3. Intent Codes Match
    if (opt.intent_codes && opt.intent_codes.length > 0) {
        const companyIntents = c.profiling?.core?.intent_codes || [];
        const hasIntent = opt.intent_codes.some(code => companyIntents.includes(code));
        
        // Special case: Video search fallback to node_links
        const isVideoSearch = opt.tags && opt.tags.some(t => t.includes('video') || t === 'videotuotanto');
        const coreNodeLinks = c.profiling?.core?.node_links || [];
        const hasVideoLink = isVideoSearch && coreNodeLinks.includes('VIDEOTUOTANTO');

        if (!hasIntent && !hasVideoLink) matches = false;
    }

    // 4. Capacity Gating
    const requestedCapacity = global.globalRequestedCapacity || 0;
    if (requestedCapacity > 0) {
        const companyCap = getCompanyCapacity(c, profilingKey);
        if (companyCap > 0 && companyCap < requestedCapacity) matches = false;

        const isVenueSearch = opt.node_link === 'JUHLATILA' || (opt.tags && opt.tags.includes('juhlatila'));
        if (isVenueSearch && companyCap === 0) matches = false;

        // Service vs Venue Segregation
        const isServiceOnlyOption = !isVenueSearch;
        if (isServiceOnlyOption && companyCap > 0) {
            const intentScore = getFitsForScore(c, profilingKey);
            if (intentScore < THRESHOLD_STRICT) matches = false;
        }
    }

    return matches;
}

if (typeof module !== 'undefined') {
    module.exports = { getCategoryData, getFitsForScore, getCompanyCapacity, isMatch };
}
