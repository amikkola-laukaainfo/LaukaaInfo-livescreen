const fs = require('fs');

if (fs.existsSync('dist/julkaise.html')) {
  const h = fs.readFileSync('dist/julkaise.html', 'utf8');
  console.log('dist length:', h.length);
  const m = h.match(/supabase-config[^"'\s>]+/g);
  console.log('Matches:', m);
} else {
  console.log('dist does not exist');
}
