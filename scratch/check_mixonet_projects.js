const { createClient } = require('@supabase/supabase-js');

const MIXONET_SB_URL = 'https://btwerbixrydfalqrpnmg.supabase.co';
const MIXONET_SB_KEY = 'sb_publishable_8kDfiOTrAwvdb8ziM9XNMQ_CWc-vfat';
const LAUKAA_SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const LAUKAA_SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

const mixonetSb = createClient(MIXONET_SB_URL, MIXONET_SB_KEY);
const laukaaSb = createClient(LAUKAA_SB_URL, LAUKAA_SB_KEY);

async function check() {
    console.log('--- Checking Places for "Keski-Suomi" in LaukaaInfo Supabase ---');
    const { data: places, error: pErr } = await laukaaSb
        .from('places')
        .select('*')
        .or('name.ilike.%Keski-Suomi%,canonical_name.ilike.%keski-suomi%');
    
    console.log('Places found:', places);

    console.log('\n--- Checking All Projects in Mixonet Supabase ---');
    const { data: projects, error: prErr } = await mixonetSb
        .from('projects')
        .select('*');
    
    if (prErr) {
        console.error('Project query error:', prErr);
    } else {
        console.log(`Found ${projects ? projects.length : 0} projects in Mixonet:`);
        projects.forEach(p => {
            console.log({
                id: p.id,
                title: p.title,
                place_id: p.place_id,
                is_published: p.is_published,
                visibility: p.visibility,
                status: p.status,
                created_at: p.created_at
            });
        });
    }

    console.log('\n--- Checking Entity Relations in Mixonet Supabase ---');
    const { data: rels, error: rErr } = await mixonetSb
        .from('entity_relations')
        .select('*');
    console.log(`Found ${rels ? rels.length : 0} entity_relations in Mixonet:`, rels);
}

check();
