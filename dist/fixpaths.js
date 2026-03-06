const fs = require('fs');
const files = ['lievestuore.html', 'laukaa.html', 'vihtavuori.html', 'leppavesi.html', 'vehnia.html'];
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/href="\//g, 'href="');
    content = content.replace(/src="\//g, 'src="');
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
});

// Also fix alue.js to not use absolute paths in link generation
let alueContent = fs.readFileSync('alue.js', 'utf8');
alueContent = alueContent.replace(/href = `\//g, 'href = `');
alueContent = alueContent.replace(/href="\//g, 'href="');
fs.writeFileSync('alue.js', alueContent);
console.log('Fixed alue.js');
