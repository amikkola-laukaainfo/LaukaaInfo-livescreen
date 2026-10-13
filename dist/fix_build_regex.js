/**
 * Tilapäinen korjauskripti: päivittää build.js:n regex-logiikan
 * niin että CDN-URLeja ei enää versioida virheellisesti.
 */
const fs = require('fs');
const path = require('path');

const buildFile = path.join(__dirname, 'build.js');
let content = fs.readFileSync(buildFile, 'utf8');

// Etsitään nykyinen regex-lohko
const oldBlockMarker = 'HUOM: negatiivinen lookbehind';
if (!content.includes(oldBlockMarker)) {
    console.log('❌ Vanha lohko ei löydy – kenties jo korjattu tai erilainen versio?');
    process.exit(1);
}

// Uusi CDN-turvallinen korvauslogiikka
const newBlock = `for (const [oldName, newName] of Object.entries(assetMap)) {
                // Korvataan vain paikalliset viittaukset – ei CDN/https-URLeja.
                // Tarkistetaan jokainen match: jos sitä edeltää https://-alkuinen URL, jätetään koskematta.
                const escapedOld = oldName.replace(/\\./g, '\\\\.').replace(/\\[/g, '\\\\[').replace(/\\]/g, '\\\\]');
                content = content.replace(new RegExp('(["\\'\/]|\\\\.\\\\.\\\\/)' + escapedOld + '(["\\'\\\\?])', 'g'), (match, pre, post, offset) => {
                    // Katso takaisin viimeisimmän lainausmerkin jälkeinen teksti
                    const before = content.substring(Math.max(0, offset - 300), offset);
                    const lastQ = Math.max(before.lastIndexOf('"'), before.lastIndexOf("'"));
                    const urlStart = lastQ >= 0 ? before.substring(lastQ + 1) : before;
                    if (/^https?:\\/\\//.test(urlStart)) return match; // CDN-URL, ei kosketa
                    return pre + newName + post;
                });
            }`;

// Korvataan vanha for-lohko uudella
const forStart = content.indexOf('for (const [oldName, newName] of Object.entries(assetMap)) {', 
    content.indexOf('4. Päivitetään viittaukset'));
const forEnd = content.indexOf('\n            }', forStart) + '\n            }'.length;

if (forStart === -1 || forEnd <= forStart) {
    console.log('❌ For-lohkon rajoja ei löydy automaattisesti.');
    process.exit(1);
}

const oldBlock = content.substring(forStart, forEnd);
console.log('Korvattava lohko löydetty:');
console.log(oldBlock);
console.log('\n---');

const newContent = content.substring(0, forStart) + newBlock + content.substring(forEnd);
fs.writeFileSync(buildFile, newContent, 'utf8');
console.log('✓ build.js päivitetty CDN-turvallisella regex-logiikalla.');
