const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    'd:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/company_profiling_data.json',
    'd:/Projekteja/LAUKAAINFO-profilointi/ohjeet/company_profiling_data.json',
    'd:/Projekteja/LAUKAAINFO-profilointi/data.json'
];

// Mappings from tags to intent codes
const mappings = [
    { intent: 'AUTO_REPAIR', tags: ['autokorjaamot', 'autohuolto', 'autokorjaamo'] },
    { intent: 'AUTO_TIRES', tags: ['rengasliike'] },
    { intent: 'AUTO_WASH', tags: ['autopesu', 'automaalaamo'] },
    { intent: 'AUTO_HEAVY', tags: ['raskaskonehuolto'] },
    { intent: 'EDU_DAYCARE', tags: ['päiväkoti', 'koulutus', 'päivähoito'] },
    { intent: 'REC_CHILDREN', tags: ['lapset', 'harrastukset', 'lasten harrastukset'] },
    { intent: 'SHOP_CHILDREN', tags: ['lastentarvikkeet'] },
    { intent: 'WELLBEING_FAMILY', tags: ['psykologi', 'perhepalvelut', 'perhetuki', 'perheterapia'] }
];

let updatedCount = 0;

try {
    const mainFile = filesToUpdate[0];
    let content = fs.readFileSync(mainFile, 'utf8');
    let hasBom = false;
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
        hasBom = true;
    }

    const data = JSON.parse(content);
    
    for (const id in data.profiles) {
        const profile = data.profiles[id];
        if (!profile.core) continue;
        
        const core = profile.core;
        const subContexts = core.sub_contexts || [];
        const refinementTags = core.refinement_tags || [];
        // Support array and object for sub_contexts
        let allTags = [];
        if (Array.isArray(subContexts)) {
            allTags = allTags.concat(subContexts);
        } else if (typeof subContexts === 'object') {
            for (const key in subContexts) {
                allTags = allTags.concat(subContexts[key]);
            }
        }
        allTags = allTags.concat(refinementTags);
        allTags = allTags.map(t => t.toLowerCase());

        let modified = false;

        for (const rule of mappings) {
            const matches = rule.tags.some(tag => allTags.includes(tag.toLowerCase()));
            if (matches) {
                if (!core.intent_codes) core.intent_codes = [];
                if (!core.intent_scores) core.intent_scores = {};

                if (!core.intent_codes.includes(rule.intent)) {
                    core.intent_codes.push(rule.intent);
                    core.intent_scores[rule.intent] = 100; // default to 100
                    modified = true;
                    console.log(`Updated ${profile.name || id}: added ${rule.intent}`);
                }
            }
        }

        if (modified) updatedCount++;
    }

    const newContent = (hasBom ? '\uFEFF' : '') + JSON.stringify(data, null, 2);

    for (const filePath of filesToUpdate) {
        if (fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Saved updated data to ${filePath}`);
        }
    }
    
    console.log(`Migration complete! Updated ${updatedCount} profiles.`);

} catch (err) {
    console.error("Migration failed:", err);
}
