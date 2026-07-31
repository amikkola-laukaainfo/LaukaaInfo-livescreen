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

        // 3. Hae relaatiot (yritykset + muut) tässä paikassa
        const { data: relationsData, error: relationsError } = await aiSb
            .from('place_relations')
            .select('entity_id, entity_type, relation_type, relation_context, strength')
            .eq('place_id', placeId)
            .order('strength', { ascending: true }); // PRIMARY ensin

        const companyRelations = relationsError ? [] : (relationsData || []).filter(r => r.entity_type === 'COMPANY');

        // 4. Hae yritysten nimet company_profiles -taulusta
        let companiesWithNames = [];
        if (companyRelations.length > 0) {
            const companyIds = companyRelations.map(r => r.entity_id);
            const { data: profilesData } = await aiSb
                .from('company_profiles')
                .select('id, name')
                .in('id', companyIds);
            const profileMap = {};
            (profilesData || []).forEach(p => { profileMap[p.id] = p.name; });
            companiesWithNames = companyRelations.map(r => ({
                ...r,
                company_name: profileMap[r.entity_id] || 'Tuntematon yritys'
            }));
        }

        // 5. Päivitä DOM
        renderPlace(placeData, companiesWithNames);

    } catch (err) {
        console.error('Yllättävä virhe:', err);
        showError();
    }
});

function showError() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'block';
}

function renderPlace(place, companyRelations) {
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
    document.getElementById('stat-companies').textContent = companyRelations.length;

    // Yritykset: ryhmittele vahvuuden mukaan
    renderCompanyRelations(companyRelations);

    // Kartta
    if (place.lat && place.lon) {
        document.getElementById('map-section').style.display = 'block';
        initMap(place.lat, place.lon, place.canonical_name || place.name);
    }
}

const STRENGTH_LABELS = { PRIMARY: 'Päätoimipaikka', SECONDARY: 'Säännöllinen', OCCASIONAL: 'Satunnainen' };
const STRENGTH_COLORS = { PRIMARY: '#059669', SECONDARY: '#0056b3', OCCASIONAL: '#64748b' };
const RELATION_LABELS = {
    HEAD_OFFICE: 'Toimipaikka', SERVICE_AREA: 'Palvelualue', WORK_LOCATION: 'Työkohde',
    EVENT_LOCATION: 'Tapahtumapaikka', CUSTOMER_LOCATION: 'Asiakaskohde',
    LANDMARK: 'Maamerkki', ROUTE: 'Reitti', HISTORY: 'Historiallinen', MEMORY: 'Muisto',
    OBSERVATION: 'Havainto', OTHER: 'Muu yhteys'
};

function renderCompanyRelations(relations) {
    const container = document.getElementById('companies-list');
    if (!container) return;

    if (relations.length === 0) {
        container.innerHTML = `<div style="text-align:center; color: #94a3b8; padding: 2rem; border: 2px dashed #e2e8f0; border-radius: 16px;">
            <span class="iconify" data-icon="material-symbols:store-outline" style="font-size: 2rem;"></span>
            <p style="margin-top: 0.5rem;">Ei vielä liitettyjä yrityksiä.</p></div>`;
        return;
    }

    // Järjestä: PRIMARY ensin
    const ORDER = ['PRIMARY', 'SECONDARY', 'OCCASIONAL'];
    const sorted = [...relations].sort((a, b) => ORDER.indexOf(a.strength) - ORDER.indexOf(b.strength));

    container.innerHTML = sorted.map(rel => {
        const color = STRENGTH_COLORS[rel.strength] || '#64748b';
        const strengthLabel = STRENGTH_LABELS[rel.strength] || rel.strength;
        const relationLabel = RELATION_LABELS[rel.relation_type] || rel.relation_type;
        return `
        <div style="display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 0.75rem;">
            <div style="flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px; background: ${color}1a; display: flex; align-items: center; justify-content: center;">
                <span class="iconify" data-icon="material-symbols:storefront-outline" style="font-size: 1.5rem; color: ${color};"></span>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-weight: 700; font-size: 1rem; color: #1a202c;">${rel.company_name}</span>
                    <span style="font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 50px; background: ${color}1a; color: ${color}; text-transform: uppercase; letter-spacing: 0.5px;">${strengthLabel}</span>
                </div>
                <div style="font-size: 0.85rem; color: #059669; font-weight: 600; margin-top: 0.2rem;">${relationLabel}</div>
                ${rel.relation_context ? `<div style="font-size: 0.9rem; color: #64748b; margin-top: 0.4rem; line-height: 1.5;">${rel.relation_context}</div>` : ''}
            </div>
        </div>`;
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
