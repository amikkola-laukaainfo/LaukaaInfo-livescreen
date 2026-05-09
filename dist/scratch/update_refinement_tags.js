const fs = require('fs');

const companyUpdates = {
    "company-23": ["kuntosali", "onefit"],
    "company-102": ["nokkakivi", "huvipuisto"],
    "company-118": ["peurunka", "uinti", "uimahalli", "kylpylä", "kuntosali"],
    "company-124": ["ranch", "ratsastus", "untenonnela"],
    "company-263": ["varjola", "koskenlasku"],
    "company-290": ["revontuli", "golf"],
    "company-286": ["multamäki", "luontoretkeily"]
};

const data = JSON.parse(fs.readFileSync('company_profiling_data.json', 'utf8'));

for (const [id, tags] of Object.entries(companyUpdates)) {
    if (data.profiles[id]) {
        const wb = data.profiles[id].wellbeing_and_beauty;
        if (wb) {
            if (!wb.refinement_tags) wb.refinement_tags = [];
            // Merge tags, avoid duplicates
            tags.forEach(tag => {
                if (!wb.refinement_tags.includes(tag)) {
                    wb.refinement_tags.push(tag);
                }
            });
            console.log(`Updated ${id} (${data.profiles[id].name}): ${wb.refinement_tags.join(', ')}`);
        }
    } else {
        console.warn(`Company ${id} not found!`);
    }
}

fs.writeFileSync('company_profiling_data.json', JSON.stringify(data, null, 4), 'utf8');
console.log('Update complete.');
