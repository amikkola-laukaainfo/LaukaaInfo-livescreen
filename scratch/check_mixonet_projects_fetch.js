const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
const LAUKAA_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const LAUKAA_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function main() {
    console.log('--- 1. Querying Places in LaukaaInfo Supabase ---');
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
    console.log(`Projects (${projects.length}):`, JSON.stringify(projects, null, 2));

    console.log('\n--- 3. Querying entity_relations in Mixonet Supabase ---');
    const relUrl = `${MIXONET_SB_URL}/rest/v1/entity_relations?select=*`;
    const relRes = await fetch(relUrl, {
        headers: { 'apikey': MIXONET_SB_KEY, 'Authorization': `Bearer ${MIXONET_SB_KEY}` }
    });
    const rels = await relRes.json();
    console.log(`entity_relations (${rels.length}):`, JSON.stringify(rels, null, 2));
}

main().catch(console.error);
