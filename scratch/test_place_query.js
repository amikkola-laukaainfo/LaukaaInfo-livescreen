const https = require('https');

const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

function get(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, AI_SUPABASE_URL);
        const options = {
            headers: {
                'apikey': AI_SUPABASE_KEY,
                'Authorization': `Bearer ${AI_SUPABASE_KEY}`
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

async function run() {
    console.log('Testing with slug "keski-suomi":');
    console.log(await get('/rest/v1/places?select=*&or=(name.ilike.%25keski-suomi%25,canonical_name.ilike.%25keski-suomi%25)&limit=1'));

    console.log('Testing with param "Keski-Suomi":');
    console.log(await get('/rest/v1/places?select=*&or=(name.ilike.%25Keski-Suomi%25,canonical_name.ilike.%25Keski-Suomi%25)&limit=1'));
}
run();
