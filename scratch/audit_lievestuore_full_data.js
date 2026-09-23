const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function auditLievestuoreFullData() {
    const lievestuoreUuid = '11111111-1111-4111-a111-111111111111';
    console.log('===========================================================');
    console.log('  AUDITOINTI: LIEVESTUOREEN KOKONAISDATA SUPABASESTA');
    console.log('===========================================================\n');

    // 1. Paikka ja lapsikohteet
    const placeRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const mainPlace = (await placeRes.json())[0];
    console.log(`📌 1. PAIKKA: ${mainPlace?.name} (${mainPlace?.type})`);
    console.log(`   Ingressi: ${mainPlace?.description || 'Ei kuvausta'}`);
    console.log(`   Koordinaatit: ${mainPlace?.lat}, ${mainPlace?.lon}`);

    const subRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?parent_place_id=eq.${lievestuoreUuid}&order=importance.desc`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const subplaces = await subRes.json();
    console.log(`\n📍 2. KOHTEET & ALAPAIKAT: ${subplaces.length} kpl`);
    subplaces.forEach(sp => console.log(`   - [${sp.type || 'LANDMARK'}] ${sp.name}`));

    // 2. Teemat (place_tags & entity_tags)
    const tagsRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/place_tags?select=tag_id,tags(name)&place_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const placeTags = tagsRes.ok ? await tagsRes.json() : [];

    const entityTagsRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/entity_tags?select=tag_id,tags(name)&entity_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const entityTags = entityTagsRes.ok ? await entityTagsRes.json() : [];

    console.log(`\n🌲 3. TEEMAT & LUOKITUKSET: ${placeTags.length + entityTags.length} kpl`);
    [...placeTags, ...entityTags].forEach(t => console.log(`   - ${t.tags?.name || t.tag_id}`));

    // 3. Toimijat (place_company_relations & place_relations)
    const pcrRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/place_company_relations?place_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const pcrs = pcrRes.ok ? await pcrRes.json() : [];

    const relRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/place_relations?place_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const rels = relRes.ok ? await relRes.json() : [];

    console.log(`\n🏢 4. TOIMIJAT & ORGANISAATIOT: ${pcrs.length + rels.length} kpl`);
    pcrs.forEach(p => console.log(`   - [Company PCR] ID: ${p.company_id} (${p.context || 'Kytketty'})`));
    rels.forEach(r => console.log(`   - [Relation] ${r.entity_name || r.entity_id} (${r.relation_type})`));

    // 4. Julkaisut (post_places & posts)
    const postsRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/post_places?select=post_id,relation,posts(title,created_at,type)&or=(place_id.eq.${lievestuoreUuid},place_id.eq.Lievestuore)`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const postsData = postsRes.ok ? await postsRes.json() : [];
    console.log(`\n📢 5. JULKAISUT & UUTISET: ${postsData.length} kpl`);
    postsData.forEach(p => console.log(`   - [${p.posts?.type || 'POST'}] ${p.posts?.title} (${p.posts?.created_at?.substring(0,10)})`));

    // 5. Muistot & Havainnot (place_memories, place_observations)
    const memRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/place_memories?place_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const memories = memRes.ok ? await memRes.json() : [];

    const obsRes = await fetch(`${AI_SUPABASE_URL}/rest/v1/place_observations?place_id=eq.${lievestuoreUuid}`, {
        headers: { 'apikey': AI_SUPABASE_KEY, 'Authorization': `Bearer ${AI_SUPABASE_KEY}` }
    });
    const obs = obsRes.ok ? await obsRes.json() : [];

    console.log(`\n👁️ 6. HAVAINNOT JA MUISTOT: ${memories.length} muistoa, ${obs.length} havaintoa`);
    memories.forEach(m => console.log(`   - [Muisto] ${m.title || m.content?.substring(0,40)}`));
    obs.forEach(o => console.log(`   - [Havainto] ${o.title || o.description?.substring(0,40)}`));

    console.log('\n===========================================================');
}

auditLievestuoreFullData();
