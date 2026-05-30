const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  let missing = [];
  if (!content.includes('class=\"desktop-nav\"')) missing.push('desktop-nav');
  if (!content.includes('class=\"sidebar-menu\"') && !content.includes('id=\"sidebar-menu\"')) missing.push('sidebar-menu');
  if (missing.length > 0) console.log(f + ' missing: ' + missing.join(', '));
});
