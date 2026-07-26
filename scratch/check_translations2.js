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
const enContent = translationsFile.slice(enStart, enEnd);

const keyRegex = /"([^"]+)"\s*:/g;
const keysInEn = new Set();
while ((match = keyRegex.exec(enContent)) !== null) {
    keysInEn.add(match[1]);
}

const missing = [];
for (const key of keysInHtml) {
    if (!keysInEn.has(key)) {
        missing.push(key);
    }
}

console.log("Missing keys in en from index.html:", missing);

const enLines = enContent.split('\n');
console.log("Possible untranslated lines in EN (contains ä or ö):");
for (const line of enLines) {
    if (line.match(/"[^"]+"\s*:\s*"[^"]*[äöÄÖ][^"]*"/)) {
        console.log(line.trim());
    }
}
