const searchEngine = require('./searchEngine.js');
const fs = require('fs');

const profilingData = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));
const needsConfig = eval(fs.readFileSync('needs_config.js', 'utf8') + '; NEEDS_CONFIG');
const taxonomyJson = JSON.parse(fs.readFileSync('taxonomy.json', 'utf8'));

// Mock taxonomyData as it's built in palvelu.html
const taxonomyData = {
    intents: Object.keys(taxonomyJson.intents || {}).map(id => ({
        id: id,
        label: taxonomyJson.intents[id].fi,
        subcontexts: taxonomyJson.intents[id].tags || [],
        refinements: [],
        nodeLinks: taxonomyJson.intents[id].node_links || []
    })),
    groups: taxonomyJson.groups || [],
    relations: taxonomyJson.relations || [],
    serviceTypes: taxonomyJson.serviceTypes || []
};

const company = {
    id: "company-176",
    nimi: "Väentupa R.Y. (Kirpputori Retrokeidas)",
    tags: "kuljetus, hinaus",
    profiling: profilingData.profiles["company-176"]
};

const opt = needsConfig.muutto.steps[0].options.find(o => o.id === "OPT_MOVE_TRANSPORT_ONLY");

console.log("Testing Retrokeidas matching for OPT_MOVE_TRANSPORT_ONLY");
console.log("Option:", opt.label.fi);
console.log("Intent codes in option:", opt.intent_codes);
console.log("Intent codes in company:", company.profiling.core.intent_codes);

const match = searchEngine.isMatch(company, opt, "muutto", [], false, taxonomyData);
console.log("Is Match:", match);
