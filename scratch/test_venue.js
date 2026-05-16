const fs = require('fs');
const { searchEngine, isMatch } = require('../searchEngine');

const companies = JSON.parse(fs.readFileSync('./company_profiling_data.json', 'utf8'));
const tupaswillaData = companies.profiles['company-243'];
const tupaswilla = { id: 'company-243', profiling: tupaswillaData };
console.log("Found Tupaswilla:", !!tupaswillaData);

const opt = { 
    "id": "OPT_WED_VENUE_LARGE", 
    "label": { "fi": "Iso juhlatila (yli 50 hl\u00f6)", "en": "Large party venue (over 50 ppl)" }, 
    "tags": ["juhlatila"], 
    "capacity_req": 100, 
    "node_link": "JUHLATILA", 
    "intent_codes": ["VENUE_PARTY"] 
};

const result = isMatch(tupaswilla, opt, 'events_and_celebrations', [], false, null);
console.log("isMatch result:", result);

if (!result) {
    // try to find out why
    console.log("fits_for events_and_celebrations:", tupaswilla.profiling?.core?.fits_for?.['events-and-celebrations']);
}
