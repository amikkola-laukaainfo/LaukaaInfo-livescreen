const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
const LAUKAA_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const LAUKAA_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function main() {
    console.log('=== 1. LAUKAAINFO SUPABASE: PAISEN "KESKI-SUOMI" TIEDOT ===');
    const pUrl = `${LAUKAA_SB_URL}/rest/v1/places?select=*&name=ilike.*Keski-Suomi*`;
    const pRes = await fetch(pUrl, {
        headers: { 'apikey': LAUKAA_SB_KEY, 'Authorization': `Bearer ${LAUKAA_SB_KEY}` }
    });
    const places = await pRes.json();
    console.log(JSON.stringify(places, null, 2));

    const place = places[0];
    if (!place) {
        console.error('KESKI-SUOMI PAIKKAA EI LÖYTYNYT!');
        return;
    }

    console.log('\n=== 2. MIXONET SUPABASE: PROJEKTIN TIEDOT ===');
    const projUrl = `${MIXONET_SB_URL}/rest/v1/projects?select=*&id=eq.80c2d0b8-5d6e-4704-9344-927be0c32bae`;
    const projRes = await fetch(projUrl, {
        headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` }
    });
    const projects = await projRes.json();
    console.log(JSON.stringify(projects, null, 2));

    console.log('\n=== 3. MIXONET SUPABASE: ENTITY_RELATIONS (PROJEKTI ↔ PAIKKA) ===');
    const relUrl = `${MIXONET_SB_URL}/rest/v1/entity_relations?select=*&target_id=eq.${place.place_id}`;
    const relRes = await fetch(relUrl, {
        headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` }
    });
    const rels = await relRes.json();
    console.log(JSON.stringify(rels, null, 2));

    console.log('\n=== 4. MIXONET SUPABASE: get_entities_by_place RPC TESTI ===');
    const rpcUrl = `${MIXONET_SB_URL}/rest/v1/rpc/get_entities_by_place`;
    const rpcRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            'apikey': MIXONET_SB_KEY,
            'Authorization': `Bearer ${MIXONET_SB_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_place_id: place.place_id, min_weight: 0 })
    });
    const rpcData = await rpcRes.json();
    console.log(JSON.stringify(rpcData, null, 2));
}

main().catch(console.error);
