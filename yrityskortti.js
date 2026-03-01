(function () {
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
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            const response = await fetch(dataSourceUrl);
            const companies = await response.json();

            // Normalize URLs (Same logic as in script.js)
            const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
            companies.forEach(company => {
                if (company.media) {
                    company.media.forEach(item => {
                        if (item.url) {
                            if (item.url.includes('drive_cache/')) {
                                const match = item.url.match(/drive_cache\/([a-zA-Z0-9_-]+)/);
                                if (match) {
                                    const fileId = match[1];
                                    item.url = baseUrl + "get_image.php?id=" + fileId;
                                }
                            }
                            if (!item.url.startsWith('http') && !item.url.startsWith('//')) {
                                item.url = baseUrl + item.url;
                            }
                        }
                    });
                }
            });

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

        // Distance Calculation
        const storedCoords = localStorage.getItem('userCoords');
        if (storedCoords && company.lat && company.lon) {
            try {
                const userCoords = JSON.parse(storedCoords);
                const dist = getHaversineDistance(
                    userCoords.lat,
                    userCoords.lng,
                    parseFloat(company.lat),
                    parseFloat(company.lon)
                );
                const distText = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`;

                // Add distance badge if not already there
                const addressContainer = document.getElementById('display-address').parentElement;
                let distElem = document.getElementById('display-distance');
                if (!distElem) {
                    distElem = document.createElement('div');
                    distElem.id = 'display-distance';
                    distElem.style.marginTop = '0.5rem';
                    distElem.style.color = 'var(--primary-blue)';
                    distElem.style.fontWeight = '700';
                    addressContainer.appendChild(distElem);
                }
                distElem.innerHTML = `🚗 Etäisyys: ${distText}`;
            } catch (e) { console.error("Error calculating distance", e); }
        }

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
        const mapContainer = document.getElementById('card-map');
        if (company.lat && company.lon && mapContainer) {
            const map = L.map('card-map').setView([company.lat, company.lon], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);
            L.marker([company.lat, company.lon]).addTo(map).bindPopup(company.nimi).openPopup();

            document.getElementById('google-maps-link').href = `https://www.google.com/maps?q=${company.lat},${company.lon}`;
        }
    }

    function getHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
})();
