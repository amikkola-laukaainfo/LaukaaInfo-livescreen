// fix_teema.js — korjaa teema.js:n korruptoitunut encounter-kortti-osio
const fs = require('fs');
let content = fs.readFileSync('teema.js', 'utf8');

// --- FIX 1: Palauta katkennut encounterTypeLabels-objekti ---
// Rivi 1383 on katkennut: 'community': '❤️  (MERKKI PUUTTUU JA LOPUT ENTRYT PUUTTUVAT)
// Poistetaan korruptoitunut rivi ja lisätään kaikki entryt oikein
const badLabelsStart = `'community':       '\u2764\uFE0F`;

const goodLabels = `'community':       '\u2764\uFE0F Yhteis\xF6',
                        'space_rental':    '\uD83C\uDFE0 Tilat ja kalusto',
                        'b2b_collab':      '\uD83E\uDD1D Yhteisty\xF6haku',
                        'event_staff':     '\uD83C\uDF89 Tapahtumahaku',
                        'high_value':      '\uD83D\uDC8E Arvotavarat',
                        'lost_and_found':  '\uD83D\uDD0E L\xF6yt\xF6tavarat',
                        'event':           '\uD83D\uDCC5 Tapahtuma',
                        'offer':           '\uD83C\uDFF7\uFE0F Tarjous',
                        'feed_post':       '\uD83D\uDCF0 Julkaisu',
                        'other':           '\uD83D\uDCAC Ilmoitus',
                        // Yhteisöjulkaisut
                        'MEMORY':      '\uD83D\uDCD6 Muisto',
                        'TIP':         '\uD83D\uDCA1 Vinkki',
                        'PHOTO':       '\uD83D\uDCF7 Kuva',
                        'OBSERVATION': '\uD83D\uDCCD Havainto',
                        'QUESTION':    '\u2753 Kysymys'`;

// Etsi ja korvaa katkennut pala (päättyy ennen ;} riville)
// Katkennut muoto: 'community':       '❤️                    };
const corruptedFragment = content.match(/'community':\s+'[^']*?\s+\};\s*\r?\n\s*const encounterTypeColors/);
if (corruptedFragment) {
    content = content.replace(corruptedFragment[0], goodLabels + `\n                    };\n                    const encounterTypeColors`);
    console.log('FIX 1 applied: encounterTypeLabels restored');
} else {
    console.log('FIX 1: pattern not found, checking manually...');
    // Näytetään konteksti debuggausta varten
    const idx = content.indexOf(badLabelsStart);
    if (idx > -1) {
        console.log('Found at index', idx, ':', content.substring(idx, idx+100));
    }
}

// --- FIX 2: Poista duplikaatti/korruptoitunut blokki joka sisältää vanhan modal-koodin ---
// Etsi: }).join(''); </div> ... }).join('');  KAKSI KERTAA
const duplicateBlock = /\}\)\.join\(''\); <\/div>\r?\n\s+<\/div>\r?\n\s+`;\r?\n\s+\r?\n\s+if \(linkUrl\) \{[\s\S]+?\}\r?\n\s+\}\)\.join\(''\);/;
const m = content.match(duplicateBlock);
if (m) {
    content = content.replace(m[0], "}).join('');");
    console.log('FIX 2 applied: duplicate block removed');
} else {
    // Hae toisella tavalla
    const badClose = "}).join(''); </div>";
    const idx2 = content.indexOf(badClose);
    if (idx2 > -1) {
        // Etsi missä seuraava }).join(''); on
        const nextClose = content.indexOf("}).join('');", idx2 + badClose.length);
        if (nextClose > -1) {
            // Leikkaa välistä pois kaikki (mukaan lukien garbage)
            const before = content.substring(0, idx2);
            const after = content.substring(nextClose + "}).join('');".length);
            content = before + "}).join('');" + after;
            console.log('FIX 2 applied (fallback): removed garbage block between two }).join');
        }
    } else {
        console.log('FIX 2: duplicate block not found');
    }
}

fs.writeFileSync('teema.js', content, 'utf8');
console.log('Done. Checking lines around 1380-1450:');
const lines = content.split('\n');
lines.slice(1379, 1450).forEach((l,i) => console.log((1380+i) + ': ' + l.substring(0,120)));
