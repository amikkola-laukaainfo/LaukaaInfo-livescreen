const fs = require('fs');

const data = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));

// 1. Exclude Hevosklinikka from vapaa-aika
const hevosklinikka = data.profiles["company-146"];
if (hevosklinikka) {
    if (!hevosklinikka.core.not_suitable_for) hevosklinikka.core.not_suitable_for = [];
    if (!hevosklinikka.core.not_suitable_for.includes("vapaa-aika")) {
        hevosklinikka.core.not_suitable_for.push("vapaa-aika");
    }
    console.log("Excluded Hevosklinikka from vapaa-aika");
}

// 2. Ensure Unten Onnela has 'ratsastus'
const untenonnela = data.profiles["company-124"];
if (untenonnela) {
    if (!untenonnela.wellbeing_and_beauty.refinement_tags) untenonnela.wellbeing_and_beauty.refinement_tags = [];
    if (!untenonnela.wellbeing_and_beauty.refinement_tags.includes("ratsastus")) {
        untenonnela.wellbeing_and_beauty.refinement_tags.push("ratsastus");
    }
    console.log("Ensured Unten Onnela has 'ratsastus' tag");
}

fs.writeFileSync('company_profiling_data.json', JSON.stringify(data, null, 4), 'utf8');
console.log('Update complete.');
