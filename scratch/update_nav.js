const fs = require('fs');
const a = fs.readFileSync('ajankohtaista.html', 'utf8');
const k = fs.readFileSync('kohdekortit.html', 'utf8');

const navMatch = a.match(/<nav class="top-nav">[\s\S]*?<\/aside>/);
const newNav = navMatch[0];

let updated = k.replace(/<!-- NAV[\s\S]*?<\/nav>/, newNav);

updated = updated.replace(
  /<link rel="stylesheet" href="style\.css">/,
  '<link rel="stylesheet" href="style.css">\n<script src="translations.js?v=20260505"></script>\n<script src="https://code.iconify.design/3/3.1.0/iconify.min.js"></script>'
);

updated = updated.replace(/<\/body>/, '<script src="script.js?v=20260301-1"></script>\n</body>');

fs.writeFileSync('kohdekortit.html', updated);
console.log('Done!');
