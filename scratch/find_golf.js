const fs = require('fs');

const companies = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/companies_data.json', 'utf8')).results;
const profiling = JSON.parse(fs.readFileSync('d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json', 'utf8'));

const namesToFind = ["Varjola", "Laukan Golf", "Peurunka", "Revontuli"];
const results = companies.filter(c => namesToFind.some(name => c.nimi.includes(name)));

results.forEach(c => {
    console.log(`Company: ${c.nimi} (ID: ${c.id})`);
    const p = profiling.profiles[c.id];
    if (p) {
        console.log(`  Fits for wellbeing_and_beauty: ${p.core?.fits_for?.wellbeing_and_beauty}`);
        console.log(`  Fits for wellbeing-and-beauty: ${p.core?.fits_for?.['wellbeing-and-beauty']}`);
        if (p.wellbeing_and_beauty) {
            console.log(`  Refinement tags: ${JSON.stringify(p.wellbeing_and_beauty.refinement_tags)}`);
        }
    } else {
        console.log(`  No profile found.`);
    }
});
