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
            // Käytetään palvelimen proxyä, joka hoitaa CORS-ongelmat ja datan muunnoksen
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            const response = await fetch(dataSourceUrl + '?t=' + Date.now());
            const json = await response.json();
            // New response format: {results: [...], total: N, page: N, limit: N}
            const companies = Array.isArray(json) ? json : (json.results || []);

            // Normalize URLs
            const baseUrl = dataSourceUrl.substring(0, dataSourceUrl.lastIndexOf('/') + 1);
            companies.forEach(company => {
                if (company.media) {
                    company.media.forEach(item => {
                        if (item.url && !item.url.startsWith('http') && !item.url.startsWith('//')) {
                            item.url = baseUrl + item.url;
                        }
                    });
                }
                if (company.logo && !company.logo.startsWith('http') && !company.logo.startsWith('//') && company.logo !== '-') {
                    company.logo = baseUrl + company.logo;
                }
            });

            const company = companies.find(c => String(c.id) === String(id) || c.id === "company-" + id);

            if (!company) {
                document.getElementById('loading-overlay').innerHTML = '<h2>Yritystä ei löytynyt.</h2><a href="index.html">Takaisin hakuun</a>';
                return;
            }

            renderCompanyDetails(company);
        } catch (error) {
            console.error('Virhe ladattaessa yrityksen tietoja:', error);
            document.getElementById('loading-overlay').innerHTML = '<h2>Virhe ladattaessa tietoja. Tarkista PHP-tiedostot.</h2>';
        }
    }

    function renderCompanyDetails(company) {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('card-content').style.display = 'block';

        const rawId = String(company.id).replace('company-', '');
        document.title = `${company.nimi} – LaukaaInfo`;
        document.getElementById('display-name').textContent = company.nimi;
        document.getElementById('display-category').textContent = company.kategoria;
        // Split description on @@ separator: first part = slogan, second part = full description
        // @@ can appear in either mainoslause or esittely field
        const esittely = company.esittely || '';
        const mainoslause = company.mainoslause || '';

        let slogan = '';
        let fullContent = esittely || mainoslause;

        // Extract slogan: text before the first @@
        if (fullContent.includes('@@')) {
            slogan = fullContent.split('@@')[0].trim();
        } else {
            slogan = mainoslause || (esittely.length > 100 ? esittely.substring(0, 100) + '...' : esittely);
        }

        // Description: full content with all @@ removed and hashtags stripped
        const description = fullContent.replaceAll('@@', '').replace(/#[a-zA-Z0-9åäöÅÄÖ]+/g, '').replace(/\s\s+/g, ' ').trim();

        document.getElementById('display-headline').textContent = slogan;
        document.getElementById('display-description').textContent = description;
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

            // Brand SVG icons – proper logos with brand colors
            const socialMap = {
                facebook: {
                    label: 'Facebook',
                    color: '#1877F2',
                    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`
                },
                instagram: {
                    label: 'Instagram',
                    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="ig-grad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><path fill="url(#ig-grad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`
                },
                linkedin: {
                    label: 'LinkedIn',
                    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`
                },
                tiktok: {
                    label: 'TikTok',
                    svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.19 8.19 0 004.79 1.53V6.75a4.85 4.85 0 01-1.02-.06z"/></svg>`
                }
            };

            Object.entries(socialMap).forEach(([key, info]) => {
                const val = (company[key] || '').trim();
                if (val && val !== '-') {
                    const a = document.createElement('a');
                    a.href = val;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.title = info.label;
                    a.style.cssText = 'display:inline-flex; align-items:center; text-decoration:none; margin-right:0.6rem;';
                    a.innerHTML = `<span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center;">${info.svg}</span>`;
                    socialIcons.appendChild(a);
                }
            });

            // WhatsApp: field can be a phone number, 'true', or a full wa.me URL
            const waField = (company.whatsapp || '').trim();
            if (waField && waField !== '-' && waField !== 'false' && waField !== '0') {
                const wa = document.createElement('a');
                let waHref = '';

                if (waField.startsWith('http')) {
                    // Already a full URL
                    waHref = waField;
                } else if (waField === 'true') {
                    // Use the company's main phone number
                    const waNum = (company.puhelin || '').replace(/[^0-9]/g, '');
                    if (waNum) waHref = `https://wa.me/${waNum}`;
                } else {
                    // It's a phone number — strip non-digits and build link
                    const waNum = waField.replace(/[^0-9]/g, '');
                    if (waNum) waHref = `https://wa.me/${waNum}`;
                }

                if (waHref) {
                    wa.href = waHref;
                    wa.target = '_blank';
                    wa.rel = 'noopener noreferrer';
                    wa.title = 'WhatsApp';
                    wa.style.cssText = 'font-size: 1.5rem; text-decoration: none; margin-right: 0.5rem; display:inline-flex; align-items:center;';
                    wa.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="#25D366" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.52 14.16c-.23.65-1.35 1.27-1.84 1.33-.48.06-.93.21-3.18-.66-2.69-1.05-4.41-3.82-4.54-4-.13-.18-1.07-1.42-1.07-2.71s.68-1.92.92-2.18c.24-.26.52-.33.69-.33l.5.01c.16 0 .38-.06.59.45.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.17-.13.28-.26.43l-.39.44c-.13.13-.26.27-.11.53.15.26.66 1.09 1.42 1.77.97.87 1.79 1.14 2.05 1.27.26.13.41.11.56-.07.16-.18.67-.79.85-1.06.18-.27.35-.22.59-.13.24.09 1.52.72 1.78.85.26.13.43.2.5.3.06.11.06.63-.17 1.28z"/></svg>`;
                    socialIcons.appendChild(wa);
                }
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

        // Cloudinary Promotional Images - checks if image exists and adds as link
        const timestamp = new Date().getTime();

        [1, 2].forEach(index => {
            const baseUrl = `https://res.cloudinary.com/dfigif5il/image/upload/w_1200,q_auto,f_auto/mediazoo/offers/${rawId}_${index}`;

            const tryLoad = (extension) => {
                const cloudinaryUrl = `${baseUrl}.${extension}?v=${timestamp}`;
                const tempImg = new Image();
                tempImg.onload = () => {
                    // Image found! Add a link button to ad-links-list
                    if (adList) {
                        adSection.style.display = 'block';
                        const a = document.createElement('a');
                        a.href = cloudinaryUrl;
                        a.target = '_blank';
                        a.className = 'btn-primary';
                        a.style.cssText = 'background: #d2691e; padding: 0.6rem 1.2rem; font-size: 0.9rem;';
                        a.textContent = `🔥 Katso tarjouskuva ${index}`;
                        adList.appendChild(a);
                    }
                };
                tempImg.onerror = () => {
                    if (extension === 'png') {
                        tryLoad('jpg'); // Fallback to jpg
                    }
                };
                tempImg.src = cloudinaryUrl;
            };

            tryLoad('png');
        });

        // RSS Feed / Ajankohtaista logic
        if (company.rss && company.rss !== '-' && company.rss !== '') {
            loadRSS(company.rss);
        }
    }

    async function loadRSS(url) {
        const container = document.getElementById('rss-section');
        const itemsContainer = document.getElementById('rss-items-container');
        const dropdown = document.getElementById('rss-dropdown');
        const moreSection = document.getElementById('rss-more-section');
        const toggleBtn = document.getElementById('rss-toggle-btn');

        if (!container || !itemsContainer) return;

        try {
            // Using rss2json service with a small cache-buster to fetch RSS via CORS
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=your_api_key_here_if_needed`;
            // Note: Public usage usually works without key for low rate
            const response = await fetch(proxyUrl);
            const data = await response.json();

            if (data.status === 'ok' && data.items && data.items.length > 0) {
                container.style.display = 'block';
                itemsContainer.innerHTML = '';
                dropdown.innerHTML = '';

                // Show top 2 items with snippets
                const topItems = data.items.slice(0, 2);
                topItems.forEach(item => {
                    const date = new Date(item.pubDate);
                    const dateStr = date.toLocaleDateString('fi-FI');
                    const snippet = cleanRSSContent(item.description || item.content || '').substring(0, 160) + '...';

                    const itemHtml = `
                        <div class="rss-item">
                            <span class="rss-date">📅 ${dateStr}</span>
                            <h4><a href="${item.link}" target="_blank">${item.title}</a></h4>
                            <div class="rss-snippet">${snippet}</div>
                            <a href="${item.link}" target="_blank" style="color:var(--primary-blue); font-size:0.9rem; font-weight:600; text-decoration:none;">Lue koko uutinen →</a>
                        </div>
                    `;
                    itemsContainer.insertAdjacentHTML('beforeend', itemHtml);
                });

                // Rest of the items in a dropdown
                if (data.items.length > 2) {
                    const otherItems = data.items.slice(2, 10); // Limit to 10 total items
                    otherItems.forEach(item => {
                        const a = document.createElement('a');
                        a.href = item.link;
                        a.target = '_blank';
                        a.className = 'rss-dropdown-item';
                        a.textContent = `▶ ${item.title}`;
                        dropdown.appendChild(a);
                    });
                    moreSection.style.display = 'block';

                    toggleBtn.onclick = () => {
                        const isOpen = dropdown.classList.toggle('open');
                        toggleBtn.querySelector('.arrow').textContent = isOpen ? '▲' : '▼';
                        toggleBtn.innerHTML = isOpen ? `Pienennä uutiset <span class="arrow">▲</span>` : `Näytä muut uutiset (n. ${otherItems.length}) <span class="arrow">▼</span>`;
                    };
                }
            }
        } catch (error) {
            console.error('Error loading RSS feed:', error);
            // Silently fail or minimal notice
        }
    }

    function cleanRSSContent(html) {
        // Simple HTML strip
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        let text = tmp.textContent || tmp.innerText || "";
        // Remove multiple spaces/newlines
        return text.replace(/\s+/g, ' ').trim();
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
