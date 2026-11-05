/**
 * alueet.js - Alueet ja seudullinen paikkatietoverkosto
 * LaukaaInfo / Keski-Suomen elämysverkosto
 */

(function () {
    'use strict';

    let areasData = null;
    let leafletMap = null;
    let markersLayer = null;
    let currentFilter = 'all';

    document.addEventListener('DOMContentLoaded', () => {
        initAlueetPage();
    });

    async function initAlueetPage() {
        try {
            const res = await fetch('areas.json');
            if (!res.ok) throw new Error('areas.json lataus epäonnistui: ' + res.status);
            areasData = await res.json();
        } catch (err) {
            console.error('Virhe ladattaessa areas.json:', err);
            // Fallback jos suora fetch epäonnistuu
            areasData = getFallbackAreasData();
        }

        // Lue URL-parametrit ?alue= tai ?kunta=
        const urlParams = new URLSearchParams(window.location.search);
        const paramAlue = urlParams.get('alue');
        const paramKunta = urlParams.get('kunta');

        if (paramKunta) {
            currentFilter = paramKunta.toLowerCase();
        } else if (paramAlue) {
            currentFilter = paramAlue.toLowerCase();
        }

        renderFilterPills();
        initMap();
        applyFilter(currentFilter, false);
        initSearch();
    }

    function initMap() {
        const mapContainer = document.getElementById('areas-map');
        if (!mapContainer || typeof L === 'undefined') return;

        // Keski-Suomen keskus
        leafletMap = L.map('areas-map', {
            center: [62.35, 25.95],
            zoom: 10,
            scrollWheelZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(leafletMap);

        markersLayer = L.layerGroup().addTo(leafletMap);
        updateMapMarkers();
    }

    function updateMapMarkers() {
        if (!leafletMap || !markersLayer || !areasData) return;
        markersLayer.clearLayers();

        const bounds = L.latLngBounds([]);
        const spots = areasData.map_spots || [];

        spots.forEach(spot => {
            // Suodatustarkistus
            if (currentFilter !== 'all') {
                const matchesMun = spot.municipality.toLowerCase() === currentFilter;
                const matchesRegion = currentFilter === 'jyvaskylan-seutu' || currentFilter === 'keski-suomi';
                if (!matchesMun && !matchesRegion) return;
            }

            const lat = spot.coords[0];
            const lng = spot.coords[1];
            bounds.extend([lat, lng]);

            const isRoute = spot.badge && spot.badge.toLowerCase().includes('reitti');
            const markerColor = isRoute ? '#8b5cf6' : '#0284c7';

            const customIcon = L.divIcon({
                className: 'custom-area-pin',
                html: `<div style="
                    background: ${markerColor};
                    color: white;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                    border: 2px solid white;
                    font-size: 13px;
                ">
                    <span class="iconify" data-icon="${isRoute ? 'material-symbols:route' : 'material-symbols:location-on'}"></span>
                </div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                popupAnchor: [0, -14]
            });

            const marker = L.marker([lat, lng], { icon: customIcon });

            const popupContent = `
                <div style="font-family: 'Inter', sans-serif; min-width: 180px; padding: 2px;">
                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">
                        ${spot.municipality} &bull; ${spot.category}
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                        ${spot.name}
                    </div>
                    ${spot.badge ? `<span style="display:inline-block; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:12px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; margin-bottom:8px;">${spot.badge}</span>` : ''}
                    <div>
                        <a href="${spot.url}" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:600; color:#0284c7; text-decoration:none;">
                            Tutustu kohteeseen &rarr;
                        </a>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent);
            markersLayer.addLayer(marker);
        });

        if (bounds.isValid() && leafletMap) {
            leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
        }
    }

    function renderFilterPills() {
        const container = document.getElementById('filter-pills-container');
        if (!container || !areasData) return;

        const filters = [
            { id: 'all', label: 'Kaikki alueet', icon: 'material-symbols:travel-explore' },
            { id: 'keski-suomi', label: 'Keski-Suomi', icon: 'material-symbols:flag' },
            { id: 'jyvaskylan-seutu', label: 'Jyväskylän seutu', icon: 'material-symbols:hub' },
            { id: 'laukaa', label: 'Laukaa', icon: 'material-symbols:location-city' },
            { id: 'hankasalmi', label: 'Hankasalmi', icon: 'material-symbols:nature-people' },
            { id: 'jyvaskyla', label: 'Jyväskylä', icon: 'material-symbols:apartment' },
            { id: 'muurame', label: 'Muurame', icon: 'material-symbols:landscape' }
        ];

        container.innerHTML = filters.map(f => {
            const isActive = currentFilter === f.id;
            return `
                <button type="button" class="filter-pill ${isActive ? 'active' : ''}" data-filter="${f.id}">
                    <span class="iconify" data-icon="${f.icon}"></span>
                    <span>${f.label}</span>
                </button>
            `;
        }).join('');

        container.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const filterId = btn.getAttribute('data-filter');
                applyFilter(filterId, true);
            });
        });
    }

    function applyFilter(filterId, updateUrl = true) {
        currentFilter = filterId;

        // Päivitä napit
        document.querySelectorAll('.filter-pill').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === filterId);
        });

        // Päivitä URL ilman sivun uudelleenlatausta
        if (updateUrl) {
            const newUrl = new URL(window.location);
            if (filterId === 'all') {
                newUrl.searchParams.delete('alue');
                newUrl.searchParams.delete('kunta');
            } else if (filterId === 'keski-suomi' || filterId === 'jyvaskylan-seutu') {
                newUrl.searchParams.set('alue', filterId);
                newUrl.searchParams.delete('kunta');
            } else {
                newUrl.searchParams.set('kunta', filterId);
                newUrl.searchParams.delete('alue');
            }
            window.history.replaceState({}, '', newUrl);
        }

        renderMunicipalities();
        renderCuratedRoutes();
        updateMapMarkers();

        // Kartan keskitys jos kunta valittu
        if (leafletMap && areasData && areasData.municipalities) {
            const mun = areasData.municipalities.find(m => m.slug === filterId);
            if (mun && mun.center) {
                leafletMap.flyTo(mun.center, mun.zoom || 11, { duration: 0.8 });
            } else if (filterId === 'all' || filterId === 'keski-suomi') {
                leafletMap.flyTo([62.35, 25.95], 9, { duration: 0.8 });
            }
        }
    }

    function renderMunicipalities() {
        const container = document.getElementById('municipalities-grid');
        if (!container || !areasData) return;

        let items = areasData.municipalities || [];
        if (currentFilter !== 'all') {
            if (currentFilter === 'keski-suomi' || currentFilter === 'jyvaskylan-seutu') {
                // Näytä kaikki seudun kunnat
                items = items.filter(m => m.region_id === 'jyvaskylan-seutu' || currentFilter === 'keski-suomi');
            } else {
                items = items.filter(m => m.slug === currentFilter);
            }
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #f8fafc; border-radius: 16px; color: #64748b;">
                    <p style="font-size: 1.1rem; font-weight: 600;">Alueelta ei löytynyt suoria kuntakortteja.</p>
                    <button type="button" class="btn btn-secondary" onclick="window.resetAreaFilter()" style="margin-top: 1rem;">
                        Näytä kaikki alueet
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(m => {
            const isComingSoon = m.level === 'coming_soon';

            const villagesHtml = (!isComingSoon && m.villages && m.villages.length > 0) ? (m.villages || []).map(v => `
                <a href="${v.url}" class="village-tag" title="Näytä paikan tiedot">
                    <span class="iconify" data-icon="material-symbols:pin-drop"></span>
                    <span>${v.name}</span>
                </a>
            `).join('') : '';

            const highlightsHtml = (!isComingSoon && m.highlights && m.highlights.length > 0) ? (m.highlights || []).slice(0, 3).map(h => `
                <li style="display:flex; align-items:flex-start; gap:0.5rem; font-size:0.875rem; color:#334155; margin-bottom:0.35rem;">
                    <span class="iconify" data-icon="material-symbols:check-circle" style="color:#0284c7; flex-shrink:0; margin-top:0.2rem;"></span>
                    <span>${h}</span>
                </li>
            `).join('') : '';

            const badgeBg = isComingSoon ? 'background: rgba(217, 119, 6, 0.95); color: #ffffff;' : '';

            let footerHtml = '';
            if (isComingSoon) {
                footerHtml = `
                    <div style="display:flex; align-items:center; gap:0.5rem; background:#f8fafc; color:#64748b; padding:0.65rem 1rem; border-radius:12px; font-size:0.85rem; font-weight:700; width:100%; justify-content:center; border:1.5px dashed #cbd5e1;">
                        <span class="iconify" data-icon="material-symbols:hourglass-top" style="color:#d97706; font-size:1.15rem;"></span>
                        <span>Kohteet ja sisällöt tulossa</span>
                    </div>
                `;
            } else {
                footerHtml = `
                    ${m.portal_url ? `
                        <a href="${m.portal_url}" class="btn btn-primary" ${m.portal_url.startsWith('http') || m.portal_url.includes('wonderin') ? 'target="_blank"' : ''}>
                            <span>Avaa ${m.name}</span>
                            <span class="iconify" data-icon="material-symbols:arrow-forward"></span>
                        </a>
                    ` : ''}
                    <button type="button" class="btn btn-secondary" onclick="window.focusMunicipalityMap('${m.slug}')" title="Kohdista kartalle">
                        <span class="iconify" data-icon="material-symbols:map"></span>
                        <span>Kartalla</span>
                    </button>
                `;
            }

            return `
                <div class="area-card" data-slug="${m.slug}">
                    <div class="area-card-image" style="background-image: url('${m.image}')">
                        <span class="area-badge" style="${badgeBg}">${m.badge || 'Kunta'}</span>
                    </div>
                    <div class="area-card-content">
                        <div class="area-card-header">
                            <h3 class="area-title">${m.name}</h3>
                            <div class="area-tagline">${m.tagline || ''}</div>
                        </div>
                        <p class="area-desc">${m.description}</p>

                        ${villagesHtml ? `
                            <div style="margin: 1rem 0 0.5rem 0;">
                                <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 0.4rem;">
                                    Taajamat &amp; kohteet:
                                </div>
                                <div class="villages-wrap">${villagesHtml}</div>
                            </div>
                        ` : ''}

                        ${highlightsHtml ? `
                            <div style="margin: 0.75rem 0 1.25rem 0;">
                                <ul style="list-style: none; padding: 0; margin: 0;">${highlightsHtml}</ul>
                            </div>
                        ` : ''}

                        <div class="area-card-footer">
                            ${footerHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderCuratedRoutes() {
        const container = document.getElementById('curated-routes-grid');
        if (!container || !areasData) return;

        let routes = areasData.curated_routes || [];
        if (currentFilter !== 'all' && currentFilter !== 'keski-suomi' && currentFilter !== 'jyvaskylan-seutu') {
            routes = routes.filter(r => r.municipality.toLowerCase() === currentFilter);
        }

        if (routes.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; background: #f8fafc; border-radius: 12px; color: #64748b; font-size: 0.9rem;">
                    Ei suoria reittinostoja tälle rajaukselle. <a href="/tarinakartta.html" style="color:#0284c7; font-weight:600;">Selaa kaikkia reittejä &rarr;</a>
                </div>
            `;
            return;
        }

        container.innerHTML = routes.map(r => `
            <div class="route-card">
                <div class="route-image" style="background-image: url('${r.image}')">
                    <span class="route-type-badge">${r.type}</span>
                </div>
                <div class="route-body">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #0284c7; text-transform: uppercase;">
                        ${r.municipality} &bull; ${r.length} &bull; ${r.duration}
                    </div>
                    <h4 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0.35rem 0;">
                        ${r.title}
                    </h4>
                    <p style="font-size: 0.875rem; color: #475569; line-height: 1.45; margin-bottom: 1rem;">
                        ${r.lead}
                    </p>
                    <a href="${r.route_url}" target="_blank" class="btn btn-primary" style="width: 100%; justify-content: center;">
                        <span class="iconify" data-icon="material-symbols:play-arrow"></span>
                        <span>Avaa tarinareitti</span>
                    </a>
                </div>
            </div>
        `).join('');
    }

    function initSearch() {
        const searchInput = document.getElementById('area-quick-search');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const term = (e.target.value || '').toLowerCase().trim();
            if (!term) {
                renderMunicipalities();
                return;
            }

            const cards = document.querySelectorAll('.area-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    // Globaalit apufunktiot HTML-onclickeille
    window.resetAreaFilter = function () {
        applyFilter('all', true);
    };

    window.focusMunicipalityMap = function (slug) {
        if (!leafletMap || !areasData) return;
        const mun = areasData.municipalities.find(m => m.slug === slug);
        if (mun && mun.center) {
            leafletMap.flyTo(mun.center, mun.zoom || 11, { duration: 0.8 });
            const mapEl = document.getElementById('areas-map-section');
            if (mapEl) {
                mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    function getFallbackAreasData() {
        return {
            meta: { title: "Keski-Suomi & Seutu" },
            municipalities: [
                {
                    slug: "laukaa",
                    name: "Laukaa",
                    region_id: "jyvaskylan-seutu",
                    badge: "Pääportaali",
                    tagline: "Koskien, kylien ja elämysten Laukaa",
                    description: "Peurungan kylpylä- ja harjumaisemat, Kuusaankosken kuohut ja aktiiviset taajamat.",
                    image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80",
                    portal_url: "/index.html",
                    center: [62.413, 25.952],
                    zoom: 11
                },
                {
                    slug: "hankasalmi",
                    name: "Hankasalmi",
                    region_id: "jyvaskylan-seutu",
                    badge: "Seutukohde",
                    tagline: "Perinnekulttuuria ja järviluontoa 9-tien varrella",
                    description: "Kirkonkylä, Asemanseudun puukoulut, Revontuli Resort ja Häkärinteet.",
                    image: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80",
                    portal_url: "/tapahtumakartta.html?kunta=hankasalmi",
                    center: [62.392, 26.439],
                    zoom: 11
                },
                {
                    slug: "jyvaskyla",
                    name: "Jyväskylä",
                    region_id: "jyvaskylan-seutu",
                    badge: "Kohteet & Reitit",
                    tagline: "Kankaan tarinareitit ja kaupunkikulttuuri",
                    description: "Tourujoen kuohut, Kankaan vanha paperitehdas ja Alvar Aallon arkkitehtuuri.",
                    image: "https://images.unsplash.com/photo-1477959858617-67f30bc75b82?auto=format&fit=crop&w=800&q=80",
                    portal_url: "/reitti.html?id=c4f8662a-bf2e-4f06-839c-03e639f0f349",
                    center: [62.242, 25.747],
                    zoom: 12
                }
            ],
            curated_routes: [],
            map_spots: []
        };
    }
})();

