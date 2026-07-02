/**
 * Supabase Configuration for LaukaaInfo
 * 
 * 1. Aja ensin `create_social_communities.sql` Supabase SQL Editorissa.
 * 2. Lisää Supabase projektisi URL ja ANON KEY alle.
 */

const SUPABASE_URL = 'https://usswojtlvrnqtzwnffpg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SI9jkzJCyrxXQebhuoQGqQ_LN9wH8hl';

let supabaseClient = null;

if (typeof supabase !== 'undefined' && SUPABASE_URL !== 'TÄHÄN_SINUN_SUPABASE_URL') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn('Supabase ei ole konfiguroitu oikein tai @supabase/supabase-js puuttuu.');
}

window.LaukaaSupabase = supabaseClient;
