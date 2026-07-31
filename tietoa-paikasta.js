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
        const aiSb = window.supabase.createClient(AI_SUPABASE_URL, AI_SUPABASE_KEY);

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
