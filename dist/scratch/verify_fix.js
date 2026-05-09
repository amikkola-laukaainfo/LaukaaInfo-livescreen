// Simulation of script.js filtering logic
function simulateFilter(searchTerm, selectedRegion, allCompanies, userCoords = null) {
    const matches = allCompanies.map(company => {
        const name = (company.nimi || '').toLowerCase();
        const tags = (company.tags || '').toLowerCase();
        const ptapa = (company.palvelutapa || '').toLowerCase();
        
        let score = 0;
        if (name.includes(searchTerm)) score += 100;
        
        const combinedTags = (tags + ',' + ptapa).toLowerCase();
        if (searchTerm.length > 1 && combinedTags.includes(searchTerm)) score += 120;

        if (searchTerm.length === 0 && selectedRegion !== 'all') score = 1;

        let matchesRegion = true;
        let isPremium = company.tyyppi === 'paid' || company.tyyppi === 'maksu';

        const refLat = 62.4128; // Laukaa center
        const refLon = 25.9477;
        
        if (company.lat && company.lon) {
            const dist = 21; // Simulate Mediazoo distance
            if (selectedRegion && selectedRegion !== 'all' && !isPremium) {
                matchesRegion = dist <= 13;
            }
        }

        return { company, score, matchesRegion };
    }).filter(m => m.score > 0 && m.matchesRegion);

    return matches.map(m => m.company);
}

const mockCompanies = [
    { nimi: "Mediazoo", tags: "digimedia, mainostutka", lat: 62.27, lon: 26.22, tyyppi: "maksu" },
    { nimi: "Muu Yritys", tags: "jotain, muuta", lat: 62.41, lon: 25.94, tyyppi: "perus" }
];

console.log("Search: digimedia, Region: koko-laukaa");
console.log(simulateFilter("digimedia", "koko-laukaa", mockCompanies));

console.log("Search: empty, Region: koko-laukaa");
console.log(simulateFilter("", "koko-laukaa", mockCompanies));
