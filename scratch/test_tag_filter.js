const fs = require('fs');

function isTechnicalOrRawCodeTag(term) {
    if (!term || typeof term !== 'string') return true;
    const t = term.trim();
    if (t.length < 2) return true;
    if (t.includes('_')) return true;
    if (/^(BIZ|OPT|EVT|INTENT|CAPABILITY|ROLE)[-_]/i.test(t)) return true;
    if (t.toLowerCase() === 'catering') return true;
    if (/^[A-Z0-9_-]{4,}$/.test(t) && !['LVI', 'IT', 'LKI', 'Y-TUNNUS', 'GPS'].includes(t)) return true;
    return false;
}

const sampleTerms = ['termostaatit', 'terassirakentaminen', 'terveyspalvelut', 'catering', 'biz_catering', 'BIZ_CATERING', 'OPT_WEDDING', 'pitopalvelu', 'LVI'];

sampleTerms.forEach(term => {
    console.log(`Term: "${term}" -> Is technical/excluded? ${isTechnicalOrRawCodeTag(term)}`);
});
