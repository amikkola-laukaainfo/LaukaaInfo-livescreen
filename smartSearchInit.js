/**
 * smartSearchInit.js
 * 
 * Initializes 3D PlaceContext entity-aware search for LaukaaInfo Web.
 * Integrates PlaceHierarchy, PlaceContext, Context Chips, and SearchEngine.
 */

(function () {
    let currentPlaceContext = null;
    let currentTheme = null;
    let placesData = [];
    let companiesData = [];
    let eventsData = [];

    document.addEventListener('DOMContentLoaded', () => {
        initSmartSearch();
    });

    async function initSmartSearch() {
        const searchInput = document.getElementById('v4-global-search');
        const dropdown = document.getElementById('v4-search-dropdown');
        const chipsContainer = document.getElementById('search-context-chips');

        if (!searchInput || !dropdown) return;

        // Load data if available
        try {
            if (typeof window.allCompanies !== 'undefined' && window.allCompanies.length) {
                companiesData = window.allCompanies;
            } else {
                const compRes = await fetch('companies_data.json').catch(() => null);
                if (compRes && compRes.ok) companiesData = await compRes.json();
            }

            const placesRes = await fetch('paikat_laukaa.json').catch(() => null);
            if (placesRes && placesRes.ok) placesData = await placesRes.json();

            const eventsRes = await fetch('tapahtumat.json').catch(() => null);
            if (eventsRes && eventsRes.ok) eventsData = await eventsRes.json();
        } catch (e) {
            console.warn('[SmartSearch] Error loading initial datasets:', e);
        }

        // Initialize PlaceHierarchy
        if (window.defaultPlaceHierarchy) {
            window.defaultPlaceHierarchy.loadPlaces(placesData);
        }

        // Search input typing listener
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            if (!query && !currentPlaceContext && !currentTheme) {
                dropdown.style.display = 'none';
                return;
            }
            renderSearchDropdown(query);
        });

        // Click outside closes dropdown
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function renderSearchDropdown(query) {
        const dropdown = document.getElementById('v4-search-dropdown');
        if (!dropdown) return;

        const hierarchy = window.defaultPlaceHierarchy;
        const matchingPlaces = hierarchy ? hierarchy.searchPlaces(query, 5) : [];
        
        // Match themes
        const sampleThemes = ['Aamiainen', 'Luonto & Retkeily', 'Lapsille & Perheille', 'Virkistys', 'Kulttuuri & Tapahtumat', 'Hyvinvointi'];
        const matchingThemes = query 
            ? sampleThemes.filter(t => t.toLowerCase().includes(query.toLowerCase()))
            : [];

        // Build active PlaceContext
        const activeSearchContext = {
            query,
            placeContext: currentPlaceContext,
            themeId: currentTheme
        };

        // Execute decoupled SearchEngine query
        const results = (typeof window.executeContextSearch === 'function') 
            ? window.executeContextSearch(activeSearchContext, companiesData, placesData, eventsData)
            : { companies: [], places: [], events: [] };

        let html = '';

        // SECTION 1: ENTITY MATCHES (PAIKAT & TEEMAT AUTOCOMPLETE)
        if (query && (matchingPlaces.length > 0 || matchingThemes.length > 0)) {
            html += `<div style="margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.75rem;">`;
            html += `<div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 0.5rem;">EHDOTETUT RAJAUKSET</div>`;
            
            matchingPlaces.forEach(p => {
                const typeLabel = window.PLACE_TYPE_LABELS ? (window.PLACE_TYPE_LABELS[p.place_type] || p.place_type) : p.place_type;
                const parentName = p.parent_place_id ? (p.municipality || 'Laukaa') : 'Laukaa';
                html += `
                    <div class="search-suggestion-item" data-type="place" data-id="${p.id}" style="padding: 0.5rem 0.75rem; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='transparent';">
                        <span style="font-weight: 700; color: #0f172a;">📍 ${escapeHtml(p.name)}</span>
                        <span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 12px; font-weight: 600;">${typeLabel} · ${escapeHtml(parentName)}</span>
                    </div>
                `;
            });

            matchingThemes.forEach(t => {
                html += `
                    <div class="search-suggestion-item" data-type="theme" data-theme="${t}" style="padding: 0.5rem 0.75rem; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='transparent';">
                        <span style="font-weight: 700; color: #0f172a;">🏷️ ${escapeHtml(t)}</span>
                        <span style="font-size: 0.75rem; background: #fef3c7; color: #b45309; padding: 0.2rem 0.5rem; border-radius: 12px; font-weight: 600;">Teema</span>
                    </div>
                `;
            });

            html += `</div>`;
        }

        // SECTION 2: YRITYKSET & PALVELUT
        if (results.companies && results.companies.length > 0) {
            html += `<div style="margin-bottom: 1rem;">`;
            html += `<div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 0.5rem;">YRITYKSET & PALVELUT (${results.companies.length})</div>`;
            results.companies.slice(0, 5).forEach(c => {
                html += `
                    <a href="yrityskortti.html?id=${encodeURIComponent(c.id || c.name)}" style="text-decoration: none; display: block; padding: 0.5rem 0.75rem; border-radius: 8px; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                        <div style="font-weight: 700; color: #0284c7;">☕ ${escapeHtml(c.name)}</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${escapeHtml(c.category || 'Palvelu')} · ${escapeHtml(c.municipality || 'Laukaa')}</div>
                    </a>
                `;
            });
            html += `</div>`;
        }

        // SECTION 3: PAIKAT & KOHTEET
        if (results.places && results.places.length > 0) {
            html += `<div style="margin-bottom: 1rem;">`;
            html += `<div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 0.5rem;">PAIKAT & KOHTEET (${results.places.length})</div>`;
            results.places.slice(0, 4).forEach(p => {
                html += `
                    <a href="kohdekartta.html?id=${encodeURIComponent(p.id || p.name)}" style="text-decoration: none; display: block; padding: 0.5rem 0.75rem; border-radius: 8px; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                        <div style="font-weight: 700; color: #059669;">📍 ${escapeHtml(p.name)}</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${escapeHtml(p.municipality || 'Laukaa')}</div>
                    </a>
                `;
            });
            html += `</div>`;
        }

        if (!html) {
            html = `<div style="padding: 1rem; text-align: center; color: #94a3b8;">Ei tuloksia haulla "${escapeHtml(query)}"</div>`;
        }

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        // Attach click listeners for suggestion selection
        dropdown.querySelectorAll('.search-suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = item.getAttribute('data-type');
                if (type === 'place') {
                    const placeId = item.getAttribute('data-id');
                    selectPlaceContext(placeId);
                } else if (type === 'theme') {
                    const theme = item.getAttribute('data-theme');
                    selectThemeContext(theme);
                }
            });
        });
    }

    function selectPlaceContext(placeId) {
        if (!window.PlaceContext || !window.defaultPlaceHierarchy) return;
        currentPlaceContext = window.PlaceContext.create(placeId, window.defaultPlaceHierarchy);
        
        // Clear text field so input is clean, place becomes chip
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
            html += `
                <span style="display: inline-flex; align-items: center; gap: 0.35rem; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 0.35rem 0.75rem; border-radius: 50px; font-weight: 700; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    🏷️ ${escapeHtml(currentTheme)}
                    <button type="button" class="remove-chip-btn" data-chip="theme" style="background: none; border: none; color: #b45309; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.1rem; font-weight: 800;">&times;</button>
                </span>
            `;
        }

        chipsContainer.innerHTML = html;

        // Attach listeners for chip removal
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
