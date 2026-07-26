const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// Remove corrupted BOM or stray chars at the very beginning
html = html.replace(/^[^<]+</, '<');

// Fix arrows in nav
html = html.replace(/<span class="arrow">[^<]+<\/span>/g, '<span class="arrow">▼</span>');

// Fix broken headers in sidebar
html = html.replace(/P  T STEN POLUT/g, 'PÄÄTÖSTEN POLUT');
html = html.replace(/EL MYKSET/g, 'ELÄMYKSET');

// Fix broken links in nav
html = html.replace(/Ptsten polut/g, 'Päätösten polut');
html = html.replace(/Elmykset/g, 'Elämykset');

// Fix remaining corrupted characters in the document if any (just in case)
html = html.replace(/Tied, lyd/g, 'Tiedä, löydä');
html = html.replace(/yhdess/g, 'yhdessä');
html = html.replace(/Lyd/g, 'Löydä');
html = html.replace(/ktevsti/g, 'kätevästi');

// Check for any weird 
const match = html.match(/.{0,10}.{0,10}/g);
if (match) {
    console.log("Found remaining  characters:");
    console.log(match);
}

fs.writeFileSync('index.html', html, 'utf8');
console.log("Fixed remaining broken characters.");
