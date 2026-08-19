const SUPABASE_URL = "https://usswojtlvrnqtzwnffpg.supabase.co";
const SUPABASE_KEY = "sb_publishable_SI9jkzJCyrxXQebhuoQGqQ_LN9wH8hl";

async function checkPlaces() {
    console.log("Checking usswojtlvrnqtzwnffpg for haarla...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/places?name=ilike.*haarla*`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    
    if (res.ok) {
        const data = await res.json();
        console.log("Places matching 'haarla':", JSON.stringify(data, null, 2));
    } else {
        console.log("Error or no places table in this DB:", res.status, await res.text());
    }
}
checkPlaces();
