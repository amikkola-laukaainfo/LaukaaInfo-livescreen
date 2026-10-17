/**
 * dashboardController.js
 * 
 * LaukaaInfo & LaukaaLive tilannekuvan ohjainmoduuli.
 * Kuluttaa Supabasen RPC-funktiota: public.get_laukaa_dashboard(p_place_id UUID)
 * 
 * Ominaisuudet:
 *  - Kilpatilanteiden esto (requestId / race condition guard)
 *  - 3 minuutin TTL-välimuisti
 *  - XSS-turvallinen tekstin käsittely
 *  - Responsiivinen renderöinti (kunnanäkymä vs. taajamanäkymä)
 *  - Interaktiivinen porautuminen taajamiin ilman sivulatausta
 */

class DashboardController {
    constructor(options = {}) {
        this.containerId = options.containerId || 'dashboard-root';
        this.supabase = options.supabase || window.LaukaaSupabase || window.supabaseClient;
        this.currentPlaceId = options.initialPlaceId || null;
        
        this.requestId = 0;
        this.cache = new Map(); // key -> { data, timestamp }
        this.cacheTtlMs = options.cacheTtlMs || (3 * 60 * 1000); // 3 min
        
        this.onContextChanged = options.onContextChanged || null;
    }

    /**
     * Alustaa ohjaimen ja käynnistää ensihaun.
     */
    init() {
        if (!this.supabase) {
            this.supabase = window.LaukaaSupabase || window.supabaseClient;
        }

        // Tarkistetaan URL-parametrit (?place=...)
        const urlParams = new URLSearchParams(window.location.search);
        const placeParam = urlParams.get('place') || urlParams.get('id');
        if (placeParam && placeParam.length === 36) {
            this.currentPlaceId = placeParam;
        }

        // Kuunnellaan paikan vaihtumista (PlaceContext / muut sivuston osat)
        window.addEventListener('laukaa:place-changed', (e) => {
            if (e.detail && e.detail.placeId !== undefined && e.detail.placeId !== this.currentPlaceId) {
                this.load(e.detail.placeId);
            }
        });

        this.load(this.currentPlaceId);
    }

    /**
     * Hakee koontidatan ja päivittää näkymän.
     * @param {string|null} placeId - UUID tai null (koko Laukaa)
     * @param {boolean} forceRefresh - Ohita välimuisti
     */
    async load(placeId = null, forceRefresh = false) {
        const thisReq = ++this.requestId;
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const cacheKey = placeId ? placeId.toLowerCase() : 'root';

        // 1. Välimuistitarkistus
        if (!forceRefresh) {
            const cached = this.getCache(cacheKey);
            if (cached) {
                this.currentPlaceId = placeId;
                this.updateUrl(placeId);
                this.render(cached);
                if (typeof this.onContextChanged === 'function') {
                    this.onContextChanged(cached.context);
                }
                return;
            }
        }

        this.renderLoading(container);

        try {
            if (!this.supabase) {
                throw new Error('Supabase-yhteyttä ei ole alustettu. Tarkista supabase-config.js.');
            }

            // 2. Kutsu RPC-funktiota
            const { data, error } = await this.supabase.rpc('get_laukaa_dashboard', {
                p_place_id: placeId
            });

            // 3. Kilpatilanteen esto: jos uudempi pyyntö on jo lähetetty, hylätään tämä
            if (thisReq !== this.requestId) return;

            if (error) {
                console.error('get_laukaa_dashboard RPC error:', error);
                throw error;
            }

            if (!data) {
                this.renderError(container, 'Valittua aluetta ei löytynyt tai se ei kuulu Laukaan kuntakontekstiin.');
                return;
            }

            // 4. Tallennus välimuistiin ja renderöinti
            this.setCache(cacheKey, data);
            this.currentPlaceId = placeId;
            this.updateUrl(placeId);
            this.render(data);

            if (typeof this.onContextChanged === 'function') {
                this.onContextChanged(data.context);
            }

        } catch (err) {
            if (thisReq === this.requestId) {
                this.renderError(container, err.message || 'Virhe ladattaessa tilannekuvaa.');
            }
        }
    }

    /**
     * Välimuistin hallinta
     */
    getCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.cacheTtlMs) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clearCache() {
        this.cache.clear();
    }

    /**
     * Päivittää selaimen osoitepalkin ilman sivulatausta
     */
    updateUrl(placeId) {
        const url = new URL(window.location);
        if (placeId) {
            url.searchParams.set('place', placeId);
        } else {
            url.searchParams.delete('place');
            url.searchParams.delete('id');
        }
        window.history.replaceState({ placeId }, '', url);
    }

    /**
     * XSS-turvallinen tekstinsuojaus
     */
    escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Muotoilee ISO-aikaleiman selkeäksi suomalaiseksi esitystavaksi
     */
    formatDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
        } catch (e) {
            return isoStr;
        }
    }

    // =========================================================
    // RENDERÖINTI
    // =========================================================

    renderLoading(container) {
        container.innerHTML = `
            <div class="tk-loading-wrap">
                <div class="tk-spinner"></div>
                <p>Ladataan tilannekuvaa...</p>
            </div>
        `;
    }

    renderError(container, message) {
        container.innerHTML = `
            <div class="tk-error-card">
                <div class="tk-error-icon">⚠️</div>
                <h3>Tietojen lataus epäonnistui</h3>
                <p>${this.escape(message)}</p>
                <div class="tk-btn-row">
                    <button class="tk-btn tk-btn-primary" onclick="window.dashboard.load(null, true)">Palaa koko Laukaaseen</button>
                    <button class="tk-btn tk-btn-secondary" onclick="window.dashboard.load('${this.escape(this.currentPlaceId)}', true)">Yritä uudelleen</button>
                </div>
            </div>
        `;
    }

    render(data) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const { context, counts, pulse, sub_areas } = data;
        const isMunicipality = (context.scope === 'municipality');

        let html = `
            <div class="tk-dashboard-view">
                <!-- 1. KONTEKSTIPURUPALKKI / HERO -->
                <header class="tk-header-card">
                    <div class="tk-header-left">
                        <nav class="tk-breadcrumb">
                            <span class="tk-crumb-item ${isMunicipality ? 'active' : ''}" onclick="window.dashboard.load(null)">Koko Laukaa</span>
                            ${!isMunicipality ? `
                                <span class="tk-crumb-sep">›</span>
                                <span class="tk-crumb-item active">${this.escape(context.place_name)}</span>
                            ` : ''}
                        </nav>
                        <h1 class="tk-title">${this.escape(context.place_name)}</h1>
                        <p class="tk-subtitle">
                            ${isMunicipality 
                                ? 'Yhteinen tilannekuva: kunnan paikat, reitit ja ajankohtaiset tapahtumat' 
                                : `Aluekohtainen katsaus: ${this.escape(context.place_name)} ja sen alakohteet`}
                        </p>
                    </div>
                    <div class="tk-header-actions">
                        ${!isMunicipality ? `
                            <button class="tk-btn tk-btn-secondary" onclick="window.dashboard.load(null)">
                                ← Takaisin koko Laukaaseen
                            </button>
                            <a class="tk-btn tk-btn-secondary" href="tietoa-paikasta.html?id=${encodeURIComponent(context.place_id)}">
                                📂 Alueen palvelut &amp; kohteet →
                            </a>
                        ` : `
                            <a class="tk-btn tk-btn-secondary" href="koko-laukaa.html">
                                📂 Kaikki palvelut &amp; kohteet →
                            </a>
                        `}
                        <button class="tk-btn tk-btn-ghost" title="Päivitä tiedot" onclick="window.dashboard.load('${this.escape(this.currentPlaceId)}', true)">
                            🔄 Päivitä
                        </button>
                    </div>
                </header>

                <!-- 2. TUNNUSLUVUT (METRICS BAR) -->
                <section class="tk-metrics-grid">
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">📍</div>
                        <div class="tk-metric-num">${counts.places || 0}</div>
                        <div class="tk-metric-label">Kohteet & paikat</div>
                    </div>
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">📅</div>
                        <div class="tk-metric-num">${counts.upcoming_events || 0}</div>
                        <div class="tk-metric-label">Tulevat tapahtumat</div>
                    </div>
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">🌲</div>
                        <div class="tk-metric-num">${counts.routes || 0}</div>
                        <div class="tk-metric-label">Reitit</div>
                    </div>
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">💼</div>
                        <div class="tk-metric-num">${counts.services || 0}</div>
                        <div class="tk-metric-label">Palvelut & yritykset</div>
                    </div>
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">💭</div>
                        <div class="tk-metric-num">${counts.recent_memories || 0}</div>
                        <div class="tk-metric-label">Uutta muistoissa (30 pv)</div>
                    </div>
                    <div class="tk-metric-card">
                        <div class="tk-metric-icon">🤝</div>
                        <div class="tk-metric-num">${counts.active_encounters || 0}</div>
                        <div class="tk-metric-label">Aktiiviset kohtaamiset</div>
                    </div>
                </section>

                <!-- 3. TAAJAMAKORTIT (Vain koko kunnan tasolla) -->
                ${isMunicipality && sub_areas && sub_areas.length > 0 ? `
                    <section class="tk-section">
                        <div class="tk-section-header">
                            <h2>🏘️ Laukaan taajamat ja alueet</h2>
                            <span class="tk-badge">${sub_areas.length} aluetta</span>
                        </div>
                        <p class="tk-section-desc">Valitse taajama porautuaksesi suoraan alueen omaan sisältöverkostoon:</p>
                        <div class="tk-subareas-grid">
                            ${sub_areas.map(area => `
                                <div class="tk-area-card" onclick="window.dashboard.load('${this.escape(area.id)}')">
                                    <div class="tk-area-header">
                                        <h3 class="tk-area-title">${this.escape(area.name)}</h3>
                                        <span class="tk-area-arrow">→</span>
                                    </div>
                                    <div class="tk-area-stats">
                                        <span class="tk-pill">📍 ${area.places_count} kohdetta</span>
                                        ${area.events_count > 0 ? `
                                            <span class="tk-pill tk-pill-highlight">📅 ${area.events_count} tapahtumaa</span>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                ` : ''}

                <!-- 4. AJANKOHTAISET SISÄLLÖT (PULSE) -->
                <div class="tk-pulse-grid">
                    <!-- TAPAHTUMAT -->
                    <section class="tk-panel">
                        <div class="tk-panel-header">
                            <h3>📅 Tulevat tapahtumat</h3>
                            <span class="tk-count">${(pulse.events || []).length}</span>
                        </div>
                        <div class="tk-panel-content">
                            ${(pulse.events && pulse.events.length > 0) ? `
                                <ul class="tk-item-list">
                                    ${pulse.events.map(ev => `
                                        <li class="tk-event-item">
                                            <div class="tk-item-time">
                                                <span class="tk-context-pill">${this.escape(ev.time_context)}</span>
                                                <span class="tk-date">${this.formatDate(ev.event_start_at)}</span>
                                            </div>
                                            <h4 class="tk-item-title">${this.escape(ev.title)}</h4>
                                            ${ev.publisher_name ? `
                                                <div class="tk-item-meta">Järjestäjä: ${this.escape(ev.publisher_name)}</div>
                                            ` : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                            ` : `
                                <div class="tk-empty-state">Ei tulevia tapahtumia tällä hetkellä.</div>
                            `}
                        </div>
                    </section>

                    <!-- MUISTOT & TARINAT -->
                    <section class="tk-panel">
                        <div class="tk-panel-header">
                            <h3>💭 Tuoreet muistot & havainnot</h3>
                            <span class="tk-count">${(pulse.memories || []).length}</span>
                        </div>
                        <div class="tk-panel-content">
                            ${(pulse.memories && pulse.memories.length > 0) ? `
                                <ul class="tk-item-list">
                                    ${pulse.memories.map(m => `
                                        <li class="tk-memory-item">
                                            <div class="tk-item-date">${this.formatDate(m.created_at)}</div>
                                            <h4 class="tk-item-title">${this.escape(m.title)}</h4>
                                            ${m.description ? `
                                                <p class="tk-item-desc">${this.escape(m.description)}</p>
                                            ` : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                            ` : `
                                <div class="tk-empty-state">Ei julkaistuja muistoja valitussa kontekstissa.</div>
                            `}
                        </div>
                    </section>

                    <!-- KOHTAAMISET -->
                    <section class="tk-panel">
                        <div class="tk-panel-header">
                            <h3>🤝 Kohtaamiset & vinkit</h3>
                            <span class="tk-count">${(pulse.encounters || []).length}</span>
                        </div>
                        <div class="tk-panel-content">
                            ${(pulse.encounters && pulse.encounters.length > 0) ? `
                                <ul class="tk-item-list">
                                    ${pulse.encounters.map(enc => `
                                        <li class="tk-encounter-item">
                                            <div class="tk-item-badge">${this.escape(enc.type || 'Kohtaaminen')}</div>
                                            <h4 class="tk-item-title">${this.escape(enc.title)}</h4>
                                            ${enc.location ? `
                                                <div class="tk-item-meta">📍 ${this.escape(enc.location)}</div>
                                            ` : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                            ` : `
                                <div class="tk-empty-state">Ei aktiivisia kohtaamisia.</div>
                            `}
                        </div>
                    </section>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }
}

// Globaali instanssin luonti käyttöä varten
window.DashboardController = DashboardController;
