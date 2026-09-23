const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function runTestACleanup() {
    const testId = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1';

    console.log('--- TESTI A: Poistetaan tilapäinen testikohde ---');

    const res = await fetch(`${AI_SUPABASE_URL}/rest/v1/places?id=eq.${testId}`, {
        method: 'DELETE',
        headers: {
            'apikey': AI_SUPABASE_KEY,
            'Authorization': `Bearer ${AI_SUPABASE_KEY}`,
            'Prefer': 'return=representation'
        }
    });

    if (res.ok) {
        const deleted = await res.json();
        console.log('✓ POISTO ONNISTUI!');
        console.log('Poistettu kohde:', deleted);
        console.log('\n>>> PÄIVITÄ SELAIN (lievestuore.html). Lapsikohteiden määrä palautui 15 KPL!');
    } else {
        const errText = await res.text();
        console.error('✘ POISTO EPÄONNISTUI:', res.status, errText);
    }
}

runTestACleanup();
