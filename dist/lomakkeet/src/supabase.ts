import { createClient } from '@supabase/supabase-js';
export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://btwerbixrydfalqrpnmg.supabase.co';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
export const supabase = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
