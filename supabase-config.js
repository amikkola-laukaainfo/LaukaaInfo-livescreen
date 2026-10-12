/**
 * Supabase Configuration for LaukaaInfo
 *
 * 1. Aja ensin `auth_schema.sql` Supabase SQL Editorissa.
 * 2. Supabase Auth: kirjautuminen tapahtuu magic linkin kautta (kirjaudu.html)
 */

const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

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

/**
 * LaukaaOrgSession – Organisaation julkaisukoodi-istunnot (Kohtaamiset & Seinä)
 * Istuntotoken pidetään TIETOTURVASYYISTÄ sessionStorage-muistissa (ei koskaan localStorage tai evästeet).
 */
window.LaukaaOrgSession = {
    KEY_TOKEN: 'km_org_session_token',
    KEY_ORG_ID: 'km_org_session_org_id',
    KEY_ORG_NAME: 'km_org_session_org_name',
    KEY_EXPIRES_AT: 'km_org_session_expires_at',

    /** Palauttaa voimassaolevan istunnon tai null */
    getSession: () => {
        try {
            const token = sessionStorage.getItem(window.LaukaaOrgSession.KEY_TOKEN);
            const orgId = sessionStorage.getItem(window.LaukaaOrgSession.KEY_ORG_ID);
            const orgName = sessionStorage.getItem(window.LaukaaOrgSession.KEY_ORG_NAME);
            const expiresAt = sessionStorage.getItem(window.LaukaaOrgSession.KEY_EXPIRES_AT);

            if (!token || !orgId) return null;

            if (expiresAt) {
                const expTime = new Date(expiresAt).getTime();
                if (Date.now() >= expTime) {
                    window.LaukaaOrgSession.clearSession();
                    return null;
                }
            }

            return {
                session_token: token,
                org_id: orgId,
                org_name: orgName || orgId,
                expires_at: expiresAt
            };
        } catch (e) {
            console.warn('LaukaaOrgSession.getSession error:', e);
            return null;
        }
    },

    /** Tallentaa istunnon sessionStorageen ja tiedottaa kuuntelijoille */
    setSession: (sessionData) => {
        try {
            if (!sessionData || !sessionData.session_token) return;
            sessionStorage.setItem(window.LaukaaOrgSession.KEY_TOKEN, sessionData.session_token);
            sessionStorage.setItem(window.LaukaaOrgSession.KEY_ORG_ID, sessionData.org_id || '');
            sessionStorage.setItem(window.LaukaaOrgSession.KEY_ORG_NAME, sessionData.org_name || sessionData.org_id || '');
            if (sessionData.expires_at) {
                sessionStorage.setItem(window.LaukaaOrgSession.KEY_EXPIRES_AT, sessionData.expires_at);
            }
            window.dispatchEvent(new CustomEvent('laukaa:org_session_changed', { detail: sessionData }));
        } catch (e) {
            console.warn('LaukaaOrgSession.setSession error:', e);
        }
    },

    /** Tyhjentää istunnon */
    clearSession: () => {
        try {
            sessionStorage.removeItem(window.LaukaaOrgSession.KEY_TOKEN);
            sessionStorage.removeItem(window.LaukaaOrgSession.KEY_ORG_ID);
            sessionStorage.removeItem(window.LaukaaOrgSession.KEY_ORG_NAME);
            sessionStorage.removeItem(window.LaukaaOrgSession.KEY_EXPIRES_AT);
            window.dispatchEvent(new CustomEvent('laukaa:org_session_changed', { detail: null }));
        } catch (e) {
            console.warn('LaukaaOrgSession.clearSession error:', e);
        }
    },

    /**
     * Aloittaa uuden organisaatioistunnon palvelimella
     * @param {string|null} orgId Valinnainen organisaatiotunnus (jos null, selvitetään koodista)
     * @param {string} publishKey 8-merkkinen julkaisukoodi
     */
    beginSession: async (orgId, publishKey) => {
        const client = window.LaukaaSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (!client) throw new Error('Supabase-asiakas ei ole alustettu');

        let targetOrgId = orgId;
        const cleanKey = (publishKey || '').trim().toUpperCase();

        if (!targetOrgId) {
            // Etsitään organisaatio julkaisukoodin perusteella
            const { data: resData, error: resError } = await client.rpc('resolve_publisher_key', {
                p_publish_key: cleanKey
            });
            if (resError) throw resError;
            if (!resData || !resData.valid) {
                throw new Error((resData && resData.error) || 'Virheellinen julkaisukoodi');
            }
            targetOrgId = resData.org_id;
        }

        const { data, error } = await client.rpc('begin_org_session', {
            p_organization_id: targetOrgId,
            p_publish_key: cleanKey
        });

        if (error) throw error;
        if (!data || !data.success) {
            throw new Error((data && data.error) || 'Istunnon luonti epäonnistui');
        }

        window.LaukaaOrgSession.setSession(data);
        return data;
    },

    /** Lopettaa aktiivisen istunnon ja mitätöi sen palvelimelta */
    endSession: async () => {
        const current = window.LaukaaOrgSession.getSession();
        if (!current) return true;

        const client = window.LaukaaSupabase || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (client && current.session_token) {
            try {
                await client.rpc('end_org_session', {
                    p_session_token: current.session_token,
                    p_organization_id: current.org_id
                });
            } catch (e) {
                console.warn('Virhe palvelinistunnon sulkemisessa:', e);
            }
        }
        window.LaukaaOrgSession.clearSession();
        return true;
    }
};

/**
 * LaukaaEditTokens – Anonyymien ilmoitusten edit-tokenit selaimen muistissa
 */
window.LaukaaEditTokens = {
    saveToken: (encounterId, token) => {
        if (!encounterId || !token) return;
        try {
            localStorage.setItem('km_edit_' + encounterId, token);
        } catch (e) {}
    },
    getToken: (encounterId) => {
        if (!encounterId) return null;
        try {
            return localStorage.getItem('km_edit_' + encounterId);
        } catch (e) {
            return null;
        }
    },
    removeToken: (encounterId) => {
        if (!encounterId) return;
        try {
            localStorage.removeItem('km_edit_' + encounterId);
        } catch (e) {}
    }
};


