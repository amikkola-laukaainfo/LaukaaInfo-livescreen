/**
 * ContextResolver.js - Monialustainen palvelukonteksti & Sisältöalueratkaisin
 * LaukaaInfo / HankasalmiInfo / Yhteisportaalit
 */

export class ContextResolver {
  /**
   * @param {Object} supabaseClient Supabase client instance
   * @param {string} [defaultServiceId='laukaainfo'] Fallback service ID
   */
  constructor(supabaseClient, defaultServiceId = 'laukaainfo') {
    this.supabase = supabaseClient;
    this.defaultServiceId = defaultServiceId;
    this.cache = new Map();
  }

  /**
   * Ratkaisee palvelukontekstin (verkkotunnuksesta, URL-parametrista tai muuttujasta)
   * @param {string} [serviceId] 
   * @returns {Promise<Object>} ResolvedServiceContext
   */
  async resolveContext(serviceId) {
    const targetId = serviceId || this.detectServiceId() || this.defaultServiceId;

    if (this.cache.has(targetId)) {
      return this.cache.get(targetId);
    }

    try {
      // Kutsutaan Supabasen tietokanta-funktion get_resolved_service_context
      const { data, error } = await this.supabase.rpc('get_resolved_service_context', {
        p_service_id: targetId
      });

      if (error || !data) {
        console.warn(`[ContextResolver] Epäonnistui kontekstille ${targetId}, käytetään oletusta:`, error);
        return this.getFallbackContext(targetId);
      }

      this.cache.set(targetId, data);
      return data;
    } catch (err) {
      console.error('[ContextResolver] Virhe kontekstin haussa:', err);
      return this.getFallbackContext(targetId);
    }
  }

  /**
   * Tunnistaa SERVICE_ID:n URL-parametrista (service_id=hankasalmiinfo) tai hostname-osoitteesta
   */
  detectServiceId() {
    if (typeof window === 'undefined') return null;

    // 1. URL-query parameter (?service_id=hankasalmiinfo)
    const params = new URLSearchParams(window.location.search);
    const queryServiceId = params.get('service_id') || params.get('context');
    if (queryServiceId) return queryServiceId;

    // 2. Domain / Subdomain check (hankasalmi.fi -> hankasalmiinfo)
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('hankasalmi')) return 'hankasalmiinfo';
    if (hostname.includes('laukaa')) return 'laukaainfo';

    return null;
  }

  /**
   * Varajärjestelmä-konteksti virhetilanteissa
   */
  getFallbackContext(serviceId) {
    return {
      id: serviceId || 'laukaainfo',
      name: serviceId === 'hankasalmiinfo' ? 'HankasalmiInfo' : 'LaukaaInfo',
      default_place_id: serviceId === 'hankasalmiinfo' 
        ? '910ce8f3-7b76-4276-ac17-7f7238224f00' 
        : '55555555-5555-4555-a555-555555555555',
      content_scope: { mode: 'TREE' },
      resolved_place_ids: serviceId === 'hankasalmiinfo'
        ? ['910ce8f3-7b76-4276-ac17-7f7238224f00']
        : ['55555555-5555-4555-a555-555555555555'],
      branding: { name: serviceId === 'hankasalmiinfo' ? 'HankasalmiInfo' : 'LaukaaInfo' },
      feature_flags: { wall: true, wonderin: true, muisto: true },
      is_active: true
    };
  }
}
