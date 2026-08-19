const SUPABASE_URL = "https://duxluwyqxvbmkkjzuzkz.supabase.co";
const SUPABASE_KEY = "sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu";

async function checkPlaces() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/places?name=ilike.*lievestuore*`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    const data = await res.json();
    console.log("Places matching 'lievestuore':", JSON.stringify(data.slice(0, 3), null, 2));
}
checkPlaces();
