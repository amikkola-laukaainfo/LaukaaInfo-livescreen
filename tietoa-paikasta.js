document.addEventListener('DOMContentLoaded', async () => {
    // 1. Hae ID URL:sta
    const urlParams = new URLSearchParams(window.location.search);
    let placeId = urlParams.get('id');
    const placeNameParam = urlParams.get('name');

    if (!placeId && !placeNameParam) {
        showError();
        return;
    }

    try {
        const AI_SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
        const AI_SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
        window.aiSb = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);
        const aiSb = window.aiSb;

        // 2. Hae paikan tiedot Supabasesta
        let placeQuery = aiSb.from('places').select('*');
        
        if (placeId) {
            placeQuery = placeQuery.eq('place_id', placeId);
        } else if (placeNameParam) {
            const decodedName = decodeURIComponent(placeNameParam).replace(/_/g, ' ');
            placeQuery = placeQuery.or(`name.ilike.${decodedName},canonical_name.ilike.${decodedName}`);
        }
        
        const { data: placesData, error: placeError } = await placeQuery.limit(1);

        if (placeError || !placesData || placesData.length === 0) {
            console.error('Virhe haettaessa paikkaa:', placeError);
            showError();
            return;
        }
        
        const placeData = placesData[0];
        
        // Ensure placeId is set for the rest of the logic if we searched by name
        if (!placeId) {
            placeId = placeData.place_id;
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
        loadLostItemsForPlace(placeData);

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
    
    const statCompanies = document.getElementById('stat-companies');
    if (statCompanies) statCompanies.textContent = companies.length;
    
    const statObservations = document.getElementById('stat-observations');
    if (statObservations) statObservations.textContent = others.length;

    // Teemat / Liittyy teemoihin
    const themesSection = document.getElementById('themes-section');
    const themesList = document.getElementById('network-tags-list');
    if (themesSection && themesList) {
        const uniqueThemes = new Set();
        if (place.type) uniqueThemes.add(getTypeLabel(place.type));
        relatedItems.forEach(i => {
            if (i.type && i.type !== 'observation' && i.type !== 'other') {
                uniqueThemes.add(getTypeLabel(i.type));
            }
        });
        
        const themesArray = Array.from(uniqueThemes);
        if (themesArray.length > 0) {
            themesSection.style.display = 'block';
            themesList.innerHTML = themesArray.map(t => `<span class="network-tag"><span class="iconify" data-icon="material-symbols:tag"></span> ${t}</span>`).join('');
        } else {
            themesSection.style.display = 'none';
        }
    }

    // Aikajana (Havainnot)
    const timelineSection = document.getElementById('timeline-section');
    const timelineList = document.getElementById('timeline-list');
    if (timelineSection && timelineList) {
        const observations = others.filter(i => i.type === 'observation' || i.type === 'other' || !i.type);
        if (observations.length > 0) {
            timelineSection.style.display = 'block';
            timelineList.innerHTML = observations.map((obs) => {
                const label = obs.name || 'Havainto';
                const desc = obs.shortDescription || '';
                return `<div class="timeline-item">
                            <div class="time-label">${label}</div>
                            <div class="time-event">
                                <span class="iconify" data-icon="material-symbols:info" style="color: #3b82f6; font-size: 1.5rem;"></span> 
                                ${desc}
                            </div>
                        </div>`;
            }).join('');
        } else {
            timelineSection.style.display = 'none';
        }
    }

    // Verkostoyhteydet
    renderRelations(relatedItems);

    // Kartta ja sijaintinapit
    if (place.lat && place.lon) {
        document.getElementById('map-section').style.display = 'block';
        initMap(place.lat, place.lon, place.canonical_name || place.name);
        
        const routeBtn = document.getElementById('btn-route');
        if (routeBtn) {
            routeBtn.setAttribute('onclick', `window.open('https://maps.google.com/?q=${place.lat},${place.lon}', '_blank')`);
        }
        
        const svBtn = document.getElementById('btn-streetview');
        if (svBtn) {
            svBtn.style.display = 'inline-flex';
            svBtn.setAttribute('onclick', `window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${place.lat},${place.lon}', '_blank')`);
        }
    }
    
    // Jakolinkki-toiminnallisuus
    const shareBtn = document.getElementById('share-place-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Luo nimestä tehty jakolinkki
            const rawName = place.canonical_name || place.name || place.place_id;
            const safeName = encodeURIComponent(rawName.replace(/\s+/g, '_'));
            
            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}?name=${safeName}`;
            
            navigator.clipboard.writeText(shareUrl).then(() => {
                const originalHtml = shareBtn.innerHTML;
                shareBtn.innerHTML = '<span class="iconify" data-icon="material-symbols:check" style="font-size: 1rem;"></span> Linkki kopioitu!';
                shareBtn.style.color = '#059669';
                shareBtn.style.borderColor = '#059669';
                
                setTimeout(() => {
                    shareBtn.innerHTML = originalHtml;
                    shareBtn.style.color = '';
                    shareBtn.style.borderColor = '';
                }, 3000);
            }).catch(err => {
                console.error('Kopiointi epäonnistui:', err);
                alert('Jakolinkki: ' + shareUrl);
            });
        });
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
        container.innerHTML = `<div style="text-align:center; color: var(--light-text); padding: 3rem; border: 2px dashed #e5e7eb; border-radius: var(--inner-radius); background: #f9fafb;">
            <span class="iconify" data-icon="material-symbols:link-off" style="font-size: 2.5rem; color: #d1d5db;"></span>
            <p style="margin-top: 1rem; font-weight: 500;">Ei kohteita tähän paikkaan liitettynä.</p></div>`;
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
        <a href="${linkUrl}" class="list-item-card">
            <div class="list-icon-wrapper">
                <span class="iconify list-icon" data-icon="${iconName}"></span>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-weight: 700; font-size: 1.05rem; color: var(--dark-text);">${displayName}</span>
                    <span style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.8rem; border-radius: 50px; background: #dcfce7; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">${typeLabel}</span>
                </div>
                ${item.shortDescription ? `<div style="font-size: 0.95rem; color: var(--light-text); margin-top: 0.5rem; line-height: 1.5;">${item.shortDescription}</div>` : ''}
            </div>
        </a>`;
    }).join('');
}

function initMap(lat, lon, name) {
    // Odotetaan hieman jotta display: block ehtii vaikuttaa map-containeriin
    setTimeout(() => {
        if (window.placeMap) { window.placeMap.remove(); }
        window.placeMap = L.map('map').setView([lat, lon], 14);
        const map = window.placeMap;
        
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
            query = query.or(`location_id.eq.${place.place_id},location.ilike."*${placeName}*"`);
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
                            url: 'tapahtumakortti.html?id=' + item.id,
                            created_at: item.created_at
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
                            url: 'yrityskortti.html?id=' + item.business_id,
                            created_at: item.created_at
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
                            url: 'tarjouskortti.html?id=' + item.id,
                            created_at: item.created_at
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
    
    const offers = validEncounters.filter(e => e.type === 'offer');
    const activeAlerts = validEncounters.filter(e => e.type !== 'offer');
    
    const statEncounters = document.getElementById('stat-encounters');
    if (statEncounters) statEncounters.textContent = activeAlerts.length;
    
    const statOffers = document.getElementById('stat-offers');
    if (statOffers) statOffers.textContent = offers.length;
    
    // Tarkistetaan aktiivisuus viikon sisällä
    const statusEl = document.getElementById('place-activity-status');
    const dotEl = document.getElementById('activity-dot');
    const textEl = document.getElementById('place-activity-text');
    
    if (statusEl && textEl && validEncounters.length > 0) {
        const latestDate = validEncounters.reduce((max, e) => {
            if (!e.created_at) return max;
            const d = new Date(e.created_at);
            return d > max ? d : max;
        }, new Date(0));
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (latestDate > sevenDaysAgo) {
            statusEl.style.display = 'flex';
            if (dotEl) dotEl.style.display = 'inline';
            textEl.textContent = 'Päivitetty hiljattain';
        }
    }
    
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
        
        html += `<div style="margin-bottom: 1.5rem; border: 1px solid #f3f4f6; border-radius: var(--inner-radius); overflow: hidden; background: var(--card-bg);">
            <div style="padding: 1.25rem; background: #f9fafb; font-weight: 700; color: var(--dark-text); border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                <span style="background: var(--bg-color); color: var(--light-text); padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${items.length} kpl</span>
            </div>
            <div style="padding: 0;">`;
            
        items.forEach((item, index) => {
            const isLast = index === items.length - 1;
            const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';
            const priceHtml = item.price_info ? `<span style="font-weight: 700; color: var(--primary-hover); font-size: 0.95rem; background: #f0fdf4; padding: 0.4rem 0.8rem; border-radius: 50px;">${item.price_info}</span>` : '';
            const linkUrl = item.url || `ilmoituskortti.html?id=${item.id}`;
            
            html += `<a href="${linkUrl}" style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <div>
                        <div style="font-weight: 700; color: var(--dark-text); font-size: 1.05rem; margin-bottom: 0.4rem;">${item.title}</div>
                        <div style="font-size: 0.95rem; color: var(--light-text); line-height: 1.5;">${(item.description || '').substring(0, 100)}${(item.description && item.description.length > 100) ? '...' : ''}</div>
                    </div>
                    ${priceHtml}
                </div>
            </a>`;
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

// ==========================================================
// LOSTNFOUND: FIREBASE FIRESTORE -HAU (kadonneet/löydetyt)
// ==========================================================
async function loadLostItemsForPlace(place) {
    if (!place.place_id) return;
    
    try {
        // Firebase SDK ladataan dynaamisesti jos ei vielä ladattu
        if (!window.firebase) {
            await Promise.all([
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
                loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js')
            ]);
        }
        
        // Alusta Firebase jos ei vielä alustettu
        if (!window._lfApp) {
            window._lfApp = firebase.initializeApp({
                apiKey: 'AIzaSyA6l0FosuiXh9KxFfD5Q92BCP1EWbH8LN4',
                authDomain: 'lostnfound-f0d25.firebaseapp.com',
                projectId: 'lostnfound-f0d25',
            }, 'lostnfound');
        }
        
        const db = firebase.firestore(window._lfApp);
        
        // Hae kyseisen paikan ilmoitukset placeId-kentällä (ilman status-kyselyä indeksien välttämiseksi)
        const snapshot = await db.collection('lostItems')
            .where('placeId', '==', place.place_id)
            .limit(50)
            .get();
        
        if (snapshot.empty) return;
        
        // Suodata aktiiviset paikallisesti
        const activeDocs = snapshot.docs.filter(doc => {
            const status = doc.data().status;
            return status === 'ACTIVE' || status === 'active';
        });
        
        if (activeDocs.length === 0) return;
        
        const lostItems = activeDocs.map(doc => {
            const d = doc.data();
            const isLost = d.category === 'LOST' || d.category === 'lost';
            return {
                id: doc.id,
                type: 'lost_and_found',
                title: (isLost ? '🔍 Kadonnut: ' : '📦 Löytynyt: ') + (d.title || 'Ilmoitus'),
                description: d.description || '',
                created_at: d.timestamp?.toDate?.()?.toISOString() || null,
                url: `https://lostnfound-f0d25.web.app/item/${doc.id}`
            };
        });
        
        // Lisätään löydetyt/kadonneet olemassa olevaan encounters-listaan
        const container = document.getElementById('encounters-list');
        const section = document.getElementById('encounters-section');
        if (!container || lostItems.length === 0) return;
        
        section.style.display = 'block';
        
        const icon = '🔍';
        const label = 'Kadonnut & Löydetty (Lostnfound)';
        
        let html = `<div style="margin-bottom: 1.5rem; border: 1px solid #fde68a; border-radius: var(--inner-radius); overflow: hidden; background: #fffbeb;">
            <div style="padding: 1.25rem; background: #fef9c3; font-weight: 700; color: #92400e; border-bottom: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">${icon} ${label}</span>
                <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 50px; font-size: 0.85rem;">${lostItems.length} kpl</span>
            </div>
            <div>`;
        
        lostItems.forEach((item, index) => {
            const isLast = index === lostItems.length - 1;
            const border = isLast ? '' : 'border-bottom: 1px solid #fde68a;';
            html += `<a href="${item.url}" target="_blank" rel="noopener noreferrer" 
                style="display: block; padding: 1.25rem; text-decoration: none; color: inherit; ${border} transition: background 0.2s;" 
                onmouseover="this.style.background='#fef9c3'" onmouseout="this.style.background='transparent'">
                <div style="font-weight: 700; color: #1e293b; font-size: 1rem; margin-bottom: 0.3rem;">${item.title}</div>
                <div style="font-size: 0.9rem; color: #64748b; line-height: 1.5;">${(item.description || '').substring(0, 120)}${item.description && item.description.length > 120 ? '...' : ''}</div>
            </a>`;
        });
        
        html += `</div></div>`;
        container.insertAdjacentHTML('beforeend', html);
        
        // Päivitetään myös tilastolaskuri
        const statEncounters = document.getElementById('stat-encounters');
        if (statEncounters) {
            const current = parseInt(statEncounters.textContent) || 0;
            statEncounters.textContent = current + lostItems.length;
        }
        
    } catch (err) {
        console.warn('Lostnfound-haku epäonnistui:', err);
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
