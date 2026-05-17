const fs = require('fs');

async function debug() {
    const jsonStr = fs.readFileSync('live_companies.json', 'utf8');
    const json = JSON.parse(jsonStr);
    const allCompanies = Array.isArray(json) ? json : (json.results || []);

    const searchExtrasStr = fs.readFileSync('laukaainfo-web/search_extras.json', 'utf8');
    const searchExtras = JSON.parse(searchExtrasStr);

    allCompanies.forEach(company => {
        const rowId = (company.id || '').toString().replace('company-', '');
        if (searchExtras[rowId]) {
            company.searchExtraInfo = searchExtras[rowId].toLowerCase();
        }
    });

    const searchTerm = 'rengashotelli';
    const matches = allCompanies.map(company => {
        let score = 0;
        if (searchTerm.length > 1 && company.searchExtraInfo && company.searchExtraInfo.includes(searchTerm)) {
            score += 5;
        }
        return { company: company.nimi, score, searchExtraInfo: company.searchExtraInfo };
    }).filter(m => m.score > 0);

    console.log("MATCHES:", matches);
}
debug();
