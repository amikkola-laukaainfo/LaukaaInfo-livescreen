const SUPABASE_URL = "https://duxluwyqxvbmkkjzuzkz.supabase.co";
const SUPABASE_KEY = "sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu";

async function checkSchema() {
    // Get the existing row to see data types
    const res = await fetch(`${SUPABASE_URL}/rest/v1/places?limit=5&select=place_level,type,status,verified,commercial_visibility,importance`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    const data = await res.json();
    console.log("Sample data:", JSON.stringify(data, null, 2));
}
checkSchema();
