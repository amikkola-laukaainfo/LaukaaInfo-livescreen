const https = require('https');

https.get('https://laukaainfo.fi/julkaise.html', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Live status:', res.statusCode);
    const m = data.match(/supabase-config[^"'\s>]+/g);
    console.log('Live matches:', m);
    // Find SUPABASE_URL occurrences
    const occurrences = [];
    let idx = 0;
    while ((idx = data.indexOf('SUPABASE_URL', idx)) !== -1) {
      occurrences.push(data.substring(Math.max(0, idx - 20), Math.min(data.length, idx + 40)));
      idx += 'SUPABASE_URL'.length;
    }
    console.log('Live SUPABASE_URL snippets:', occurrences);
  });
}).on('error', console.error);
