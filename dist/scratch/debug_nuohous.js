const { processSearchResults, isMatch } = require('../searchEngine.js');
const fs = require('fs');

// Mock taxonomy data (minimal)
const taxonomyData = {
    intents: []
};

// Load companies
const companies = JSON.parse(fs.readFileSync('./companies_data.json', 'utf8')).results.map(c => {
    // Basic enrichment for companies_data format to match profiling format if needed
    // In this repo, they seem to be separate but isMatch handles both
    return c;
});

// Load profiling data
const profilingDataRaw = fs.readFileSync('./company_profiling_data.json', 'utf8').replace(/^\uFEFF/, '');
const profilingData = JSON.parse(profilingDataRaw);

// Merge or use profiling companies
const allCompanies = Object.entries(profilingData.profiles)
    .filter(([id, p]) => p && typeof p === 'object' && p.name)
    .map(([id, p]) => {
    return {
        id: id,
        name: p.name,
        nimi: p.name,
        tags: p.tags,
        profiling: p,
        kategoria: "",
        lat: 62.2426, // Laukaa-ish
        lon: 25.7473
    };
});
console.log(`Loaded ${allCompanies.length} companies from profiling data.`);

// User scenario: Mökkipalvelut -> Kevätkunnostus -> Nuohous
const selections = [
    { id: "OPT_COTTAGE_CLEAN", label: { fi: "Kevätkunnostus / Siivous" }, sub_context: "kevatkunnostus", tags: ["siivous"] },
    { id: "OPT_COTTAGE_SWEEP", label: { fi: "Nuohous" }, tags: ["nuohouspalvelut"], is_service: true }
];

const needId = "mokkipalvelut";
const needToProfilingMap = { "mokkipalvelut": "cottage_services" };

const result = processSearchResults(allCompanies, selections, needId, needToProfilingMap, taxonomyData);

console.log(`Search for ${needId} with ${selections.length} selections:`);
result.groups.forEach(group => {
    console.log(`Group: ${group.opt.label.fi} - Found ${group.companies.length} companies`);
    group.companies.slice(0, 3).forEach(c => {
        console.log(`  - ${c.name} (ID: ${c.id})`);
    });
});

if (result.groups.length === 0) {
    console.log("NO GROUPS FOUND!");
}

// Debug Nuohous Lapin Mies specifically
const lapinMies = allCompanies.find(c => c.name.includes("Nuohous Lapin Mies"));
if (lapinMies) {
    console.log("\nDebugging 'Nuohous Lapin Mies Oy' specifically:");
    const optSweep = selections[1];
    const matchSweep = isMatch(lapinMies, optSweep, "cottage_services", ["kevatkunnostus"], false, taxonomyData);
    console.log(`Match for Nuohous: ${matchSweep}`);
    
    const optClean = selections[0];
    const matchClean = isMatch(lapinMies, optClean, "cottage_services", ["kevatkunnostus"], false, taxonomyData);
    console.log(`Match for Kevätkunnostus: ${matchClean}`);
} else {
    console.log("\n'Nuohous Lapin Mies Oy' not found in allCompanies!");
}
