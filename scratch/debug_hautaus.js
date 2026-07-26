// Debug: Simulate the palvelu.html filter for "Hautajaisjärjestelyt"
const fs = require('fs');

const companiesJson = JSON.parse(fs.readFileSync('./companies_data.json', 'utf8'));
const companies = Array.isArray(companiesJson) ? companiesJson : (companiesJson.results || []);
const profiling = JSON.parse(fs.readFileSync('./company_profiling_data.json', 'utf8'));

// Simulate allCompanies (merge profiling)
const allCompanies = companies.map(c => {
    c.tags = (c.tags || '').toLowerCase();
    if (profiling.profiles[c.id]) {
        c.profiling = profiling.profiles[c.id];
    }
    return c;
});

console.log('Total companies loaded:', allCompanies.length);

// The option from needs_config.js for "Hautajaisjärjestelyt"
const opt = {
    label: { fi: "Hautajaisjärjestelyt", en: "Funeral arrangements" },
    sub_context: "hautauspalvelu",
    tags: ["hautauspalvelu"],
    node_link: "HAUTAUS"
};

const currentProfilingKey = 'funerals_and_memorials'; // from needToProfilingMap['hautajaiset']
const selections = { _sub_contexts: ["hautauspalvelu"] };

function getFitsForScore(c, profilingKey) {
    if (!c || !c.profiling || !c.profiling.core || !c.profiling.core.fits_for) return 0;
    const fits = c.profiling.core.fits_for;
    let score = fits[profilingKey] || fits[profilingKey.replace(/_/g, '-')] || 0;
    return score;
}

function getCategoryData(c, key) {
    if (!c.profiling) return null;
    return c.profiling[key] || c.profiling[key.replace(/-/g, '_')] || null;
}

// Simulate the filter for company-131
const target = allCompanies.find(c => c.id === 'company-131');
if (!target) {
    console.log('ERROR: company-131 not found!');
    process.exit(1);
}

console.log('\n=== company-131 data ===');
console.log('Name:', target.nimi);
console.log('Tags:', target.tags);
console.log('Has profiling:', !!target.profiling);
if (target.profiling) {
    console.log('node_links:', target.profiling.core?.node_links);
    console.log('sub_contexts:', target.profiling.core?.sub_contexts);
    console.log('fits_for:', target.profiling.core?.fits_for);
}

console.log('\n=== Filter simulation ===');

const c = target;
const labelLower = "hautajaisjärjestelyt";

// 1. Venue exclusion
const catData = getCategoryData(c, currentProfilingKey);
const venueCapacity = catData ? (catData.capacity_max || catData.meeting_capacity || catData.seminar_capacity || catData.seated_capacity || catData.memorial_service_capacity || catData.outdoor_capacity || 0) : 0;
const isPrimarilyVenue = (c.profiling?.core?.node_links || []).includes('JUHLATILA') ||
    (c.profiling?.events_and_celebrations?.capacity_max > 0) ||
    (c.profiling?.business_events?.meeting_capacity > 0);
const isVenueSearch = false; // "hautajaisjärjestelyt" doesn't trigger any venue keywords
const fitsScore = getFitsForScore(c, currentProfilingKey);

console.log('fitsScore:', fitsScore);
console.log('venueCapacity:', venueCapacity);
console.log('isPrimarilyVenue:', isPrimarilyVenue);
console.log('isVenueSearch:', isVenueSearch);

if (!isVenueSearch && (venueCapacity > 0 || isPrimarilyVenue)) {
    if (fitsScore < 80) {
        console.log('EXCLUDED by venue check!');
        process.exit(0);
    }
}

// 2. not_suitable_for
const notSuitable = (c.profiling?.core?.not_suitable_for || []).map(s => String(s).toLowerCase());
console.log('not_suitable_for:', notSuitable);
const tagBlocked = (opt.tags || []).some(tag => notSuitable.includes(tag.toLowerCase()));
if (tagBlocked) {
    console.log('EXCLUDED by not_suitable_for!');
    process.exit(0);
}

// 3. Sub_context check
if (selections._sub_contexts && selections._sub_contexts.length > 0) {
    if (!c.profiling) {
        console.log('No profiling → passes through sub_context check');
    } else {
        const companySubContexts = c.profiling?.core?.sub_contexts || [];
        let isSubContextMatch = Array.isArray(companySubContexts)
            ? (companySubContexts.length === 0 || selections._sub_contexts.some(sc => companySubContexts.includes(sc)))
            : true;
        console.log('isSubContextMatch:', isSubContextMatch);
        // isVenueOrCore for "hautajaisjärjestelyt"
        const isVenueOrCore = (opt.capacity_req > 0 || opt.node_link === 'JUHLATILA' ||
            (labelLower.includes('tila') && !labelLower.includes('tilaisuus')) ||
            labelLower.includes('muistotilaisuus'));
        console.log('isVenueOrCore:', isVenueOrCore);
        if (!isSubContextMatch && isVenueOrCore) {
            const mainFitsScore = getFitsForScore(c, currentProfilingKey);
            if (mainFitsScore >= 70 && mainFitsScore < 80) {
                console.log('EXCLUDED by isVenueOrCore + score check!');
                process.exit(0);
            }
        }
    }
}

// 4. isProfiledMatch via node_link
let isProfiledMatch = false;
if (opt.node_link) {
    const links = c.profiling?.core?.node_links || [];
    console.log('Checking node_link:', opt.node_link, 'in', links);
    if (links.includes(opt.node_link)) isProfiledMatch = true;
}
console.log('isProfiledMatch (after node_link):', isProfiledMatch);

if (isProfiledMatch) {
    console.log('\n✅ RESULT: company-131 PASSES the filter (via node_link match)');
    process.exit(0);
}

// 5. Fits score 0 check
if (c.profiling && c.profiling.core && c.profiling.core.fits_for) {
    const hasProfiling = (currentProfilingKey in c.profiling.core.fits_for) || (currentProfilingKey.replace(/_/g, '-') in c.profiling.core.fits_for);
    if (hasProfiling && fitsScore === 0) {
        console.log('EXCLUDED by fits_for score = 0!');
        process.exit(0);
    }
}

// 6. Tag match (fallback)
const companyContent = (
    (c.tags || '') + ' ' +
    (c.kategoria || '') + ' ' +
    (c.nimi || '') + ' ' +
    (c.profiling?.core?.sub_contexts?.join(' ') || '') + ' ' +
    (c.profiling?.core?.node_links?.join(' ') || '')
).toLowerCase();

console.log('\ncompanyContent snippet:', companyContent.substring(0, 200));
const tagMatch = (opt.tags || []).some(tag => companyContent.includes(tag.toLowerCase()));
console.log('tagMatch:', tagMatch, '(searching for:', opt.tags, ')');

if (tagMatch) {
    console.log('\n✅ RESULT: company-131 PASSES the filter (via tag match)');
} else {
    console.log('\n❌ RESULT: company-131 FAILS the filter (no tag match)');
}
