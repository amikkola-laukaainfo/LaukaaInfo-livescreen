const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function checkSubplaces() {
    const lievestuoreId = '11111111-1111-4111-a111-111111111111';

    console.log('--- Tarkistetaan Lievestuoreen lapsikohteet Supabasesta ---');

    const res = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?select=id,name,parent_place_id,status&parent_place_id=eq.${lievestuoreId}&order=importance.desc`, {
        headers: {
            'apikey': AI_SUPABASE_KEY,
            'Authorization': `Bearer ${AI_SUPABASE_KEY}`
        }
    });

    if (res.ok) {
        const places = await res.json();
        console.log(`Lapsikohteita Supabasessa: ${places.length} kpl`);
        places.forEach((p, idx) => {
            console.log(`${idx + 1}. [${p.id}] ${p.name} (status: ${p.status})`);
        });

        // Tarkistetaan onko "TESTI" nimisiä rivejä kannassa
        const resTest = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?select=id,name,parent_place_id&name=ilike.*TESTI*`, {
            headers: {
                'apikey': AI_SUPABASE_KEY,
                'Authorization': `Bearer ${AI_SUPABASE_KEY}`
            }
        });
        if (resTest.ok) {
            const testPlaces = await resTest.json();
            console.log(`\nLöytyi TESTI-nimisiä rivejä kannasta: ${testPlaces.length} kpl`);
            testPlaces.forEach(tp => console.log(` - ID: ${tp.id}, Nimi: ${tp.name}, parent: ${tp.parent_place_id}`));
        }
    } else {
        console.error('Virhe haettaessa:', await res.text());
    }
}

checkSubplaces();
