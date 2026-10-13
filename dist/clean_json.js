const fs = require('fs');
const path = require('path');

const files = [
    'live_companies.json',
    'temp_companies.json',
    'companies_data.json'
];

const replacements = [
    // Double encoded patterns
    [/ÃƒÆ’Ã‚Â¤/g, 'ä'],
    [/ÃƒÆ’Ã‚Â¶/g, 'ö'],
    [/ÃƒÂ¤/g, 'ä'],
    [/ÃƒÂ¶/g, 'ö'],
    [/Ãƒâ€ž/g, 'Ä'],
    [/Ãƒâ€“/g, 'Ö'],
    
    // Single encoded patterns
    [/Ã¤/g, 'ä'],
    [/Ã¶/g, 'ö'],
    [/Ã„/g, 'Ä'],
    [/Ã–/g, 'Ö'],
    [/Ã…/g, 'Å'],
    [/Ã¥/g, 'å'],
    [/â€“/g, '–'],
    [/â€”/g, '—'],
    [/â€™/g, "'"],
    [/â€\u009d/g, '"'],
    [/â€œ/g, '"'],
    [/Ã¼/g, 'ü'],
    [/ÃŸ/g, 'ß'],
    
    // Even deeper ones sometimes seen
    [/Ãƒâ€¦/g, 'Å'],
    [/ÃƒÂ¥/g, 'å']
];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${file}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Strip BOM first if it's there
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    let original = content;
    replacements.forEach(([pattern, replacement]) => {
        content = content.replace(pattern, replacement);
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Cleaned: ${file}`);
    } else {
        console.log(`No changes needed for: ${file}`);
    }
});
