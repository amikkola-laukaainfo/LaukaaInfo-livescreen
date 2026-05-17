
const fs = require('fs');
const path = require('path');
const { isMatch } = require('./searchEngine');

// 1. Mock global state
global.window = {};
global.i18n = {
    t: (key) => key,
    getText: (o) => typeof o === 'string' ? o : (o.fi || o.en || '')
};

function readJsonClean(file) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    return JSON.parse(content);
}

// 2. Load Data
const companiesRaw = readJsonClean('companies_data.json').results;
const profiling = readJsonClean('company_profiling_data.json');

const taxonomyRaw = readJsonClean('taxonomy.json');
global.taxonomyData = {
    intents: Object.keys(taxonomyRaw.intents).map(e => ({
        id: e,
        label: i18n.getText(taxonomyRaw.intents[e]),
        subcontexts: taxonomyRaw.intents[e].tags || [],
        refinements: [],
        nodeLinks: taxonomyRaw.intents[e].node_links || []
    }))
};


const needsConfigRaw = fs.readFileSync('needs_config.js', 'utf8');
const NEEDS_CONFIG = eval(needsConfigRaw + '; NEEDS_CONFIG;');

global.allCompanies = companiesRaw.map(c => {
    return { ...c, profiling: profiling[c.id] || {} };
});

const goldenData = readJsonClean('goldenQueries.json');

// 3. Run Validation
async function runValidation() {
    console.log("--- LaukaaInfo Search Validation (Node) ---");
    let passed = 0;

    for (const test of goldenData) {
        console.log(`\nTest: ${test.description}`);
        
        const profilingKey = test.params.id;
        
        const filtered = global.allCompanies.filter(c => {
            let matchesAll = true;
            for (let stepId in test.params.selections) {
                const stepOptions = test.params.selections[stepId];
                
                const selectedOptions = [];
                let subContextsReq = [];
                for (let sId in test.params.selections) {
                    test.params.selections[sId].forEach(o => {
                        let fullOption = { ...o };
                        if (NEEDS_CONFIG[test.params.id]) {
                            for (let step of NEEDS_CONFIG[test.params.id].steps) {
                                let match = step.options.find(opt => opt.label && (opt.label.fi === o.label.fi || opt.label === o.label));
                                if (match) { fullOption = { ...match, ...o }; break; }
                            }
                        }
                        selectedOptions.push(fullOption);
                        if (fullOption.sub_context) subContextsReq.push(fullOption.sub_context);
                    });
                }
                
                const noCateringSelected = !!selectedOptions.find(o => o.profilointi_filter && o.profilointi_filter.field === 'catering_policy' && o.profilointi_filter.value === 'own_catering');

                const enrichedStepOptions = stepOptions.map(o => {
                    let fullOption = { ...o };
                    if (NEEDS_CONFIG[test.params.id]) {
                        for (let step of NEEDS_CONFIG[test.params.id].steps) {
                            let match = step.options.find(opt => opt.label && (opt.label.fi === o.label.fi || opt.label === o.label));
                            if (match) { fullOption = { ...match, ...o }; break; }
                        }
                    }
                    return fullOption;
                });

                const matchesStep = enrichedStepOptions.some(opt => {
                    global.globalRequestedCapacity = opt.capacity_req || 0;
                    return isMatch(c, opt, profilingKey, subContextsReq, noCateringSelected);
                });
                if (!matchesStep) matchesAll = false;
            }
            return matchesAll;
        });

        const foundIds = filtered.map(c => c.id);
        const expectedIds = test.expected.topIds || [];
        
        let testPassed = true;
        if (test.expected.count !== undefined && filtered.length !== test.expected.count) {
            console.log(`  Mismatch in count: Expected ${test.expected.count}, found ${filtered.length}`);
            testPassed = false;
        }
        if (test.expected.minCount !== undefined && filtered.length < test.expected.minCount) {
            console.log(`  Mismatch in minCount: Expected >= ${test.expected.minCount}, found ${filtered.length}`);
            testPassed = false;
        }
        
        const missing = expectedIds.filter(id => !foundIds.includes(id));
        if (missing.length > 0) {
            console.log("  Missing IDs:", missing);
            testPassed = false;
        }
        
        if (testPassed) {
            console.log("  STATUS: PASSED");
            passed++;
        } else {
            console.log("  STATUS: FAILED");
        }
    }

    console.log(`\nFinal Summary: ${passed}/${goldenData.length} tests passed.`);
}

runValidation();
