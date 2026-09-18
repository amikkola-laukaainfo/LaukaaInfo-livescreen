const https = require('https');

const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';

function get(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, MIXONET_SB_URL);
        const options = {
            headers: {
                'apikey': MIXONET_SB_KEY,
                'Authorization': `Bearer ${MIXONET_SB_KEY}`
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
    console.log('Project current fields:');
    console.log(await get('/rest/v1/projects?select=id,title,place_id,place_custom,status,visibility,is_published&id=eq.80c2d0b8-5d6e-4704-9344-927be0c32bae'));

    console.log('Relations current fields:');
    console.log(await get('/rest/v1/entity_relations?select=*&source_id=eq.80c2d0b8-5d6e-4704-9344-927be0c32bae'));
}
run();
