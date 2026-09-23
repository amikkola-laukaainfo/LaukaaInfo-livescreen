const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function runTestAInsert() {
    const testId = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1';
    const lievestuoreId = '11111111-1111-4111-a111-111111111111';

    console.log('--- TESTI A: Lisätään tilapäinen 16. kohde Lievestuoreelle ---');
    console.log('TestID:', testId);
    console.log('parent_place_id:', lievestuoreId);

    const payload = {
        id: testId,
        name: 'TESTI – Place Network',
        canonical_name: 'TESTI – Place Network',
        type: 'LANDMARK',
        status: 'active',
        parent_place_id: lievestuoreId,
        importance: 99,
        description: 'Automaattisen hyväksymistestin A tilapäinen 16. lapsikohde.'
    };

    const res = await fetch(`${AI_SUPABASE_URL}/rest/v1/places`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': AI_SUPABASE_KEY,
            'Authorization': `Bearer ${AI_SUPABASE_KEY}`,
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        const inserted = await res.json();
        console.log('✓ LISÄYS ONNISTUI!');
        console.log('Lisätty kohde:', inserted[0]?.name || inserted);
        console.log('\n>>> PÄIVITÄ SELAIN (lievestuore.html). Lapsikohteita pitäisi näkyä nyt 16 KPL!');
    } else {
        const errText = await res.text();
        console.error('✘ LISÄYS EPÄONNISTUI:', res.status, errText);
    }
}

runTestAInsert();
