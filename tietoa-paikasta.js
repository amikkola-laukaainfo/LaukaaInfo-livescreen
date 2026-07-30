document.addEventListener('DOMContentLoaded', async () => {
    // 1. Hae ID URL:sta
    const urlParams = new URLSearchParams(window.location.search);
    const placeId = urlParams.get('id');

    if (!placeId) {
        showError();
        return;
    }

    try {
        // 2. Hae paikan tiedot Supabasesta
        const { data: placeData, error: placeError } = await window.LaukaaSupabase
            .from('places')
            .select('*')
            .eq('place_id', placeId)
            .single();

        if (placeError || !placeData) {
            console.error('Virhe haettaessa paikkaa:', placeError);
            showError();
            return;
        }

        // 3. Hae yritysten määrä tässä paikassa
        const { data: relationsData, error: relationsError } = await window.LaukaaSupabase
            .from('place_company_relations')
            .select('id')
            .eq('place_id', placeId);

        const companyCount = relationsError ? 0 : (relationsData ? relationsData.length : 0);

        // 4. Päivitä DOM
        renderPlace(placeData, companyCount);

    } catch (err) {
        console.error('Yllättävä virhe:', err);
        showError();
    }
});

function showError() {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('error-message').style.display = 'block';
}

function renderPlace(place, companyCount) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('place-content').style.display = 'block';

    // Perustiedot
    document.getElementById('place-name').textContent = place.canonical_name || place.name || 'Nimetön paikka';
    document.getElementById('place-type').textContent = getTypeLabel(place.type);
    document.getElementById('place-municipality').textContent = place.municipality || 'Laukaa';
    
    // Kuvaus (V1 placeholder)
    document.getElementById('display-description').innerHTML = 
        `Tämä on <strong>${place.canonical_name || place.name}</strong>, joka on tyypiltään ${getTypeLabel(place.type).toLowerCase()}. ` +
        `Sijaintina on ${place.municipality}. <br><br>` + 
        `<em>Tekoälyn generoima kuvaus tälle paikalle lisätään myöhemmässä vaiheessa.</em>`;

    // Tilastot
    document.getElementById('stat-companies').textContent = companyCount;

    // Kartta
    if (place.lat && place.lon) {
        document.getElementById('map-section').style.display = 'block';
        initMap(place.lat, place.lon, place.canonical_name || place.name);
    }
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
