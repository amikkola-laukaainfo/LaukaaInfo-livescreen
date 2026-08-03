// teema.js
// Kokoaa yhteen paikat, yritykset ja tapahtumat tietyn tägin (teeman) perusteella

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tagParam = urlParams.get('tag');

    if (!tagParam) {
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('error-message').style.display = 'flex';
        return;
    }

    const searchTag = tagParam.toLowerCase().trim();
    
    // Aseta hero-otsikko
    document.getElementById('theme-name').textContent = tagParam.charAt(0).toUpperCase() + tagParam.slice(1);
    
    // Aseta karttalinkki
    const mapBtn = document.getElementById('btn-map');
    if (mapBtn) {
        mapBtn.href = `karttakohteet.html?cat=${encodeURIComponent(tagParam)}`;
    }

    try {
        const cacheBuster = new Date().getTime();
        
        // Hae data JSON-tiedostoista (voit laajentaa hakemaan Supabasesta myös)
        const [placesRes, companiesRes] = await Promise.all([
            fetch('kohdekortit/kohteet.json?v=' + cacheBuster),
            fetch('live_companies.json?v=' + cacheBuster)
        ]);
        
        let allPlaces = [];
        let allCompanies = [];
        
        if (placesRes.ok) {
            const pData = await placesRes.json();
            allPlaces = Array.isArray(pData) ? pData : (pData.results || []);
        }
        if (companiesRes.ok) {
            const cData = await companiesRes.json();
            allCompanies = Array.isArray(cData) ? cData : (cData.results || []);
        }
        
        // Etsi Supabasesta paikkoja joilla voi olla tämä tag
        let sbPlaces = [];
        if (window.supabaseClient) {
            try {
                // Tässä voitaisiin hakea Supabasen paikoista
                // Esim. places -taulun description-kentästä tai omasta tag-taulusta.
                // Tehdään nyt haku pelkästään 'type' ja 'description' perusteella
                const { data, error } = await window.supabaseClient
                    .from('places')
                    .select('place_id, name, type, description, canonical_name');
                    
                if (!error && data) {
                    sbPlaces = data;
                }
            } catch(e) {
                console.error("Supabase places fetch error:", e);
            }
        }
        
        // 1. Suodata paikat
        // Kohteet.json
        const matchedPlaces = allPlaces.filter(p => {
            const tags = (p.tags || []).map(t => t.toLowerCase());
            const type = (p.type || '').toLowerCase();
            const desc = (p.description || '').toLowerCase();
            return tags.includes(searchTag) || type.includes(searchTag) || desc.includes(searchTag);
        });
        
        // Supabase places (lisätään jos täsmää)
        sbPlaces.forEach(p => {
            const type = (p.type || '').toLowerCase();
            const desc = (p.description || '').toLowerCase();
            if (type.includes(searchTag) || desc.includes(searchTag)) {
                // Lisätään vain jos ei ole jo mukana
                if (!matchedPlaces.find(existing => existing.id === p.place_id)) {
                    matchedPlaces.push({
                        id: p.place_id,
                        name: p.name || p.canonical_name,
                        type: p.type,
                        description: p.description,
                        isSupabase: true
                    });
                }
            }
        });
        
        // 2. Suodata yritykset
        const matchedCompanies = allCompanies.filter(c => {
            const tags = (c.tags || '').toLowerCase();
            const pvtapa = (c.palvelutapa || '').toLowerCase();
            const kat = (c.kategoria || '').toLowerCase();
            const nimi = (c.nimi || '').toLowerCase();
            
            return tags.includes(searchTag) || 
                   pvtapa.includes(searchTag) || 
                   kat.includes(searchTag) || 
                   nimi.includes(searchTag);
        });
        
        // Renderöi Paikat
        const placesContainer = document.getElementById('places-list');
        if (matchedPlaces.length === 0) {
            placesContainer.innerHTML = '<p style="color: var(--text-muted);">Ei paikkoja tällä teemalla.</p>';
        } else {
            placesContainer.innerHTML = matchedPlaces.map(p => {
                const url = `tietoa-paikasta.html?id=${encodeURIComponent(p.id)}`;
                const typeName = p.type || 'Paikka';
                const desc = p.description ? p.description.substring(0, 100) + '...' : '';
                
                return `
                    <a href="${url}" class="list-item-card">
                        <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 0.5rem;">📍 ${typeName}</div>
                        <h3 style="margin: 0 0 0.5rem 0; font-family: Outfit, sans-serif; font-size: 1.25rem; color: var(--text-main);">${p.name}</h3>
                        <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted);">${desc}</p>
                    </a>
                `;
            }).join('');
        }
        
        // Renderöi Yritykset
        const companiesContainer = document.getElementById('companies-list');
        if (matchedCompanies.length === 0) {
            companiesContainer.innerHTML = '<p style="color: var(--text-muted);">Ei palveluita tällä teemalla.</p>';
        } else {
            companiesContainer.innerHTML = matchedCompanies.map(c => {
                const url = `yrityskortti.html?id=${encodeURIComponent(c.id)}`;
                const rawTags = (c.tags || '').split(',').map(t => t.trim()).filter(t => t.length > 0 && t !== '-');
                const tagHtml = rawTags.slice(0, 3).map(t => `<span class="tag-pill">${t}</span>`).join('');
                
                return `
                    <a href="${url}" class="list-item-card">
                        <div class="card-header-grid">
                            <div>
                                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${c.nimi}</h3>
                                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">${c.kategoria || ''}</div>
                                <div>${tagHtml}</div>
                            </div>
                        </div>
                    </a>
                `;
            }).join('');
        }
        
        // Renderöi Tapahtumat (tähän voi myöhemmin lisätä haun tapahtumat.json tai Supabasesta)
        const eventsContainer = document.getElementById('events-list');
        eventsContainer.innerHTML = '<p style="color: var(--text-muted);">Tapahtumia ei löytynyt.</p>';
        
        // Näytä sisältö
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('theme-content').style.display = 'block';
        
    } catch (e) {
        console.error("Virhe ladattaessa teemadataa:", e);
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('error-message').style.display = 'flex';
    }
});
