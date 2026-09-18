const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
const LAUKAA_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const LAUKAA_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function main() {
    console.log('--- 1. Querying Places for "Keski-Suomi" in LaukaaInfo Supabase ---');
    const pUrl = `${LAUKAA_SB_URL}/rest/v1/places?select=*&name=ilike.*Keski-Suomi*`;
    const pRes = await fetch(pUrl, {
        headers: { 'apikey': LAUKAA_SB_KEY, 'Authorization': `Bearer ${LAUKAA_SB_KEY}` }
    });
    const places = await pRes.json();
    console.log('Places:', JSON.stringify(places, null, 2));

    console.log('\n--- 2. Querying Projects in Mixonet Supabase ---');
    const prUrl = `${MIXONET_SB_URL}/rest/v1/projects?select=*`;
    const prRes = await fetch(prUrl, {
        headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` }
    });
    const projects = await prRes.json();
    console.log(`Projects (${projects ? projects.length : 0}):`);
    if (projects) {
        projects.forEach(p => {
            console.log({
                id: p.id,
                title: p.title,
                place_id: p.place_id,
                place_custom: p.place_custom,
                is_published: p.is_published,
                visibility: p.visibility,
                status: p.status
            });
        });
    }

    console.log('\n--- 3. Testing queries that tietoa-paikasta.js uses for Keski-Suomi ---');
    if (places && places.length > 0) {
        const place = places[0];
        console.log('Testing place:', place.name, 'place_id:', place.place_id, 'mixonet_place_id:', place.mixonet_place_id);

        // a) Query by place_id / mixonet_place_id
        const placeIdFilter = [place.place_id, place.mixonet_place_id].filter(Boolean).join(',');
        const q1Url = `${MIXONET_SB_URL}/rest/v1/projects?select=*&place_id=in.(${placeIdFilter})`;
        const q1Res = await fetch(q1Url, { headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` } });
        const q1Data = await q1Res.json();
        console.log('Q1 (by place_id in filter) result:', q1Data);

        // b) Query by place_custom ilike
        const q2Url = `${MIXONET_SB_URL}/rest/v1/projects?select=*&place_custom=ilike.*${encodeURIComponent(place.name)}*`;
        const q2Res = await fetch(q2Url, { headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` } });
        const q2Data = await q2Res.json();
        console.log('Q2 (by place_custom ilike) result:', q2Data);

        // c) Query entity_relations RPC / table
        const q3Url = `${MIXONET_SB_URL}/rest/v1/entity_relations?select=*&target_id=eq.${place.place_id}`;
        const q3Res = await fetch(q3Url, { headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` } });
        const q3Data = await q3Res.json();
        console.log('Q3 (entity_relations target_id=eq.place_id) result:', q3Data);
    }
}

main().catch(console.error);
