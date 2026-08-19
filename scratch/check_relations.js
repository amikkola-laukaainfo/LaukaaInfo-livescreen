const SUPABASE_URL = "https://duxluwyqxvbmkkjzuzkz.supabase.co";
const SUPABASE_KEY = "sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu";

async function checkRelations() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/place_relations?place_id=eq.6df61792-3c94-412c-bbb7-0068c9c1a861`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    
    if (res.ok) {
        const data = await res.json();
        console.log(`Relations for Haarla place_id: ${data.length}`);
        console.log(JSON.stringify(data, null, 2));
    }
}
checkRelations();
