/**
 * smartSearchInit.js
 * 
 * 3D PlaceContext & Kanoninen Teema×Paikka -hakumoottori LaukaaInfo Webille.
 * Integroi:
 *  - Supabase-teemat (tags, theme_places V5.0)
 *  - Teemakytketyt paikat (theme_places: 15 paikkaa retkeilylle jne.)
 *  - Teemakytketyt toimijat (actor_theme_places, actor_themes, entity_tags, get_contextual_theme_results_v2)
 *  - Taajamat, Paikat, Yritykset ja Tapahtumat
 */

(function () {
    window.__smartSearchActive = true;
    let currentPlaceContext = null;
    let currentTheme = null;
    let placesData = [];
    let companiesData = [];
    let eventsData = [];
    let allThemes = [];
    let themePlacesCache = {}; // tag_id -> [{ place_id, name, type }]
    let actorThemesCache = {}; // tag_id -> [{ actor_id, name, type }]

    const SB_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
    const SB_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

    function getSupabase() {
        if (window.LaukaaSupabase) return window.LaukaaSupabase;
        if (window.supabaseClient) return window.supabaseClient;
        if (window.aiSb) return window.aiSb;
        if (typeof window.supabase !== 'undefined') {
            window.aiSb = window.supabase.createClient(SB_URL, SB_KEY);
            return window.aiSb;
        }
        return null;
    }

    document.addEventListener('DOMContentLoaded', () => {
        initSmartSearch();
    });

    async function initSmartSearch() {
        const searchInput = document.getElementById('v4-global-search');
        const dropdown = document.getElementById('v4-search-dropdown');
        if (!searchInput || !dropdown) return;

        try {
            if (typeof window.allCompanies !== 'undefined' && Array.isArray(window.allCompanies) && window.allCompanies.length) {
                companiesData = window.allCompanies;
            } else {
                const compRes = await fetch('companies_data.json').catch(() => null);
                if (compRes && compRes.ok) {
                    const cJson = await compRes.json();
                    companiesData = Array.isArray(cJson) ? cJson : (cJson?.results || []);
                }
            }

            const placesRes = await fetch('paikat_laukaa.json').catch(() => null);
            if (placesRes && placesRes.ok) {
                const pJson = await placesRes.json();
                placesData = Array.isArray(pJson) ? pJson : (pJson?.results || []);
            }

            const eventsRes = await fetch('tapahtumat.json').catch(() => null);
            if (eventsRes && eventsRes.ok) {
                const eJson = await eventsRes.json();
                eventsData = Array.isArray(eJson) ? eJson : (eJson?.results || []);
            }
        } catch (e) {
            console.warn('[SmartSearch] Alustustiedostojen latausvirhe:', e);
        }

        // Alustetaan PlaceHierarchy
        if (window.defaultPlaceHierarchy) {
            window.defaultPlaceHierarchy.loadPlaces(placesData);
        }

        // 2. Haetaan Supabasen viralliset teemat ja theme_places -laskurit
        loadThemesFromSupabase();

        // 3. Hakukentän kuuntelija (debounce 150ms)
        let debounceTimer = null;
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            clearTimeout(debounceTimer);
            if (!query && !currentPlaceContext && !currentTheme) {
                dropdown.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(() => {
                renderSearchDropdown(query);
            }, 150);
        });

        // Avaa pudotusvalikko fokuksessa jos kentässä tekstiä tai filtteri aktiivinen
        searchInput.addEventListener('focus', () => {
            const query = searchInput.value.trim();
            if (query || currentPlaceContext || currentTheme) {
                renderSearchDropdown(query);
            }
        });

        // Klikkaus ulkopuolelle sulkee dropdownin
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    async function loadThemesFromSupabase() {
        const sb = getSupabase();
        if (!sb) return;

        try {
            // Haetaan aktiiviset teemat laskureineen
            const { data: rpcThemes, error: rpcErr } = await sb.rpc('get_active_themes_with_counts');
            if (!rpcErr && rpcThemes && rpcThemes.length) {
                allThemes = rpcThemes;
            } else {
                const { data: tags } = await sb.from('tags').select('tag_id, name, category, status').eq('active', true);
                if (tags) {
                    allThemes = tags.map(t => ({
                        tag_id: t.tag_id,
                        name: t.name,
                        category: t.category,
                        places_count: 0
                    }));
                }
            }

            // Haetaan myös theme_places -määrät varmuudeksi
            const { data: tpCounts } = await sb
                .from('theme_places')
                .select('tag_id');
            if (tpCounts && tpCounts.length) {
                const countMap = {};
                tpCounts.forEach(r => {
                    countMap[r.tag_id] = (countMap[r.tag_id] || 0) + 1;
                });
                allThemes.forEach(t => {
                    if (countMap[t.tag_id]) {
                        t.places_count = Math.max(t.places_count || 0, countMap[t.tag_id]);
                    }
                });
            }
        } catch (e) {
            console.warn('[SmartSearch] Teemojen latausvirhe Supabasesta:', e);
        }
    }

    async function fetchThemePlaces(tagId) {
        if (themePlacesCache[tagId]) return themePlacesCache[tagId];
        const sb = getSupabase();
        if (!sb) return [];

        try {
            const { data, error } = await sb
                .from('theme_places')
                .select('place_id, places(id, place_id, name, canonical_name, type, municipality)')
                .eq('tag_id', tagId)
                .limit(15);

            if (!error && data) {
                const places = data.map(r => {
                    const p = r.places || {};
                    return {
                        id: p.id || r.place_id,
                        place_id: p.place_id || r.place_id,
                        name: p.name || p.canonical_name || r.place_id,
                        type: p.type || 'Kohde',
                        municipality: p.municipality || 'Laukaa'
                    };
                }).filter(p => p.name);
                themePlacesCache[tagId] = places;
                return places;
            }
        } catch (e) {
            console.warn('[SmartSearch] Virhe theme_places haussa tagille ' + tagId, e);
        }
        return [];
    }

    async function fetchThemeActors(tagId, placeId = null) {
        const cacheKey = `${tagId}_${placeId || 'all'}`;
        if (actorThemesCache[cacheKey]) return actorThemesCache[cacheKey];
        const sb = getSupabase();
        if (!sb) return [];

        try {
            // 1. Kokeillaan uutta v2 hakufunktiota
            const { data: v2Data, error: v2Err } = await sb.rpc('get_contextual_theme_results_v2', {
                p_place_id: placeId,
                p_tag_id: tagId,
                p_radius_km: 10.0
            });

            if (!v2Err && v2Data && v2Data.length) {
                const mapped = v2Data.map(r => ({
                    id: r.entity_id,
                    name: r.entity_name,
                    tier_name: r.tier_name,
                    is_partner: r.is_partner,
                    relevance_tier: r.relevance_tier,
                    entity_type: r.entity_type
                }));
                actorThemesCache[cacheKey] = mapped;
                return mapped;
            }

            // 2. Fallback entity_tags + companies
            const { data: etRows } = await sb
                .from('entity_tags')
                .select('entity_id, entity_type')
                .eq('tag_id', tagId)
                .in('entity_type', ['COMPANY', 'company', 'ACTOR']);

            if (etRows && etRows.length) {
                const companyIds = etRows.map(r => r.entity_id);
                const { data: compRows } = await sb
                    .from('companies')
                    .select('id, name, kategoria, alue_slug')
                    .in('id', companyIds);

                if (compRows && compRows.length) {
                    const mapped = compRows.map(c => ({
                        id: c.id,
                        name: c.name,
                        category: c.kategoria || '',
                        municipality: c.alue_slug || 'Laukaa',
                        tier_name: 'LOCAL_THEME',
                        is_partner: false,
                        entity_type: 'COMPANY'
                    }));
                    actorThemesCache[cacheKey] = mapped;
                    return mapped;
                }
            }
        } catch (e) {
            console.warn('[SmartSearch] Virhe teeman toimijoiden haussa:', e);
        }
        return [];
    }

    async function renderSearchDropdown(query) {
        const dropdown = document.getElementById('v4-search-dropdown');
        if (!dropdown) return;

        const qLower = query.toLowerCase().trim();
        const hierarchy = window.defaultPlaceHierarchy;
        let matchingPlaces = hierarchy && qLower ? hierarchy.searchPlaces(qLower, 5) : [];

        const MAIN_AREAS = [
            { name: 'Lievestuore', type: 'Taajama · Laukaa', url: 'lievestuore.html', keywords: ['lievestuore', 'lievestuoreen', 'lievestuoreella'] },
            { name: 'Laukaan kirkonkylä', type: 'Keskus · Laukaa', url: 'laukaa.html', keywords: ['laukaa', 'kirkonkylä', 'kk', 'keskusta'] },
            { name: 'Leppävesi', type: 'Taajama · Laukaa', url: 'leppavesi.html', keywords: ['leppavesi', 'leppävesi', 'leppäveden'] },
            { name: 'Vihtavuori', type: 'Taajama · Laukaa', url: 'vihtavuori.html', keywords: ['vihtavuori', 'vihtavuoren'] },
            { name: 'Vehniä', type: 'Kylä · Laukaa', url: 'vehnia.html', keywords: ['vehnia', 'vehniä', 'vehniän'] },
            { name: 'Koko Laukaa', type: 'Kunta', url: 'koko-laukaa.html', keywords: ['koko laukaa', 'koko'] }
        ];

        const matchedAreas = qLower ? MAIN_AREAS.filter(a =>
            a.name.toLowerCase().includes(qLower) ||
            a.keywords.some(kw => kw.includes(qLower) || qLower.includes(kw))
        ) : [];

        // ── 1. Teematäsmäys Supabase-teemoista ──────────────────────────────
        const matchedThemes = qLower ? allThemes.filter(t => {
            const tagId = (t.tag_id || '').toLowerCase();
            const name = (t.name || '').toLowerCase();
            return tagId.includes(qLower) || name.includes(qLower) || qLower.includes(tagId);
        }).slice(0, 4) : [];

        // Jos suora teema löytyy (esim. retkeily), haetaan sen paikat & toimijat
        let themePlaces = [];
        let themeActors = [];
        const primaryTheme = matchedThemes.length ? matchedThemes[0] : (currentTheme ? allThemes.find(t => t.tag_id === currentTheme || t.name === currentTheme) : null);

        if (primaryTheme) {
            themePlaces = await fetchThemePlaces(primaryTheme.tag_id);
            themeActors = await fetchThemeActors(primaryTheme.tag_id, currentPlaceContext?.targetPlace?.id);
        }

        // ── 2. Decoupled ContextSearch (staattinen fallback & tekstihaku) ──
        const activeSearchContext = {
            query,
            placeContext: currentPlaceContext,
            themeId: currentTheme || (primaryTheme ? primaryTheme.tag_id : null)
        };

        const results = (typeof window.executeContextSearch === 'function') 
            ? window.executeContextSearch(activeSearchContext, companiesData, placesData, eventsData)
            : { companies: [], places: [], events: [] };

        // Yhdistetään teemapaikat tuloksiin
        const combinedPlaces = [...themePlaces];
        (results.places || []).forEach(p => {
            if (!combinedPlaces.some(cp => cp.name === p.name || (cp.place_id && cp.place_id === p.place_id))) {
                combinedPlaces.push(p);
            }
        });

        // Yhdistetään teematoimijat tuloksiin
        const combinedCompanies = [...themeActors];
        (results.companies || []).forEach(c => {
            if (!combinedCompanies.some(cc => cc.name === c.name || (cc.id && cc.id === c.id))) {
                combinedCompanies.push(c);
            }
        });

        let html = '';

        // ── SECTION 0: TAAJAMAT & ALUEET ───────────────────────────────────
        if (matchedAreas.length > 0) {
            html += `<div style="margin-bottom: 0.85rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem;">`;
            html += `<div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #0056b3; letter-spacing: 0.05em; margin-bottom: 0.4rem;">🏞️ TAAJAMAT & ALUEET</div>`;
            matchedAreas.forEach(a => {
                html += `
                    <a href="${a.url}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.7rem; border-radius: 8px; text-decoration: none; color: #0056b3; font-size: 0.92rem; font-weight: 700; background: #f0f7ff; margin-bottom: 4px;" onmouseover="this.style.background='#e0f2fe';" onmouseout="this.style.background='#f0f7ff';">
                        <span>🏞️ ${escapeHtml(a.name)}</span>
                        <span style="font-size: 0.72rem; background: #0056b3; color: white; padding: 0.15rem 0.5rem; border-radius: 12px; font-weight: 600;">${escapeHtml(a.type)}</span>
                    </a>
                `;
            });
            html += `</div>`;
        }

        // ── SECTION 1: NÄKÖKULMAT / TEEMAT (Viralliset Supabase-teemat) ────
        if (matchedThemes.length > 0) {
            html += `<div style="margin-bottom: 0.85rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem;">`;
            html += `<div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #059669; letter-spacing: 0.05em; margin-bottom: 0.4rem;">🌲 NÄKÖKULMAT & TEEMAT</div>`;
            
            matchedThemes.forEach(t => {
                const countLabel = t.places_count ? `${t.places_count} kohdetta` : 'Teemasivu';
                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 4px;">
                        <a href="teema.html?tag=${encodeURIComponent(t.tag_id)}" style="flex: 1; display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.7rem; border-radius: 8px; text-decoration: none; color: #065f46; font-size: 0.92rem; font-weight: 700; background: #ecfdf5;" onmouseover="this.style.background='#d1fae5';" onmouseout="this.style.background='#ecfdf5';">
                            <span>🌲 ${escapeHtml(t.name || t.tag_id)}</span>
                            <span style="font-size: 0.72rem; background: #10b981; color: white; padding: 0.15rem 0.5rem; border-radius: 12px; font-weight: 600;">${countLabel} →</span>
                        </a>
                        <button type="button" class="search-suggestion-item" data-type="theme" data-theme="${escapeHtml(t.tag_id)}" title="Rajaa näkymä tähän teemaan" style="border: 1px solid #a7f3d0; background: #ffffff; color: #047857; font-size: 0.75rem; font-weight: 700; padding: 0.45rem 0.65rem; border-radius: 8px; cursor: pointer;">
                            + Rajaa
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        }

        // ── SECTION 2: PAIKAT & KOHTEET (sis. teemaan liitetyt kohteet) ────
        if (combinedPlaces.length > 0) {
            html += `<div style="margin-bottom: 0.85rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.6rem;">`;
            const headerTitle = primaryTheme ? `PAIKAT & KOHTEET (${primaryTheme.name || primaryTheme.tag_id}: ${combinedPlaces.length})` : `PAIKAT & KOHTEET (${combinedPlaces.length})`;
            html += `<div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #0284c7; letter-spacing: 0.05em; margin-bottom: 0.4rem;">📍 ${escapeHtml(headerTitle)}</div>`;
            
            combinedPlaces.slice(0, 6).forEach(p => {
                const targetUrl = p.place_id ? `tietoa-paikasta.html?id=${encodeURIComponent(p.place_id)}` : `kohdekartta.html?id=${encodeURIComponent(p.id || p.name)}`;
                const typeText = p.type || p.municipality || 'Kohde';
                html += `
                    <a href="${targetUrl}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.7rem; border-radius: 8px; text-decoration: none; color: #0f172a; font-size: 0.92rem; font-weight: 600; margin-bottom: 3px;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                        <span>📍 ${escapeHtml(p.name)}</span>
                        <span style="font-size: 0.72rem; color: #64748b; background: #e0f2fe; padding: 0.15rem 0.45rem; border-radius: 6px;">${escapeHtml(typeText)}</span>
                    </a>
                `;
            });
            html += `</div>`;
        }

        // ── SECTION 3: YRITYKSET & TOIMIJAT (sis. teematoimijat v2) ─────────
        if (combinedCompanies.length > 0) {
            html += `<div style="margin-bottom: 0.5rem;">`;
            const compHeader = primaryTheme ? `YRITYKSET & PALVELUT (${primaryTheme.name || primaryTheme.tag_id}: ${combinedCompanies.length})` : `YRITYKSET & PALVELUT (${combinedCompanies.length})`;
            html += `<div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #7c3aed; letter-spacing: 0.05em; margin-bottom: 0.4rem;">🏢 ${escapeHtml(compHeader)}</div>`;
            
            combinedCompanies.slice(0, 5).forEach(c => {
                const badge = c.is_partner ? `<span style="font-size: 0.68rem; background: #fef3c7; color: #92400e; padding: 0.15rem 0.45rem; border-radius: 6px; font-weight: 700;">★ Kumppani</span>` : '';
                html += `
                    <a href="yrityskortti.html?id=${encodeURIComponent(c.id || c.name)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.7rem; border-radius: 8px; text-decoration: none; color: #0f172a; margin-bottom: 3px;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                        <div>
                            <div style="font-weight: 700; color: #6d28d9; font-size: 0.92rem;">🏢 ${escapeHtml(c.name)}</div>
                            <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(c.category || 'Palvelu · Laukaa')}</div>
                        </div>
                        ${badge}
                    </a>
                `;
            });
            html += `</div>`;
        }

        if (!html) {
            html = `<div style="padding: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.92rem;">Ei tuloksia haulla "${escapeHtml(query)}"</div>`;
        }

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        // Suodatin-klikkaukset
        dropdown.querySelectorAll('.search-suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const type = item.getAttribute('data-type');
                if (type === 'theme') {
                    const theme = item.getAttribute('data-theme');
                    selectThemeContext(theme);
                } else if (type === 'place') {
                    const placeId = item.getAttribute('data-id');
                    selectPlaceContext(placeId);
                }
            });
        });
    }

    function selectPlaceContext(placeId) {
        if (!window.PlaceContext || !window.defaultPlaceHierarchy) return;
        currentPlaceContext = window.PlaceContext.create(placeId, window.defaultPlaceHierarchy);
        const searchInput = document.getElementById('v4-global-search');
        if (searchInput) searchInput.value = '';
        renderContextChips();
        renderSearchDropdown('');
    }

    function selectThemeContext(theme) {
        currentTheme = theme;
        const searchInput = document.getElementById('v4-global-search');
        if (searchInput) searchInput.value = '';
        renderContextChips();
        renderSearchDropdown('');
    }

    function renderContextChips() {
        const chipsContainer = document.getElementById('search-context-chips');
        if (!chipsContainer) return;

        let html = '';

        if (currentPlaceContext && currentPlaceContext.targetPlace) {
            const p = currentPlaceContext.targetPlace;
            html += `
                <span style="display: inline-flex; align-items: center; gap: 0.35rem; background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; padding: 0.35rem 0.75rem; border-radius: 50px; font-weight: 700; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    📍 ${escapeHtml(p.name)}
                    <button type="button" class="remove-chip-btn" data-chip="place" style="background: none; border: none; color: #0369a1; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.1rem; font-weight: 800;">&times;</button>
                </span>
            `;
        }

        if (currentTheme) {
            const found = allThemes.find(t => t.tag_id === currentTheme || t.name === currentTheme);
            const themeLabel = found ? (found.name || found.tag_id) : currentTheme;
            html += `
                <span style="display: inline-flex; align-items: center; gap: 0.35rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 0.35rem 0.75rem; border-radius: 50px; font-weight: 700; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    🏷️ ${escapeHtml(themeLabel)}
                    <button type="button" class="remove-chip-btn" data-chip="theme" style="background: none; border: none; color: #b45309; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.1rem; font-weight: 800;">&times;</button>
                </span>
            `;
        }

        chipsContainer.innerHTML = html;

        chipsContainer.querySelectorAll('.remove-chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.getAttribute('data-chip');
                if (type === 'place') currentPlaceContext = null;
                if (type === 'theme') currentTheme = null;
                renderContextChips();
                renderSearchDropdown('');
            });
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
