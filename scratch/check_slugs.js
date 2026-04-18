
const fs = require('fs');

function slugify(text) {
    if (!text) return "";
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[äÄàáâãäå]/g, 'a')
        .replace(/[öÖòóôõöø]/g, 'o')
        .replace(/[åÅ]/g, 'a')
        .replace(/[^\w-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

const data = JSON.parse(fs.readFileSync('companies_data.json', 'utf8'));
const companies = data.results || [];

const slugs = {};
companies.forEach(c => {
    const s = slugify(c.nimi);
    if (!slugs[s]) slugs[s] = [];
    slugs[s].push(c.nimi);
});

for (const s in slugs) {
    if (slugs[s].length > 1) {
        console.log(`Conflict for slug "${s}":`, slugs[s]);
    }
}

if (slugs['mediazoo']) {
    console.log('Companies matching "mediazoo":', slugs['mediazoo']);
} else {
    console.log('No company matches "mediazoo"');
}
