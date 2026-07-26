const fs = require('fs');
let rawData = fs.readFileSync('company_profiling_data.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) {
    rawData = rawData.slice(1);
}
const data = JSON.parse(rawData);

const results = [];
for (const [id, profile] of Object.entries(data.profiles)) {
    const cottageServices = profile.categories?.cottage_services;
    if (cottageServices) {
        const tags = cottageServices.refinement_tags;
        if (tags) {
            if (Array.isArray(tags) && tags.includes('nuohous')) {
                results.push({ id, name: profile.name, inTags: true });
            } else if (typeof tags === 'string' && tags.includes('nuohous')) {
                results.push({ id, name: profile.name, inTags: true });
            }
        }
        // Check other possible fields
        for (const [key, value] of Object.entries(cottageServices)) {
            if (key.toLowerCase().includes('nuohous') || (typeof value === 'string' && value.toLowerCase().includes('nuohous'))) {
                results.push({ id, name: profile.name, field: key, value });
            }
        }
    }
}

console.log(JSON.stringify(results, null, 2));
