const https = require('https');

https.get('https://laukaainfo.fi/supabase-config.a9dc83e4.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('supabase-config content sample:', data.substring(0, 300));
  });
}).on('error', console.error);
