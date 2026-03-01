/**
 * LaukaaInfo Yrityskortti Logic
 * Handles detailed company view.
 */

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('id');

    if (!companyId) {
        window.location.href = 'index.html';
        return;
    }

    loadCompanyDetails(companyId);
});

async function loadCompanyDetails(id) {
    try {
        // Fetch from the same remote API as script.js
        const response = await fetch('https://www.mediazoo.fi/laukaainfo-web/get_companies.php');
        const companies = await response.json();

        const company = companies.find(c => c.id === id);

        if (!company) {
            document.getElementById('loading-overlay').innerHTML = '<h2>Yritystä ei löytynyt.</h2><a href="index.html">Takaisin hakuun</a>';
            return;
        }

        renderCompanyDetails(company);
    } catch (error) {
        console.error('Virhe ladattaessa yrityksen tietoja:', error);
        document.getElementById('loading-overlay').innerHTML = '<h2>Virhe ladattaessa tietoja.</h2>';
    }
}

function renderCompanyDetails(company) {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('card-content').style.display = 'block';

    document.title = `${company.nimi} – LaukaaInfo`;
    document.getElementById('display-name').textContent = company.nimi;
    document.getElementById('display-category').textContent = company.kategoria;
    document.getElementById('display-headline').textContent = company.mainoslause || '';
    document.getElementById('display-description').textContent = company.esittely || '';
    document.getElementById('display-address').textContent = company.osoite || 'Laukaa';

    // Logo
    const logoImg = document.querySelector('#card-logo img');
    if (company.media && company.media.length > 0) {
        // Simple logic: first image as logo if no specific logo field
        logoImg.src = company.media[0].url;
    }

    // Contact links
    const phoneItem = document.getElementById('phone-item');
    if (company.puhelin) {
        const phoneLink = document.getElementById('display-phone');
        phoneLink.textContent = company.puhelin;
        phoneLink.href = `tel:${company.puhelin}`;
    } else {
        phoneItem.style.display = 'none';
    }

    const websiteItem = document.getElementById('website-item');
    if (company.nettisivu) {
        const webLink = document.getElementById('display-website');
        webLink.textContent = company.nettisivu.replace(/^https?:\/\//, '');
        webLink.href = company.nettisivu;
    } else {
        websiteItem.style.display = 'none';
    }

    // Gallery
    const galleryContainer = document.getElementById('gallery-container');
    const mainImage = document.getElementById('main-image');
    const thumbnails = document.getElementById('image-thumbnails');

    const images = (company.media || []).filter(m => m.type === 'image');
    if (images.length > 0) {
        mainImage.innerHTML = `<img src="${images[0].url}" alt="${company.nimi}">`;

        if (images.length > 1) {
            thumbnails.innerHTML = '';
            images.forEach(img => {
                const thumb = document.createElement('img');
                thumb.src = img.url;
                thumb.onclick = () => {
                    mainImage.querySelector('img').src = img.url;
                };
                thumbnails.appendChild(thumb);
            });
        }
    } else {
        galleryContainer.style.display = 'none';
    }

    // Video
    const videoSection = document.getElementById('video-section');
    const videos = (company.media || []).filter(m => m.type === 'video');
    if (videos.length > 0) {
        videoSection.style.display = 'block';
        videoSection.innerHTML = `<iframe src="${videos[0].url}" allowfullscreen></iframe>`;
    }

    // Map & Link
    if (company.lat && company.lon) {
        const map = L.map('card-map').setView([company.lat, company.lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        L.marker([company.lat, company.lon]).addTo(map).bindPopup(company.nimi).openPopup();

        document.getElementById('google-maps-link').href = `https://www.google.com/maps?q=${company.lat},${company.lon}`;
    } else {
        document.getElementById('card-map').style.display = 'none';
        document.getElementById('google-maps-link').style.display = 'none';
    }
}
