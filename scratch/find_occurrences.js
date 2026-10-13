const fs = require('fs');
const content = fs.readFileSync('julkaise.html', 'utf8');

const checkTerms = ['SUPABASE_URL', 'SUPABASE_KEY', 'supabaseClient'];
checkTerms.forEach(term => {
  const lines = content.split('\n');
  const matches = [];
  lines.forEach((l, i) => {
    if (l.includes(term)) matches.push(`${i+1}: ${l.trim()}`);
  });
  console.log(`=== ${term} (${matches.length}) ===`);
  matches.forEach(m => console.log(m));
});
