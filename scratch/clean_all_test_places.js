const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function cleanAllTestPlaces() {
    console.log('--- Siivotaan kaikki TESTI-paikat Supabasesta ---');

    // Poistetaan kaikki places-taulusta jossa name ilike '%TESTI%'
    const res = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?name=ilike.*TESTI*`, {
        method: 'DELETE',
        headers: {
            'apikey': AI_SUPABASE_KEY,
            'Authorization': `Bearer ${AI_SUPABASE_KEY}`,
            'Prefer': 'return=representation'
        }
    });

    if (res.ok) {
        const deleted = await res.json();
        console.log('✓ SIIVOUS ONNISTUI! Poistettiin testirivit:', deleted.length, 'kpl');
        deleted.forEach(d => console.log(` - [${d.id}] ${d.name}`));
    } else {
        console.error('✘ SIIVOUS EPÄONNISTUI:', await res.text());
    }

    // Tarkistetaan jäljellä olevat lapsikohteet Lievestuoreella
    const lievestuoreId = '11111111-1111-4111-a111-111111111111';
    const resCount = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?select=id,name&parent_place_id=eq.${lievestuoreId}`, {
        headers: {
            'apikey': AI_SUPABASE_KEY,
            'Authorization': `Bearer ${AI_SUPABASE_KEY}`
        }
    });
    if (resCount.ok) {
        const remaining = await resCount.json();
        console.log(`\nLievestuoreella on nyt aitoja lapsikohteita kannassa: ${remaining.length} KPL`);
        remaining.forEach((p, i) => console.log(` ${i + 1}. ${p.name}`));
    }
}

cleanAllTestPlaces();
