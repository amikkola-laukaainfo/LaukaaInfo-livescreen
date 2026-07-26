const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The Unicode Replacement Character
const r = '\uFFFD';

// Replace known contexts containing replacement characters
html = html.replace(new RegExp(`yritykset ${r}  Kaikki`, 'g'), 'yritykset – Kaikki');
html = html.replace(new RegExp(`P${r} ${r} T${r} STEN POLUT`, 'g'), 'PÄÄTÖSTEN POLUT');
html = html.replace(new RegExp(`EL${r} MYKSET`, 'g'), 'ELÄMYKSET');
html = html.replace(new RegExp(`luontomaisema ${r}  Laukaa`, 'g'), 'luontomaisema – Laukaa');
html = html.replace(new RegExp(`Kartat &amp; El${r}mykset`, 'g'), 'Kartat &amp; Elämykset');

// Just in case there are others that I missed but which were in the previous script:
html = html.replace(/P  T STEN POLUT/g, 'PÄÄTÖSTEN POLUT');
html = html.replace(/EL MYKSET/g, 'ELÄMYKSET');

// Any remaining U+FFFD we'll just try to guess based on context, 
// but let's log them to be sure.
const remaining = [...html.matchAll(/\uFFFD/g)];
if (remaining.length > 0) {
    console.log(`Still found ${remaining.length} U+FFFD characters.`);
    remaining.slice(0, 5).forEach(x => console.log(html.substring(x.index - 20, x.index + 20)));
} else {
    console.log("All U+FFFD characters removed!");
}

fs.writeFileSync('index.html', html, 'utf8');
