const fs = require('fs');

const companyNames = [
    "OneFit",
    "Peurunka Oy",
    "Varjolan Tilan Matkailu Oy",
    "Revontuli Resort",
    "UntenOnnela Ranch avoin yhtiö",
    "Bellingham Oy (Nokkakiven huvipuisto)",
    "Multamäen leirikeskus"
];

const data = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));

const results = {};

for (const [id, company] of Object.entries(data.profiles)) {
    if (companyNames.some(name => company.name && company.name.includes(name))) {
        results[company.name] = {
            id: id,
            wellbeing_and_beauty: company.wellbeing_and_beauty
        };
    }
}

console.log(JSON.stringify(results, null, 2));
