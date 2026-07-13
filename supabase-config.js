/**
 * Supabase Configuration for LaukaaInfo
 *
 * 1. Aja ensin `auth_schema.sql` Supabase SQL Editorissa.
 * 2. Supabase Auth: kirjautuminen tapahtuu magic linkin kautta (kirjaudu.html)
 */

const SUPABASE_URL = 'https://usswojtlvrnqtzwnffpg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SI9jkzJCyrxXQebhuoQGqQ_LN9wH8hl';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true   // Käsittelee magic link -paluuosoitteen automaattisesti
        }
    });
} else {
    console.warn('Supabase ei ole ladattu. Tarkista että supabase-js on mukana.');
}

window.LaukaaSupabase = supabaseClient;

/**
 * LaukaaAuth – autentikointiaputyökalut
 * Käyttö: const user = await window.LaukaaAuth.getUser();
 */
window.LaukaaAuth = {

    /** Palauttaa kirjautuneen käyttäjän tai null */
    getUser: async () => {
        if (!supabaseClient) return null;
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            return user;
        } catch (e) {
            return null;
        }
    },

    /** Lähetä magic link sähköpostiin */
    signInWithMagicLink: async (email, redirectTo) => {
        if (!supabaseClient) throw new Error('Supabase ei ole alustettu');
        const opts = { email, options: {} };
        if (redirectTo) opts.options.emailRedirectTo = redirectTo;
        const { error } = await supabaseClient.auth.signInWithOtp(opts);
        if (error) throw error;
    },

    /** Kirjaudu ulos */
    signOut: async () => {
        if (!supabaseClient) return;
        await supabaseClient.auth.signOut();
    },

    /** Kuuntele auth-tilan muutoksia */
    onAuthStateChange: (callback) => {
        if (!supabaseClient) return;
        return supabaseClient.auth.onAuthStateChange(callback);
    },

    /** Hae kirjautuneen käyttäjän roolit [{role_name, target_id}] */
    getRoles: async () => {
        if (!supabaseClient) return [];
        try {
            const { data, error } = await supabaseClient.rpc('get_my_roles');
            if (error || !data) return [];
            return data;
        } catch (e) {
            return [];
        }
    },

    /** Tarkista onko käyttäjällä tietty rooli (ja valinnainen target_id) */
    hasRole: async (roleName, targetId = null) => {
        const roles = await window.LaukaaAuth.getRoles();
        return roles.some(r =>
            r.role_name === roleName &&
            (targetId === null || r.target_id === targetId || r.target_id === null)
        );
    },

    /** Tarkista onko käyttäjällä tietty oikeus (permission) */
    hasPermission: async (permissionName) => {
        if (!supabaseClient) return false;
        try {
            const { data, error } = await supabaseClient.rpc('check_permission', { p_name: permissionName });
            if (error) return false;
            return data === true;
        } catch (e) {
            return false;
        }
    },

    /** Onko moderaattori? (Vanha apufunktio, käyttää nyt permissionia) */
    isModerator: async () => window.LaukaaAuth.hasPermission('announcement.manage'),

    /** Onko yrityksen admin tietylle company_id:lle? */
    isCompanyAdmin: async (companyId) => {
        const roles = await window.LaukaaAuth.getRoles();
        return roles.some(r =>
            r.role_name === 'moderator' ||
            (r.role_name === 'company_admin' && r.target_id === String(companyId).replace('company-', ''))
        );
    }
};

