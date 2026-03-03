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
            const dataSourceUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQTdoRdDSwSBVtImPr6hhIVLqRcA1FaWlLXg2zG9o9CjMqHQYX2kRo6Do2aHavTcgteTh1kno3GKXCd/pub?output=csv';
            const response = await fetch(dataSourceUrl + '&t=' + Date.now());
            const csvText = await response.text();
            const companies = parseCSV(csvText);

            const company = companies.find(c => String(c.id) === String(id));

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

    /**
     * Sama CSV-parsiminen kuin script.js:ssä
     */
    function parseCSV(csvText) {
        const lines = [];
        let currentLine = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                currentLine.push(currentCell.trim());
                currentCell = '';
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                currentLine.push(currentCell.trim());
                if (currentLine.length > 1 || currentLine[0] !== '') {
                    lines.push(currentLine);
                }
                currentLine = [];
                currentCell = '';
                if (char === '\r' && nextChar === '\n') i++;
            } else {
                currentCell += char;
            }
        }
        if (currentCell || currentLine.length > 0) {
            currentLine.push(currentCell.trim());
            lines.push(currentLine);
        }

        if (lines.length < 2) return [];

        const headers = lines[0];
        return lines.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => {
                let val = row[i] || '';
                if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
                obj[h.trim()] = val;
            });
            obj.id = obj.rowid;
            if (obj.lat) obj.lat = obj.lat.replace(',', '.');
            if (obj.lon) obj.lon = obj.lon.replace(',', '.');

            if (obj.images && obj.images.startsWith('[')) {
                try {
                    const urls = JSON.parse(obj.images.replace(/'/g, '"'));
                    obj.media = (obj.media || []).concat(urls.map(url => ({ type: 'image', url })));
                } catch (e) { console.warn("Kuvalinkkien parsimisvirhe yritykselle " + obj.name, e); }
            }
            if (obj.youtubeUrl && obj.youtubeUrl.includes('youtube.com')) {
                const vidId = obj.youtubeUrl.match(/v=([a-zA-Z0-9_-]+)/)?.[1];
                if (vidId) {
                    obj.media = (obj.media || []).concat([{ type: 'video', url: `https://www.youtube.com/embed/${vidId}` }]);
                }
            }
            obj.nimi = obj.name;
            obj.nettisivu = obj.website;
            obj.esittely = obj.description;
            return obj;
        });
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
        const logoImg = document.getElementById('display-logo');
        const logoContainer = document.getElementById('logo-container');
        if (company.logo && company.logo !== '-') {
            logoImg.src = company.logo;
            logoContainer.style.display = 'flex';
        } else if (company.media && company.media.length > 0) {
            // Fallback to first image if no logo defined
            logoImg.src = company.media[0].url;
            logoContainer.style.display = 'flex';
        }

        // Social Media & Contact links
        const phoneItem = document.getElementById('phone-item');
        if (company.puhelin && company.puhelin !== '-') {
            const phoneLink = document.getElementById('display-phone');
            phoneLink.textContent = company.puhelin;
            phoneLink.href = `tel:${company.puhelin}`;
            phoneItem.style.display = 'flex';
        } else {
            phoneItem.style.display = 'none';
        }

        const websiteItem = document.getElementById('website-item');
        if (company.nettisivu && company.nettisivu !== '-') {
            const webLink = document.getElementById('display-website');
            webLink.textContent = company.nettisivu.replace(/^https?:\/\//, '');
            webLink.href = company.nettisivu;
            websiteItem.style.display = 'flex';
        } else {
            websiteItem.style.display = 'none';
        }

        // Social Icons Section
        const socialIcons = document.getElementById('social-icons');
        if (socialIcons) {
            socialIcons.innerHTML = '';
            const socialMap = {
                facebook: { icon: '🔵 FB', label: 'Facebook' },
                instagram: { icon: '📸 IG', label: 'Instagram' },
                linkedin: { icon: '💼 LI', label: 'LinkedIn' },
                tiktok: { icon: '📱 TT', label: 'TikTok' }
            };

            Object.entries(socialMap).forEach(([key, info]) => {
                if (company[key] && company[key] !== '-') {
                    const a = document.createElement('a');
                    a.href = company[key];
                    a.target = '_blank';
                    a.title = info.label;
                    a.style.cssText = 'font-size: 1.5rem; text-decoration: none; margin-right: 0.5rem;';
                    a.textContent = info.icon.split(' ')[0]; // Show icon character
                    socialIcons.appendChild(a);
                }
            });

            if (company.whatsapp === 'true' && company.puhelin) {
                const wa = document.createElement('a');
                // Format phone: remove spaces/pluses for WA link
                const waNum = company.puhelin.replace(/[^0-9]/g, '');
                wa.href = `https://wa.me/${waNum}`;
                wa.target = '_blank';
                wa.style.cssText = 'font-size: 1.5rem; text-decoration: none;';
                wa.textContent = '💬';
                socialIcons.appendChild(wa);
            }
        }

        // Promotional Links
        const adSection = document.getElementById('promotional-links-section');
        const adList = document.getElementById('ad-links-list');
        if (company.mainoslinkit && company.mainoslinkit.length > 0) {
            let links = [];
            try {
                // If it's a string (from CSV), parse it
                links = typeof company.mainoslinkit === 'string' ? JSON.parse(company.mainoslinkit) : company.mainoslinkit;
            } catch (e) { console.error("Error parsing mainoslinkit", e); }

            if (links.length > 0) {
                adSection.style.display = 'block';
                adList.innerHTML = '';
                links.forEach(url => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.className = 'btn-primary';
                    a.style.cssText = 'background: #d2691e; padding: 0.6rem 1.2rem; font-size: 0.9rem;';
                    a.textContent = '📲 Katso tarjous';
                    adList.appendChild(a);
                });
            }
        }

        // Gallery
        const galleryContainer = document.getElementById('gallery-container');
        const mainImage = document.getElementById('main-image');
        const thumbnails = document.getElementById('image-thumbnails');

        const images = (company.media || []).filter(m => m.type === 'image');
        if (images.length > 0) {
            mainImage.innerHTML = `<img src="${images[0].url}" alt="${company.nimi}">`;
            galleryContainer.style.display = 'block';

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
        } else {
            videoSection.style.display = 'none';
        }

        // Map & Link
        const mapContainer = document.getElementById('card-map');
        if (company.lat && company.lon && mapContainer) {
            mapContainer.innerHTML = ''; // Clear previous map
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
