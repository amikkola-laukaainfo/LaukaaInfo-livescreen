const fs = require('fs');

function isTechnicalTerm(term) {
    if (!term || typeof term !== 'string') return true;
    const t = term.trim();
    if (t.length < 2) return true;
    if (t.includes('_')) return true;
    if (/^(BIZ|OPT|EVT|INTENT)[-_]/i.test(t)) return true;
    if (t.toLowerCase() === 'catering') return true;
    if (/^[A-Z0-9_-]{4,}$/.test(t) && !['LVI', 'IT', 'LKI', 'Y-TUNNUS'].includes(t)) return true;
    return false;
}

// 1. Check companies_data.json
if (fs.existsSync('companies_data.json')) {
    const data = JSON.parse(fs.readFileSync('companies_data.json', 'utf8'));
    const list = Array.isArray(data) ? data : (data.results || []);
    list.forEach(c => {
        if (!c.tags) return;
        const tags = c.tags.split(/[,;]+/);
        tags.forEach(tag => {
            if (isTechnicalTerm(tag)) {
                console.log('[companies_data.json]', c.id, c.nimi, 'tag:', tag);
            }
        });
    });
}

// 2. Check search_tags.js
if (fs.existsSync('search_tags.js')) {
    const code = fs.readFileSync('search_tags.js', 'utf8');
    const matches = code.match(/term:\s*"([^"]+)"/g) || [];
    matches.forEach(m => {
        const term = m.replace(/term:\s*"([^"]+)"/, '$1');
        if (isTechnicalTerm(term)) {
            console.log('[search_tags.js]', term);
        }
    });
}

// 3. Check needs_config.js
if (fs.existsSync('needs_config.js')) {
    const code = fs.readFileSync('needs_config.js', 'utf8');
    const tagsMatches = code.match(/"tags":\s*\[([^\]]+)\]/g) || [];
    tagsMatches.forEach(m => {
        const inner = m.replace(/"tags":\s*\[([^\]]+)\]/, '$1');
        const terms = inner.split(',').map(s => s.replace(/"/g, '').trim());
        terms.forEach(t => {
            if (isTechnicalTerm(t)) {
                console.log('[needs_config.js tag]', t);
            }
        });
    });
}
