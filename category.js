let categoryCompanies = [];
let map = null;
let markers = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('cat');

    if (!category) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('category-name').textContent = category;
    document.title = `${category} – LaukaaInfo`;

    // Icon selection
    const categoryIcons = {
        'Kauneus ja terveys': '💄',
        'Matkailu & Elämykset': '🌲',
        'Ravinto & Vapaa-aika': '🍽️',
        'Perinnematkailu & Juhlat': '💒',
        'Muu': '🏢'
    };
    document.getElementById('category-icon').textContent = categoryIcons[category] || '🏢';

    loadData(category);
});

async function loadData(category) {
    try {
        const response = await fetch('https://www.mediazoo.fi/laukaainfo-web/get_companies.php');
        const allCompanies = await response.json();

        categoryCompanies = allCompanies.filter(c => c.kategoria === category);

        renderFeatured(categoryCompanies);
        renderDirectory(categoryCompanies);
        initMap(categoryCompanies);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function renderFeatured(companies) {
    // Let's assume businesses with more than 1 image or a specific "priority" field are featured
    // For now, let's use a dummy priority logic or just take those with media
    const featured = companies.filter(c => c.media && c.media.length > 0)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, 5);

    const section = document.getElementById('featured-section');
    const container = document.getElementById('featured-carousel');

    if (featured.length > 0) {
        section.style.display = 'block';
        container.innerHTML = '';

        featured.forEach(c => {
            const item = document.createElement('div');
            item.className = 'carousel-item';

            let mediaHtml = '';
            if (c.media && c.media[0]) {
                if (c.media[0].type === 'image') {
                    mediaHtml = `<img src="${c.media[0].url}" style="width:100%; height:150px; object-fit:cover; border-radius:8px; margin-bottom:1rem;">`;
                }
            }

            item.innerHTML = `
                <span class="premium-badge">SUOSITELTU</span>
                ${mediaHtml}
                <h3>${c.nimi}</h3>
                <p>${c.mainoslause || ''}</p>
                <div style="margin-top:1rem;">
                    <strong>${c.osoite || ''}</strong>
                </div>
            `;
            container.appendChild(item);
        });
    }
}

function renderDirectory(companies) {
    const list = document.getElementById('company-list');
    list.innerHTML = '';

    companies.forEach(c => {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.innerHTML = `
            <h3>${c.nimi}</h3>
            <p class="address">${c.osoite || 'Laukaa'}</p>
            <p>${c.mainoslause || ''}</p>
            <div style="margin-top:1rem; display:flex; gap:10px;">
                ${c.nettisivu ? `<a href="${c.nettisivu}" target="_blank" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">WWW</a>` : ''}
                ${c.puhelin ? `<a href="tel:${c.puhelin}" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background:#666;">SOITA</a>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
}

function initMap(companies) {
    if (map) return;

    map = L.map('category-map').setView([62.4128, 25.9477], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    markers = L.markerClusterGroup();

    companies.forEach(company => {
        if (company.lat && company.lon) {
            const marker = L.marker([company.lat, company.lon]);
            marker.bindPopup(`<strong>${company.nimi}</strong><br>${company.osoite}`);
            markers.addLayer(marker);
        }
    });

    map.addLayer(markers);

    // Zoom to fit markers if any
    const group = new L.featureGroup(markers.getLayers());
    if (markers.getLayers().length > 0) {
        map.fitBounds(group.getBounds().pad(0.1));
    }
}
