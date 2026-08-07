const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://usswojtlvrnqtzwnffpg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc3dvanRsdnJucXR6d25mZnBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODE5Njg2NSwiZXhwIjoyMDczNzcyODY1fQ.TvBF1vwUYvAl-vZGc2BBpIjbi8rt_MATC2y1RSey-LY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkPosts() {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) {
        console.error('Error fetching posts:', error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkPosts();
