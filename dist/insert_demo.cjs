const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

async function main() {
  const demoImages = [
    {
      place_id: 'way/932978436',
      image_url: 'https://images.unsplash.com/photo-1518605368461-1ee7c68856da?w=1200&q=80',
      caption: 'Haarlan urheilukenttä kesällä'
    },
    {
      place_id: 'way/932978436',
      image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
      caption: 'Rantamaisema'
    },
    {
      place_id: 'way/932978436',
      image_url: 'https://images.unsplash.com/photo-1574629810360-7efbb98f45a5?w=1200&q=80',
      caption: 'Urheilukentän juoksurata'
    }
  ];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/place_images`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(demoImages)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error inserting demo images:', response.status, errorText);
  } else {
    const data = await response.json();
    console.log('Demo images inserted successfully:', data);
  }
}

main();
