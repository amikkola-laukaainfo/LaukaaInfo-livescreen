const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const translationsFile = fs.readFileSync('translations.js', 'utf8');

const regex = /data-i18n="(?:\[[^\]]+\])?([^"]+)"/g;
let match;
const keysInHtml = new Set();
while ((match = regex.exec(indexHtml)) !== null) {
    keysInHtml.add(match[1]);
}

let enStart = translationsFile.indexOf('en: {');
let enEnd = translationsFile.indexOf('};', enStart);
const enContent = translationsFile.slice(enStart, enEnd) + '}';
let enObj = {};
try {
    enObj = eval('(' + enContent + ')');
} catch (e) {
    console.log("Eval error:", e);
}

const missing = [];
for (const key of keysInHtml) {
    if (!(key in enObj)) {
        missing.push(key);
    }
}

console.log("Missing keys in en from index.html:", missing);

console.log("Possible untranslated keys in EN (contains ä or ö):");
for (const [key, val] of Object.entries(enObj)) {
    if (typeof val === 'string' && val.match(/[äöÄÖ]/)) {
        console.log(key, '->', val);
    }
}
