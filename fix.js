const fs = require('fs');
let text = fs.readFileSync('index.html', 'utf8');

text = text.replace('SOME-YHTEIS?T (P?IVITETYT TYYLIT SIVULLE)', 'SOME-YHTEISÖT (PÄIVITETYT TYYLIT SIVULLE)');
text = text.replace('KARTAT &amp; ELÄMYKSET â\xad', 'KARTAT &amp; ELÄMYKSET ⭐');
// In case â­ is represented slightly differently in the file buffer due to parsing:
text = text.replace(/KARTAT &amp; ELÄMYKSET â./g, 'KARTAT &amp; ELÄMYKSET ⭐');

text = text.replace('?? Laukaan monipuolisin palvelualusta', '⭐ Laukaan monipuolisin palvelualusta');
text = text.replace(/<span class="arrow">\?<\/span>/g, '<span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span>');
text = text.replace(/aria-hidden="true">\?<\/span>/g, 'aria-hidden="true">▼</span>');

fs.writeFileSync('index.html', text, 'utf8');
console.log('Fixed index.html properly!');
