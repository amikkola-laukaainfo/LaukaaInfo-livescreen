const https = require('https');

const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

function get(urlStr, key) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const options = {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

function post(urlStr, key, bodyObj) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const postData = JSON.stringify(bodyObj);
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function simulateLoadMixonet(placeId, placeName) {
    console.log(`\n=================== TESTING PLACE: ${placeName} (${placeId}) ===================`);
    
    // 1. Direct projects query by place_id
    const directRes = await get(`${MIXONET_SB_URL}/rest/v1/projects?select=id,title,description,cover_image_url,is_published,visibility,status&place_id=eq.${placeId}`, MIXONET_SB_KEY);
    const directProjects = JSON.parse(directRes.body || '[]');
    console.log('Direct Projects count:', directProjects.length);

    // 2. Custom text match
    const customRes = await get(`${MIXONET_SB_URL}/rest/v1/projects?select=id,title,description,cover_image_url,is_published,visibility,status&place_custom=ilike.%25${encodeURIComponent(placeName)}%25`, MIXONET_SB_KEY);
    const customProjects = JSON.parse(customRes.body || '[]');
    console.log('Custom Text Projects count:', customProjects.length);

    // 3. RPC get_entities_by_place
    const rpcRes = await post(`${MIXONET_SB_URL}/rest/v1/rpc/get_entities_by_place`, MIXONET_SB_KEY, { target_place_id: placeId, min_weight: 0 });
    const relations = JSON.parse(rpcRes.body || '[]');
    console.log('RPC Relations count:', relations.length, relations);

    // 4. Relations projects
    const projectIdsFromRel = relations
        .filter(r => (r.source_type === 'PROJECT' || r.source_type === 'project'))
        .map(r => r.source_id);
    console.log('Project IDs from relations:', projectIdsFromRel);

    let relProjects = [];
    if (projectIdsFromRel.length > 0) {
        const inClause = projectIdsFromRel.join(',');
        const relRes = await get(`${MIXONET_SB_URL}/rest/v1/projects?select=id,title,description,cover_image_url,is_published,visibility,status&id=in.(${inClause})`, MIXONET_SB_KEY);
        relProjects = JSON.parse(relRes.body || '[]');
    }
    console.log('Rel Projects count:', relProjects.length);

    const combinedMap = new Map();
    directProjects.forEach(p => combinedMap.set(p.id, p));
    customProjects.forEach(p => combinedMap.set(p.id, p));
    relProjects.forEach(p => combinedMap.set(p.id, p));

    const allProjects = Array.from(combinedMap.values());
    console.log('TOTAL Combined Projects:', allProjects.length);
    allProjects.forEach(p => console.log(' -> Project:', p.id, p.title, 'is_published:', p.is_published, 'visibility:', p.visibility));
}

async function run() {
    await simulateLoadMixonet('54bf89b2-9e5d-46e0-9a9d-395f768c4195', 'Keski-Suomi');
    await simulateLoadMixonet('6df61792-3c94-412c-bbb7-0068c9c1a861', 'Haarlan ranta ja urheilukenttä');
}
run();
