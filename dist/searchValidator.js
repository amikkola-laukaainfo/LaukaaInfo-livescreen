
/**
 * LaukaaInfo Search Consistency Validator
 * Use this in the browser console of palvelu.html to verify search results.
 */

async function runValidation() {
    console.log("%c--- LaukaaInfo Search Validation ---", "color: blue; font-weight: bold; font-size: 1.2rem;");

    let goldenData;
    try {
        const response = await fetch('goldenQueries.json');
        goldenData = await response.json();
    } catch (e) {
        console.error("Could not load goldenQueries.json. Make sure it exists in the root.");
        return;
    }

    let results = [];
    let passed = 0;

    for (const test of goldenData) {
        console.group(`Test: ${test.description}`);
        
        // Mock global state for isMatch
        const profilingKey = test.params.id; // Simplified mapping
        const currentNeedId = test.params.id;
        
        // Run search logic for each selection
        // In reality, palvelu.html matches all selections.
        // We simulate the logic for the specific selection in the test.
        
        const filtered = allCompanies.filter(c => {
            // Simplified match check for validation
            let matchesAll = true;
            for (let stepId in test.params.selections) {
                const stepOptions = test.params.selections[stepId];
                const matchesStep = stepOptions.some(opt => {
                    // This is where we call the ACTUAL isMatch from palvelu.html
                    // We need to ensure global variables like requestedCapacity are set
                    window.globalRequestedCapacity = opt.capacity_req || 0;
                    return isMatch(c, opt, profilingKey);
                });
                if (!matchesStep) matchesAll = false;
            }
            return matchesAll;
        });

        const foundIds = filtered.map(c => c.id);
        const expectedIds = test.expected.topIds || [];
        
        let testPassed = true;
        if (test.expected.count !== undefined && filtered.length !== test.expected.count) {
            console.warn(`Mismatch in count: Expected ${test.expected.count}, found ${filtered.length}`);
            testPassed = false;
        }
        if (test.expected.minCount !== undefined && filtered.length < test.expected.minCount) {
            console.warn(`Mismatch in minCount: Expected >= ${test.expected.minCount}, found ${filtered.length}`);
            testPassed = false;
        }
        
        const missing = expectedIds.filter(id => !foundIds.includes(id));
        const extra = foundIds.filter(id => expectedIds.length > 0 && !expectedIds.includes(id) && testPassed); // Only show extra if we expected specific IDs

        if (missing.length > 0) {
            console.error("Missing IDs:", missing);
            testPassed = false;
        }
        
        if (testPassed) {
            console.log("%cPASSED", "color: green; font-weight: bold;");
            passed++;
        } else {
            console.log("%cFAILED", "color: red; font-weight: bold;");
        }
        
        console.groupEnd();
    }

    console.log(`%cSummary: ${passed}/${goldenData.length} tests passed.`, "font-weight: bold; font-size: 1.1rem;");
}

// Run it!
// runValidation();
