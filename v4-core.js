/**
 * LaukaaInfo V4 Core Logic
 * Handles global search, active theme rendering, and cross-entity navigation.
 */

const SUPABASE_REST_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co/rest/v1';
const SUPABASE_API_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

let v4ActiveThemesCache = [];
let v4PlacesCache = [];

document.addEventListener('DOMContentLoaded', () => {
    initV4Homepage();
    initV4PlaceDetail();
});

async function initV4PlaceDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const placeId = urlParams.get('place') || urlParams.get('id');
    if (!placeId) return;

    // Haetaan paikan teemat (place_tags) ja renderöidään ne näkökulmina
    await loadV4PlaceThemes(placeId);
}

async function initV4Homepage() {
    // 1. Haetaan aktiiviset teemat laskureineen
    await loadV4Themes();

    // 2. Esiladataan paikat hakuongelmien välttämiseksi
    loadV4Places();

    // 3. Alustetaan yleishaku
    setupV4GlobalSearch();
}

/**
 * Haetaan teemat Supabasen RPC-funktiolla get_active_themes_with_counts
 */
async function loadV4Themes() {
    const container = document.getElementById('v4-themes-list');
    if (!container) return;

    try {
        const response = await fetch(`${SUPABASE_REST_URL}/rpc/get_active_themes_with_counts`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // Yritetään GET-menetelmällä jos POST epäonnistuu
            const getResp = await fetch(`${SUPABASE_REST_URL}/rpc/get_active_themes_with_counts`, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`
                }
            });
            if (getResp.ok) {
                v4ActiveThemesCache = await getResp.json();
            }
        } else {
            v4ActiveThemesCache = await response.json();
        }
    } catch (err) {
        console.error('[V4] Virhe teemojen haussa:', err);
    }

    renderV4Themes(container);
}

function renderV4Themes(container) {
    if (!container) return;

    // Näytetään etusivulla vain näkökulmat, joilla on sisältöä (places, media tai observations > 0)
    const activeOnly = v4ActiveThemesCache.filter(t => 
        (parseInt(t.places_count) || 0) > 0 || 
        (parseInt(t.media_count) || 0) > 0 || 
        (parseInt(t.observations_count) || 0) > 0
    ).slice(0, 12); // TOP 12 etusivulle

    if (activeOnly.length === 0) {
        container.innerHTML = `<p style="color: #64748b; font-size: 0.95rem;">Näkökulmia ladataan tai niitä ei löydy.</p>`;
        return;
    }

    container.innerHTML = activeOnly.map(t => {
        const pCount = parseInt(t.places_count) || 0;
        const mCount = parseInt(t.media_count) || 0;
        const oCount = parseInt(t.observations_count) || 0;

        return `
            <a href="teema.html?tag=${encodeURIComponent(t.tag_id)}" 
               style="display: block; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; text-decoration: none; color: inherit; transition: all 0.2s;"
               onmouseover="this.style.borderColor='#3b82f6'; this.style.transform='translateY(-2px)';"
               onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='none';">
                <div style="font-weight: 700; font-size: 1.05rem; color: #0a2540; margin-bottom: 0.3rem;">
                    🌲 ${t.name}
                </div>
                <div style="font-size: 0.85rem; color: #64748b;">
                    📍 ${pCount} paikkaa · 📷 ${mCount} mediaa ${oCount > 0 ? `· 👀 ${oCount} havaintoa` : ''}
                </div>
            </a>
        `;
    }).join('');
}

async function loadV4Places() {
    try {
        const resp = await fetch(`${SUPABASE_REST_URL}/places?select=*&status=eq.ACTIVE`, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`
            }
        });
        if (resp.ok) {
            v4PlacesCache = await resp.json();
        }
    } catch (e) {
        console.warn('[V4] Paikkojen esilataus epäonnistui:', e);
    }
}

/**
 * Yleishaku (lennosta avautuva pudotusvalikko)
 */
function setupV4GlobalSearch() {
    const input = document.getElementById('v4-global-search');
    const dropdown = document.getElementById('v4-search-dropdown');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        if (query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        performV4Search(query, dropdown);
    });

    // Suljetaan kun klikataan muualle
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2) {
            dropdown.style.display = 'block';
        }
    });
}

function performV4Search(query, dropdown) {
    // 1. Näkökulmat / Teemat
    const matchedThemes = v4ActiveThemesCache.filter(t => 
        t.name.toLowerCase().includes(query) || t.tag_id.toLowerCase().includes(query)
    ).slice(0, 4);

    // 2. Paikat
    const matchedPlaces = v4PlacesCache.filter(p =>
        (p.name || '').toLowerCase().includes(query) || (p.type || '').toLowerCase().includes(query)
    ).slice(0, 4);

    // 3. Palvelut / Yritykset
    const allComp = window.allCompanies || [];
    const matchedCompanies = allComp.filter(c =>
        (c.nimi || '').toLowerCase().includes(query) ||
        (c.kategoria || '').toLowerCase().includes(query) ||
        (c.tags || '').toLowerCase().includes(query)
    ).slice(0, 4);

    let html = '';

    // Näkökulmat
    if (matchedThemes.length > 0) {
        html += `<div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; margin-top: 0.25rem;">🌲 NÄKÖKULMAT</div>`;
        matchedThemes.forEach(t => {
            html += `
                <a href="teema.html?tag=${encodeURIComponent(t.tag_id)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-radius: 6px; text-decoration: none; color: #0f172a;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                    <span style="font-weight: 600;">${t.name}</span>
                    <span style="font-size: 0.8rem; color: #64748b;">📍 ${t.places_count || 0}</span>
                </a>
            `;
        });
    }

    // Paikat
    if (matchedPlaces.length > 0) {
        html += `<div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.75rem; margin-bottom: 0.5rem;">📍 PAIKAT</div>`;
        matchedPlaces.forEach(p => {
            html += `
                <a href="tietoa-paikasta.html?place=${encodeURIComponent(p.place_id)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-radius: 6px; text-decoration: none; color: #0f172a;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                    <span style="font-weight: 600;">${p.name}</span>
                    <span style="font-size: 0.8rem; color: #047857; background: #d1fae5; padding: 2px 6px; border-radius: 4px;">${p.type || 'Paikka'}</span>
                </a>
            `;
        });
    }

    // Palvelut / Yritykset
    if (matchedCompanies.length > 0) {
        html += `<div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.75rem; margin-bottom: 0.5rem;">🛠 PALVELUT</div>`;
        matchedCompanies.forEach(c => {
            const slug = (c.nimi || '').toLowerCase().trim().replace(/\s+/g, '-');
            html += `
                <a href="yrityskortti.html?id=${encodeURIComponent(slug)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-radius: 6px; text-decoration: none; color: #0f172a;" onmouseover="this.style.background='#f1f5f9';" onmouseout="this.style.background='transparent';">
                    <span style="font-weight: 600;">${c.nimi}</span>
                    <span style="font-size: 0.8rem; color: #1e40af; background: #dbeafe; padding: 2px 6px; border-radius: 4px;">${c.kategoria || 'Palvelu'}</span>
                </a>
            `;
        });
    }

    if (matchedThemes.length === 0 && matchedPlaces.length === 0 && matchedCompanies.length === 0) {
        html = `<div style="padding: 0.75rem; color: #94a3b8; font-size: 0.9rem;">Ei hakutuloksia hakusanalla "${query}"</div>`;
    } else {
        html += `
            <div style="border-top: 1px solid #e2e8f0; padding-top: 0.5rem; margin-top: 0.75rem; text-align: right;">
                <a href="asiahaku.html?q=${encodeURIComponent(query)}" style="color: #3b82f6; font-size: 0.9rem; font-weight: 700; text-decoration: none;">
                    Näytä kaikki hakutulokset →
                </a>
            </div>
        `;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

/**
 * Haetaan tietyn paikan teemat (place_tags) ja esitetään ne "Tutustu paikkaan näkökulmista" -pillereinä.
 */
async function loadV4PlaceThemes(placeId) {
    // Etsitään tai luodaan osio paikkasivulta
    let container = document.getElementById('v4-place-themes-container');
    if (!container) {
        // Etsitään paikkasivulta paikan kuvaus tai intro-osio johon lisätä teemat
        const mainContent = document.querySelector('.hero-left') || document.querySelector('.page-container');
        if (!mainContent) return;

        const section = document.createElement('div');
        section.id = 'v4-place-themes-section';
        section.style.marginTop = '1rem';
        section.style.marginBottom = '1.5rem';
        section.innerHTML = `
            <div style="font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">
                TÄHÄN PAIKKAAN LIITTYVÄT NÄKÖKULMAT
            </div>
            <div id="v4-place-themes-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">Ladataan näkökulmia...</span>
            </div>
        `;
        mainContent.appendChild(section);
        container = document.getElementById('v4-place-themes-container');
    }

    try {
        const resp = await fetch(`${SUPABASE_REST_URL}/place_tags?select=tag_id,tags(name)&place_id=eq.${encodeURIComponent(placeId)}`, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`
            }
        });

        if (!resp.ok) return;

        const data = await resp.json();
        if (!data || data.length === 0) {
            container.parentElement.style.display = 'none';
            return;
        }

        container.innerHTML = data.map(item => {
            const tagName = item.tags?.name || item.tag_id;
            return `
                <a href="teema.html?tag=${encodeURIComponent(item.tag_id)}" 
                   style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.9rem; background: rgba(255,255,255,0.2); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.3); border-radius: 50px; color: white; font-weight: 600; font-size: 0.85rem; text-decoration: none; transition: all 0.2s;"
                   onmouseover="this.style.background='rgba(255,255,255,0.35)';"
                   onmouseout="this.style.background='rgba(255,255,255,0.2)';">
                    🌲 ${tagName}
                </a>
            `;
        }).join('');
    } catch (e) {
        console.warn('[V4] Virhe paikan teemojen haussa:', e);
    }
}

