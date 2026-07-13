/**
 * Kohtaamiset Cache & Analytics
 * 
 * Hoitaa ilmoitusten välimuistituksen suorituskyvyn parantamiseksi
 * sekä tilastotapahtumien (katselut, klikkaukset) keräämisen.
 */

window.LaukaaKohtaamiset = {
    cache: new Map(),

    // Hae ilmoitukset välimuistista tai Supabasesta
    async fetchEncounters(forceRefresh = false) {
        if (!forceRefresh && this.cache.has('all_encounters')) {
            const cached = this.cache.get('all_encounters');
            // Yksinkertainen välimuistin elinikä: 5 minuuttia
            if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return cached.data;
            }
        }

        try {
            const { data, error } = await window.LaukaaSupabase
                .from('encounters')
                .select('*')
                .eq('status', 'active')
                .eq('visibility', 'public')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.cache.set('all_encounters', {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (e) {
            console.error('Virhe ilmoitusten haussa:', e);
            return [];
        }
    },

    // Tilastojen keräys
    async track(encounterId, statType) {
        if (!window.LaukaaSupabase || !encounterId) return;
        try {
            await window.LaukaaSupabase.rpc('increment_stat', {
                p_encounter_id: encounterId,
                p_stat_type: statType // 'view', 'click', 'share'
            });
        } catch (e) {
            // Hiljainen ohitus (ei katkaise käyttäjäkokemusta)
        }
    },

    // Etsi ilmoitukset tietylle kohteelle content_links-taulun avulla
    async getEncountersForTarget(targetType, targetId) {
        try {
            const { data, error } = await window.LaukaaSupabase.rpc('get_encounters_by_target', {
                p_target_type: targetType,
                p_target_id: targetId
            });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('Virhe linkitettyjen ilmoitusten haussa:', e);
            return [];
        }
    }
};
