document.addEventListener('DOMContentLoaded', async () => {
    // 1. Hae ID URL:sta
    const urlParams = new URLSearchParams(window.location.search);
    const placeId = urlParams.get('id');

    if (!placeId) {
        showError();
        return;
    }

    try {
        const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
        const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
        window.aiSb = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);
        const aiSb = window.aiSb;

        // 2. Hae paikan tiedot Supabasesta
        const { data: placeData, error: placeError } = await aiSb
            .from('places')
            .select('*')
            .eq('place_id', placeId)
            .single();

        if (placeError || !placeData) {
            console.error('Virhe haettaessa paikkaa:', placeError);
            showError();
            return;
        }

        // 3. Hae kohteet ja tarjoukset JSON-tiedostoista
        const cacheBuster = new Date().getTime();
        let kohteet = [];
        let tarjoukset = [];
        try {
            const kohteetRes = await fetch('kohdekortit/kohteet.json?v=' + cacheBuster);
            if (kohteetRes.ok) kohteet = await kohteetRes.json();
            
            const tarjouksetRes = await fetch('kohdekortit/tarjoukset.json?v=' + cacheBuster);
            if (tarjouksetRes.ok) tarjoukset = await tarjouksetRes.json();
        } catch (e) {
            console.error('Virhe JSONien latauksessa:', e);
        }
        
        // 4. Hae relaatiot Supabasesta (esim. mobiiliappin havainnot tai yritykset)
        const { data: relationsData, error: relationsError } = await aiSb
            .from('place_relations')
            .select('entity_id, entity_type, entity_name, relation_type, relation_context, strength')
            .eq('place_id', placeId);

        // 5. Yhdistä tiedot poistaen duplikaatit
        const allItemsMap = new Map();
        
        // Lisätään JSONeista löytyneet
        [...kohteet, ...tarjoukset].forEach(item => {
            if (item.place_id === placeId) {
                allItemsMap.set(String(item.id), item);
            }
        });
        
        // Lisätään Supabasesta löytyneet, jos niitä ei vielä ole
        if (!relationsError && relationsData) {
            relationsData.forEach(r => {
                const eId = String(r.entity_id);
                if (!allItemsMap.has(eId)) {
                    let mappedType = (r.entity_type || 'other').toLowerCase();
                    if (mappedType === 'company') mappedType = 'business';
                    
                    allItemsMap.set(eId, {
                        id: eId,
                        type: mappedType,
                        name: r.entity_name || (mappedType === 'observation' ? 'Havainto' : eId),
                        shortDescription: r.relation_context || r.relation_type
                    });
                }
            });
        }
        
        const relatedItems = Array.from(allItemsMap.values());

        // 4. Päivitä DOM
        renderPlace(placeData, relatedItems);
        loadEncountersForPlace(placeData);

    } catch (err) {
        console.error('Yllättävä virhe:', err);
        showError();
    }
});

function showError() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'block';
}

function renderPlace(place, relatedItems) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('place-content').style.display = 'block';

    // Perustiedot
    document.getElementById('place-name').textContent = place.canonical_name || place.name || 'Nimetön paikka';
    document.getElementById('place-type').textContent = getTypeLabel(place.type);
    document.getElementById('place-municipality').textContent = place.municipality || 'Laukaa';
    
    // Kuvaus (V2)
    if (place.description) {
        document.getElementById('display-description').innerHTML = `<p>${place.description}</p>`;
    } else {
        document.getElementById('display-description').innerHTML = 
            `Tämä on <strong>${place.canonical_name || place.name}</strong>, joka on tyypiltään ${getTypeLabel(place.type).toLowerCase()}. ` +
            `Sijaintina on ${place.municipality}. <br><br>` + 
            `<em>Tekoälyn generoima kuvaus tälle paikalle lisätään myöhemmässä vaiheessa.</em>`;
    }

    // Tilastot
    const companies = relatedItems.filter(i => i.type === 'business' || i.type === 'association' || i.type === 'service');
    const others = relatedItems.filter(i => i.type !== 'business' && i.type !== 'association' && i.type !== 'service');
    document.getElementById('stat-companies').textContent = companies.length;
    document.getElementById('stat-observations').textContent = others.length;

    // Verkostoyhteydet
    renderRelations(relatedItems);

    // Kartta
    if (place.lat && place.lon) {
        document.getElementById('map-section').style.display = 'block';
        initMap(place.lat, place.lon, place.canonical_name || place.name);
    }
}

const TYPE_LABELS = {
    'business': 'Yritys',
    'service': 'Palvelu',
    'association': 'Yhdistys',
    'event': 'Tapahtuma',
    'offer': 'Tarjous',
    'product': 'Tuote'
};

function renderRelations(items) {
    const container = document.getElementById('companies-list');
    if (!container) return;
    
    const sectionTitle = container.parentElement.querySelector('h2');
    if (sectionTitle) {
        sectionTitle.innerHTML = `<span class="iconify" data-icon="material-symbols:account-tree-outline" style="color: #059669;"></span> Kohteet ja Tarjoukset (${items.length})`;
    }

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; color: #94a3b8; padding: 2rem; border: 2px dashed #e2e8f0; border-radius: 16px;">
            <span class="iconify" data-icon="material-symbols:link-off" style="font-size: 2rem;"></span>
            <p style="margin-top: 0.5rem;">Ei kohteita tähän paikkaan liitettynä.</p></div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const typeLabel = TYPE_LABELS[item.type] || item.type;
        
        let iconName = 'material-symbols:storefront-outline';
        if (item.type === 'event') iconName = 'material-symbols:event-outline';
        else if (item.type === 'offer') iconName = 'material-symbols:local-offer-outline';
        else if (item.type === 'association') iconName = 'material-symbols:groups-outline';
        
        const displayName = item.name || item.id;
        let linkUrl = '?id=' + item.id;
        if (item.id.startsWith('yritys_') || item.type === 'business') {
            linkUrl = 'yrityskortti.html?id=' + item.id;
        } else if (item.type === 'observation') {
            linkUrl = 'ilmoituskortti.html?id=' + item.id;
        } else {
            linkUrl = 'kohdekortti.html?id=' + item.id;
        }

        return `
        <a href="${linkUrl}" style="text-decoration:none; color:inherit; display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 0.75rem; transition: background 0.2s;">
            <div style="flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; background: #0596691a; display: flex; align-items: center; justify-content: center;">
                <span class="iconify" data-icon="${iconName}" style="font-size: 1.5rem; color: #059669;"></span>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-weight: 700; font-size: 1rem; color: #1a202c;">${displayName}</span>
                    <span style="font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 50px; background: #0596691a; color: #059669; text-transform: uppercase; letter-spacing: 0.5px;">${typeLabel}</span>
                </div>
                ${item.shortDescription ? `<div style="font-size: 0.9rem; color: #64748b; margin-top: 0.4rem; line-height: 1.5;">${item.shortDescription}</div>` : ''}
            </div>
        </a>`;
    }).join('');
}

function initMap(lat, lon, name) {
    // Odotetaan hieman jotta display: block ehtii vaikuttaa map-containeriin
    setTimeout(() => {
        const map = L.map('map').setView([lat, lon], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        L.marker([lat, lon]).addTo(map).bindPopup(`<b>${name}</b>`).openPopup();
    }, 100);
}

function getTypeLabel(type) {
    const types = {
        'NATURE': 'Luontokohde',
        'LANDMARK': 'Nähtävyys',
        'SERVICE': 'Palvelukeskittymä',
        'BUILDING': 'Rakennus',
        'AREA': 'Alue',
        'ROUTE': 'Reitti'
    };
    return types[type] || type || 'Paikka';
}

// ==========================================================
// PAIKAN ILMOITUKSET (ENCOUNTERS)
// ==========================================================
async function loadEncountersForPlace(place) {
    if (!window.LaukaaSupabase) {
        console.warn('LaukaaSupabase (kohtaamiset) ei saatavilla. Varmista että supabase-config.js on ladattu.');
        return;
    }
    
    try {
        // Hakee ilmoitukset jotka on linkitetty location_id:llä tai joilla on sama nimi (fallback)
        const placeName = place.canonical_name || place.name || '';
        
        let query = window.LaukaaSupabase
            .from('encounters')
            .select('*')
            .eq('status', 'active');
            
        // Jos haluamme kohdentaa tiukasti place_id:hen:
        // mutta otetaan fallback string matchillä myös
        if (place.place_id && placeName) {
            query = query.or(`location_id.eq.${place.place_id},location.ilike.%${placeName}%`);
        } else if (place.place_id) {
            query = query.eq('location_id', place.place_id);
        } else if (placeName) {
            query = query.ilike('location', `%${placeName}%`);
        }
            
        const { data, error } = await query;
        
        if (error) {
            console.error('Virhe encounters haussa:', error);
        }
        
        let allItems = data || [];
        
        // Hae myös tapahtumat, yritysjulkaisut ja tarjoukset
        if (window.aiSb && place.place_id) {
            try {
                // Contents-taulu (JSONB location->>place_id)
                const { data: contentsData } = await window.aiSb
                    .from('contents')
                    .select('*')
                    .eq('location->>place_id', place.place_id);
                
                // Yrityspostaukset
                const { data: postsData } = await window.aiSb
                    .from('company_posts')
                    .select('*')
                    .eq('place_id', place.place_id);
                    
                // Tarjoukset
                const { data: offersData } = await window.aiSb
                    .from('offers')
                    .select('*')
                    .eq('place_id', place.place_id);
                    
                if (contentsData) {
                    contentsData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: item.type === 'EVENT' ? 'event' : item.type === 'OFFER' ? 'offer' : 'content_other',
                            title: item.name,
                            description: item.description,
                            price_info: '',
                            expires_at: item.metadata?.endDate || null,
                            url: 'tapahtumakortti.html?id=' + item.id // Korjaa oikeaksi
                        });
                    });
                }
                
                if (postsData) {
                    postsData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: item.type === 'event' ? 'event' : 'feed_post',
                            title: item.title,
                            description: item.description,
                            price_info: '',
                            url: 'yrityskortti.html?id=' + item.business_id
                        });
                    });
                }
                
                if (offersData) {
                    offersData.forEach(item => {
                        allItems.push({
                            id: item.id,
                            type: 'offer',
                            title: item.name,
                            description: item.description,
                            price_info: item.discount_value ? '-' + item.discount_value + '%' : '',
                            expires_at: item.valid_until || null,
                            url: 'tarjouskortti.html?id=' + item.id // Korjaa oikeaksi
                        });
                    });
                }
            } catch (aiErr) {
                console.error("Virhe lisäsisällön haussa", aiErr);
            }
        }
        
        renderEncounters(allItems);
    } catch (e) {
        console.error('Yllättävä virhe encounters haussa:', e);
    }
}

function renderEncounters(encounters) {
    const section = document.getElementById('encounters-section');
    const container = document.getElementById('encounters-list');
    if (!section || !container) return;
    
    // Suodata pois vanhentuneet jos sellaista logiikkaa on
    const now = new Date();
    const validEncounters = encounters.filter(e => {
        if (e.expires_at) {
            return new Date(e.expires_at) > now;
        }
        return true;
    });
    
    if (validEncounters.length === 0) {
        // Piilotetaan osio jos ei ilmoituksia
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    // Ryhmittele tyypeittäin
    const grouped = {};
    validEncounters.forEach(e => {
        const t = e.type || 'other';
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(e);
    });
    
    // Mappaus nimille
    const typeLabels = {
        'service_request': 'Palvelutarpeet',
        'need_help': 'Tarvitsen palvelun',
        'sell': 'Myydään',
        'give': 'Annetaan',
        'search': 'Etsitään',
        'local_notice': 'Paikalliset ilmoitukset',
        'offer_service': 'Tarjoan palvelua',
        'work_and_gigs': 'Työ ja toimeksiannot',
        'community': 'Yhteisö',
        'space_rental': 'Tilat ja kalusto',
        'b2b_collab': 'Yhteistyöhaku',
        'event_staff': 'Tapahtumahaku',
        'high_value': 'Arvotavarat ja erikoiskohteet',
        'lost_and_found': 'Kadonnut tai löytynyt',
        'event': 'Tapahtumat',
        'offer': 'Tarjoukset',
        'feed_post': 'Yritysten ilmoitukset',
        'content_other': 'Muu sisältö',
        'other': 'Muut ilmoitukset'
    };
    
    const typeIcons = {
        'service_request': '🤝',
        'sell': '🛒',
        'give': '🎁',
        'search': '🔍',
        'local_notice': '📢',
        'event': '📅',
        'offer': '🏷️',
        'feed_post': '📰',
        'content_other': '📌'
    };
    
    let html = '';
    
    for (const [type, items] of Object.entries(grouped)) {
        const label = typeLabels[type] || type;
        const icon = typeIcons[type] || '📌';
        
        html += `<div style="margin-bottom: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff;">
            <div style="padding: 1rem; background: #f8fafc; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
                <span>${icon} ${label}</span>
                <span style="background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 20px; font-size: 0.85rem;">${items.length} kpl</span>
            </div>
            <div style="padding: 0;">`;
            
        items.forEach((item, index) => {
            const isLast = index === items.length - 1;
            const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f1f5f9;';
            const priceHtml = item.price_info ? `<span style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">${item.price_info}</span>` : '';
            const linkUrl = item.url || `ilmoituskortti.html?id=${item.id}`;
            
            html += `<a href="${linkUrl}" style="display: block; padding: 1rem; text-decoration: none; color: inherit; ${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <div>
                        <div style="font-weight: 600; color: #0056b3; margin-bottom: 0.25rem;">${item.title}</div>
                        <div style="font-size: 0.85rem; color: #64748b; line-height: 1.4;">${(item.description || '').substring(0, 100)}${(item.description && item.description.length > 100) ? '...' : ''}</div>
                    </div>
                    ${priceHtml}
                </div>
            </a>`;
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}
