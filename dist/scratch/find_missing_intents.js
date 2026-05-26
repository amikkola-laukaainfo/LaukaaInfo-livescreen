const fs = require('fs');
const content = fs.readFileSync('needs_config.js', 'utf8');
const options = content.match(/\{[^{}]*\"id\"\s*:\s*\"OPT_[^\"]+\"[^{}]*\}/g);
options.forEach(opt => {
    if (!opt.includes('intent_codes') && !opt.includes('hide_results')) {
        const id = opt.match(/\"id\"\s*:\s*\"(OPT_[^\"]+)\"/)[1];
        const label = opt.match(/\"label\"\s*:\s*\{[^}]*\"fi\"\s*:\s*\"([^\"]+)\"/);
        console.log(`${id}: ${label ? label[1] : 'N/A'}`);
    }
});
