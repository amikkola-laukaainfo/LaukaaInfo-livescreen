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
            const safeNameValue = decodedName.replace(/"/g, '');
            placeQuery = placeQuery.or(`name.ilike."${safeNameValue}",canonical_name.ilike."${safeNameValue}"`);
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

        // 2.5. Hae AI-profilointidata (summary, themes, activities, faq)
        let aiProfileData = null;
        try {
            const { data: aiContentData, error: aiError } = await aiSb
                .from('organization_ai_content')
                .select('content')
                .eq('organization_id', placeId)
                .eq('content_type', 'place_profile')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!aiError && aiContentData && aiContentData.content) {
                try {
                    aiProfileData = JSON.parse(aiContentData.content);
                } catch (e) {
                    console.error('Virhe AI-datan jäsentelyssä:', e);
                }
            }
        } catch (err) {
            console.warn('AI-dataa ei löytynyt tai tapahtui virhe:', err);
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
        
        // 4. Hae relaatiot Supabasesta
        const { data: relationsData, error: relationsError } = await aiSb
            .from('place_relations')
            .select('entity_id, entity_type, entity_name, relation_type, relation_context, strength')
            .eq('place_id', placeId);

        // 5. Yhdistä tiedot poistaen duplikaatit
        const allItemsMap = new Map();
        
        [...kohteet, ...tarjoukset].forEach(item => {
            if (item.place_id === placeId) {
                allItemsMap.set(String(item.id), item);
            }
        });
        
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

        // 6. Päivitä DOM
        renderPlace(placeData, relatedItems, aiProfileData);
        await loadEncountersForPlace(placeData);
        await loadLostItemsForPlace(placeData);
        await renderServicesForEntity(placeData);

    } catch (err) {
        console.error('Yllättävä virhe:', err);
        showError();
    }
});


function showError() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'block';
}

function renderPlace(place, relatedItems, aiProfileData) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('place-content').style.display = 'block';

    // Perustiedot
    document.getElementById('place-name').textContent = place.name || place.canonical_name || 'Nimetön paikka';
    document.getElementById('place-type').textContent = getTypeLabel(place.type);
    document.getElementById('place-municipality').textContent = place.municipality || 'Laukaa';
    
    // Kuvaus (V2 + AI)
    let descHtml = '';
    
    if (aiProfileData && aiProfileData.summary) {
        // Jos AI-profilointidata löytyi
        descHtml = `<p class="ai-summary" style="font-size: 1.15rem; color: var(--text-main); line-height: 1.7; margin-bottom: 1rem;">
            ${aiProfileData.summary}
        </p>`;
    } else if (place.description) {
        descHtml = `<p>${place.description}</p>`;
    } else {
        descHtml = `Tämä on <strong>${place.name || place.canonical_name}</strong>, joka on tyypiltään ${getTypeLabel(place.type).toLowerCase()}. ` +
            `Sijaintina on ${place.municipality}. <br><br>` + 
            `<em>Tekoälyn generoima kuvaus tälle paikalle lisätään myöhemmässä vaiheessa.</em>`;
    }
    
    // Ylimääräinen "place_content" -kenttä
    if (place.place_content) {
        descHtml += `<div style="margin-top: 1.5rem;" class="place-content-extra">${place.place_content}</div>`;
    }

    document.getElementById('display-description').innerHTML = descHtml;

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
        
        // Lisää AI-teemat jos olemassa
        if (aiProfileData && aiProfileData.themes && Array.isArray(aiProfileData.themes)) {
            aiProfileData.themes.forEach(t => uniqueThemes.add(t));
        }

        // Lisää tyyppi
        if (place.type) uniqueThemes.add(getTypeLabel(place.type));
        
        // Lisää relaatioista löytyvät
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

    // Aktiviteetit ("Mitä täällä voi tehdä?")
    const activitiesSection = document.getElementById('activities-section');
    const activitiesList = document.getElementById('activities-list');
    if (activitiesSection && activitiesList && aiProfileData && aiProfileData.activities && Array.isArray(aiProfileData.activities) && aiProfileData.activities.length > 0) {
        activitiesSection.style.display = 'block';
        
        // Yritä päätellä ikoni aktiviteetin nimestä (yksinkertainen mappaus tai geneerinen)
        activitiesList.innerHTML = aiProfileData.activities.map(act => {
            let icon = 'material-symbols:local-activity-outline';
            const nameLower = act.toLowerCase();
            if (nameLower.includes('uinti')) icon = 'material-symbols:pool-outline';
            if (nameLower.includes('hiihto')) icon = 'material-symbols:downhill-skiing-outline';
            if (nameLower.includes('ulkoilu') || nameLower.includes('kävely')) icon = 'material-symbols:directions-walk-outline';
            if (nameLower.includes('pyöräily')) icon = 'material-symbols:directions-bike-outline';
            if (nameLower.includes('pallopeli') || nameLower.includes('jalkapallo')) icon = 'material-symbols:sports-soccer-outline';
            if (nameLower.includes('kuntoilu')) icon = 'material-symbols:fitness-center-outline';
            if (nameLower.includes('kalastus')) icon = 'material-symbols:phishing-outline'; // Close enough
            if (nameLower.includes('luistelu')) icon = 'material-symbols:ice-skating-outline';

            return `
            <div class="activity-pill" style="display: flex; align-items: center; gap: 0.5rem; background: #f1f5f9; padding: 0.6rem 1.2rem; border-radius: 50px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid transparent;" onmouseover="this.style.background='#e2e8f0'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.background='#f1f5f9'; this.style.borderColor='transparent'">
                <span class="iconify" data-icon="${icon}" style="font-size: 1.2rem; color: var(--accent);"></span>
                ${act}
            </div>
            `;
        }).join('');
    }

    // UKK (FAQ)
    const faqSection = document.getElementById('faq-section');
    const faqList = document.getElementById('faq-list');
    if (faqSection && faqList && aiProfileData && aiProfileData.faq && Array.isArray(aiProfileData.faq) && aiProfileData.faq.length > 0) {
        faqSection.style.display = 'block';
        
        faqList.innerHTML = aiProfileData.faq.map(faqItem => {
            // Tukee sekä uutta (q, a) että vanhaa (question, answer) muotoa
            const qText = faqItem.q || faqItem.question || '';
            const aText = faqItem.a || faqItem.answer || '';
            
            if (!qText && !aText) return '';
            
            return `
            <details class="service-accordion">
                <summary>
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="iconify" data-icon="material-symbols:info-outline" style="color: var(--accent);"></span>
                        ${qText}
                    </span>
                    <span class="iconify accordion-icon" data-icon="material-symbols:expand-more"></span>
                </summary>
                <div class="service-content">
                    ${aText}
                </div>
            </details>
            `;
        }).join('');
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
        initPlaceMap(place.lat, place.lon, place.name || place.canonical_name);
        
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
            // Luo nimestä tehty jakolinkki (käytetään ensisijaisesti kanonista nimeä uniikkiuden vuoksi)
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

    // Ladataan lähipaikat tag-pilvenä
    renderNearbyPlaces(place);
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
        sectionTitle.innerHTML = `<span class="iconify" data-icon="material-symbols:storefront-outline" style="color: var(--accent);"></span> Palveluja täällä (${items.length})`;
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

function initPlaceMap(lat, lon, name) {
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
        const placeName = place.name || place.canonical_name || '';
        
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
        'service_request': '🛠️',
        'sell': '💰',
        'give': '🎁',
        'search': '🔍',
        'local_notice': '📢',
        'event': '📅',
        'offer': '🏷️',
        'feed_post': '📰',
        'content_other': '📄'
    };
    
    let html = '';
    
    for (const [type, items] of Object.entries(grouped)) {
        const label = typeLabels[type] || type;
        const icon = typeIcons[type] || '�Y"O';
        
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
        console.log('Haetaan lostItems paikalle:', place.place_id);
        const snapshot = await db.collection('lostItems')
            .where('placeId', '==', place.place_id)
            .limit(50)
            .get();
        
        console.log('LostItems snapshot:', snapshot.empty ? 'Tyhjä' : snapshot.docs.length + ' dokumenttia löydetty');
        if (snapshot.empty) return;
        
        // Suodata aktiiviset paikallisesti (Android tallentaa tilaksi APPROVED)
        const activeDocs = snapshot.docs.filter(doc => {
            const status = doc.data().status;
            return status === 'ACTIVE' || status === 'active' || status === 'APPROVED' || status === 'approved';
        });
        
        console.log('Aktiiviset lostItems:', activeDocs.length);
        if (activeDocs.length === 0) return;
        
        const lostItems = activeDocs.map(doc => {
            const d = doc.data();
            const isLost = d.category === 'LOST' || d.category === 'lost';
            return {
                id: doc.id,
                type: 'lost_and_found',
                title: (isLost ? '�Y"� Kadonnut: ' : '�Y"� Löytynyt: ') + (d.title || 'Ilmoitus'),
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
        
        const icon = '�Y"�';
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

// �"?�"? L�"HIPAIKKOJEN LOGIIKKA (TAG CLOUD) �"?�"?
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function renderNearbyPlaces(currentPlace) {
    if (!currentPlace.lat || !currentPlace.lon) return;
    const container = document.getElementById('nearby-places-section');
    const list = document.getElementById('nearby-places-list');
    if (!container || !list) return;

    const sb = window.aiSb;
    if (!sb) return;

    try {
        const { data: places, error } = await sb
            .from('places')
            .select('place_id, name, canonical_name, type, lat, lon')
            .not('lat', 'is', null)
            .not('lon', 'is', null);

        if (error || !places) return;

        let nearby = places.map(p => {
            if (p.place_id === currentPlace.place_id) return null;
            const dist = haversineMeters(currentPlace.lat, currentPlace.lon, p.lat, p.lon);
            return { ...p, dist };
        }).filter(p => p !== null && p.dist <= 5000);

        nearby.sort((a, b) => a.dist - b.dist);
        nearby = nearby.slice(0, 5);

        if (nearby.length > 0) {
            container.style.display = 'block';
            list.innerHTML = nearby.map(p => {
                const distText = p.dist < 1000
                    ? Math.round(p.dist) + ' m'
                    : (p.dist / 1000).toFixed(1).replace('.', ',') + ' km';

                let tagClass = 'tag-medium';
                if (p.dist < 300) tagClass = 'tag-large';
                else if (p.dist > 1000) tagClass = 'tag-small';

                // Näytetään oikea nimi (p.name) hashtagina, mutta haetaan kohde canonical-nimellä
                const displayName = p.name || p.canonical_name;
                const hashName = displayName.replace(/\s+/g, '');
                const searchName = (p.canonical_name || p.name).replace(/\s+/g, '_');

                return `<a href="tietoa-paikasta.html?name=${encodeURIComponent(searchName)}" class="nearby-tag ${tagClass}">#${hashName} <span class="dist">\u00b7 ${distText}</span></a>`;
            }).join('');
        }
    } catch (e) {
        console.warn('Nearby places error:', e);
    }
}

async function renderServicesForEntity(placeData) {
    const servicesBox = document.getElementById('services-section');
    const servicesContainer = document.getElementById('el-services');
    
    if (!servicesBox || !servicesContainer) return;
    
    try {
        // Käytetään place_id sellaisenaan (ei poisteta mahdollista prefiksiä)
        const placeIdStr = String(placeData.place_id);
        
        console.log('[Services] Haetaan palveluita paikalle:', placeIdStr);
        
        const { data: relations, error: relError } = await window.aiSb
            .from('place_relations')
            .select('entity_id, entity_name, relation_context')
            .eq('place_id', placeIdStr)
            .eq('entity_type', 'COMPANY');
            
        if (relError) throw relError;
        console.log('[Services] place_relations tulokset:', relations);
        
        const { data: sources, error: srcError } = await window.aiSb
            .from('place_sources')
            .select('id, entity_id, source_type, title, url')
            .eq('place_id', placeIdStr);
            
        if (srcError) throw srcError;
        
        const { data: contents, error: contentError } = await window.aiSb
            .from('place_content')
            .select('*')
            .eq('place_id', placeIdStr);

        if (!relations || relations.length === 0) {
            servicesBox.style.display = 'none';
            return;
        }

        servicesBox.style.display = 'block';
        
        servicesContainer.innerHTML = relations.map(rel => {
            const companySources = sources ? sources.filter(s => String(s.entity_id) === String(rel.entity_id)) : [];
            const companyContents = contents ? contents.filter(c => String(c.entity_id) === String(rel.entity_id)) : [];

            let htmlArr = [];
            
            if (companySources.length > 0) {
                htmlArr.push(companySources.map(s => {
                    if (s.source_type === 'YOUTUBE' || s.source_type === 'YOUTUBE_VIDEO') {
                        let yid = '';
                        if (s.url.includes('v=')) {
                            yid = s.url.split('v=')[1].split('&')[0];
                        } else if (s.url.includes('youtu.be/')) {
                            yid = s.url.split('youtu.be/')[1].split('?')[0];
                        }
                        return yid ? `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>` : `<a href="${s.url}" target="_blank">${s.title}</a>`;
                    } else {
                        return `<div style="margin-top:8px;"><a href="${s.url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">${s.title} &rarr;</a></div>`;
                    }
                }).join(''));
            }
            
            if (companyContents.length > 0) {
                htmlArr.push(companyContents.map(c => {
                    let mediaHtml = '';
                    if (c.media_url) {
                        if (c.content_type === 'VIDEO' || c.storage_provider === 'YOUTUBE') {
                            let yid = '';
                            if (c.media_url.includes('v=')) {
                                yid = c.media_url.split('v=')[1].split('&')[0];
                            } else if (c.media_url.includes('youtu.be/')) {
                                yid = c.media_url.split('youtu.be/')[1].split('?')[0];
                            }
                            if (yid) {
                                mediaHtml = `<div style="margin-top:10px;"><iframe style="width:100%; aspect-ratio: 16/9; border-radius:8px;" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen></iframe></div>`;
                            } else {
                                mediaHtml = `<div style="margin-top:8px;"><video src="${c.media_url}" controls style="width:100%; border-radius:8px;"></video></div>`;
                            }
                        } else if (c.content_type === 'PHOTO') {
                            mediaHtml = `<div style="margin-top:8px;"><img src="${c.media_url}" alt="${c.title}" style="max-width:100%; border-radius:8px;"></div>`;
                        } else {
                            mediaHtml = `<div style="margin-top:8px;"><a href="${c.media_url}" target="_blank" style="color:var(--accent); font-weight:bold; text-decoration:none;">Katso media &rarr;</a></div>`;
                        }
                    }
                    
                    return `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
                            <h4 style="margin: 0 0 5px 0; color: var(--text-main);">${c.title}</h4>
                            ${c.description ? `<p style="margin: 0 0 10px 0; font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${c.description}</p>` : ''}
                            ${mediaHtml}
                        </div>
                    `;
                }).join(''));
            }

            let sourcesHtml = htmlArr.length > 0 
                ? htmlArr.join('') 
                : `<p style="color:var(--text-muted); font-style:italic;">Ei lisättyjä sisältöjä. Ota yhteyttä yritykseen.</p>`;

            return `
            <details class="service-accordion">
                <summary>
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--accent); margin-bottom: 0.2rem;">${rel.entity_name}</div>
                        <div style="font-family: 'Outfit', sans-serif;">${rel.relation_context || 'Palvelu'}</div>
                    </div>
                    <span class="iconify" data-icon="mdi:chevron-down" style="font-size:1.5rem; color:var(--text-muted); transition:transform 0.2s;"></span>
                </summary>
                <div class="service-content">
                    ${sourcesHtml}
                </div>
            </details>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Virhe palveluiden haussa:", err);
        servicesBox.style.display = 'none';
    }
}
