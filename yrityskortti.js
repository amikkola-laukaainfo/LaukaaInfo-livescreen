(function () {
    /**
     * LaukaaInfo Yrityskortti Logic
     * Handles detailed company view.
     */

    function slugify(text) {
        if (!text) return "";
        return text.toString().toLowerCase().trim()
            .replace(/\s+/g, '-')
            .replace(/[äÄàáâãäå]/g, 'a')
            .replace(/[öÖòóôõöø]/g, 'o')
            .replace(/[åÅ]/g, 'a')
            .replace(/[^\w-]/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    /**
     * Pienentää fonttia, kunnes teksti mahtuu elementtiin.
     */
    function fitText(element, minFontSize = 12) {
        if (!element) return;
        
        // Luetaan nykyinen fonttikoko (tai käytetään oletusta jos ei asetettu)
        let fontSize = parseFloat(window.getComputedStyle(element).fontSize);
        
        // Vähennetään px kerrallaan kunnes mahtuu tai tullaan minimiin
        // scrollWidth > offsetWidth kertoo ylivuodosta
        let safety = 0;
        while (element.scrollWidth > element.offsetWidth && fontSize > minFontSize && safety < 100) {
            fontSize -= 1;
            element.style.fontSize = fontSize + "px";
            safety++;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        let companyId = params.get('id');

        // Jos ei olla dynaamisessa URLissa, kokeillaan päätellä ID tiedostonimestä (staattiset premium-sivut)
        if (!companyId) {
            const path = window.location.pathname;
            const fileName = path.split('/').pop();
            if (fileName && fileName.endsWith('.html') && fileName !== 'yrityskortti.html' && fileName !== 'index.html') {
                companyId = fileName.replace('.html', '');
                console.log("Päätelty yritys-ID tiedostonimestä:", companyId);
            }
        }

        if (!companyId) {
            // Estetään redirect jos ollaan selvästi kehitysympäristössä tai testitilassa
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
            window.location.href = 'index.html';
            return;
        }

        loadCompanyDetails(companyId);
    });

    async function loadCompanyDetails(id) {
        try {
            // Käytetään palvelimen proxyä, joka hoitaa CORS-ongelmat ja datan muunnoksen
            // Haetaan vain kyseisen yrityksen tiedot (Security & Performance)
            const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
            let actualId = id;

            // Jos ID ei ala "company-", etsitään oikea ID "Slim"-datasta
            if (!id.startsWith('company-')) {
                let allSlim = [];
                const slimCached = sessionStorage.getItem('laukaainfo_companies_slim');
                const slimTime = sessionStorage.getItem('laukaainfo_companies_slim_time');
                
                if (slimCached && slimTime && (Date.now() - parseInt(slimTime) < 1800000)) {
                    allSlim = JSON.parse(slimCached);
                    if (!Array.isArray(allSlim)) allSlim = allSlim.results || [];
                } else {
                    try {
                        const slimRes = await fetch(`${dataSourceUrl}?t=${Date.now()}`);
                        if (!slimRes.ok) throw new Error('HTTP Error: ' + slimRes.status);
                        const slimJson = await slimRes.json();
                        allSlim = Array.isArray(slimJson) ? slimJson : (slimJson.results || []);
                        sessionStorage.setItem('laukaainfo_companies_slim', JSON.stringify(slimJson));
                        sessionStorage.setItem('laukaainfo_companies_slim_time', Date.now().toString());
                    } catch (e) {
                        console.warn('Verkkovirhe tai 429 rajapinnassa (Slim), käytetään varadataa', e);
                        const isDist = window.location.pathname.includes('/yritys/');
                        const prefix = isDist ? '../' : './';
                        const localRes = await fetch(prefix + 'companies_data.json');
                        const localJson = await localRes.json();
                        allSlim = Array.isArray(localJson) ? localJson : (localJson.results || []);
                    }
                }

                const match = allSlim.find(c => slugify(c.nimi) === id);
                if (match) {
                    actualId = match.id;
                } else {
                    document.getElementById('loading-overlay').innerHTML = '<h2>Yritystä ei löytynyt.</h2><a href="index.html">Takaisin hakuun</a>';
                    return;
                }
            }

            // Haetaan valitun yrityksen täydet tiedot
            let json = null;
            const fullCached = sessionStorage.getItem('laukaainfo_full_' + actualId);
            
            if (fullCached) {
                const parsed = JSON.parse(fullCached);
                json = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
                if (!Array.isArray(json)) json = [json];
            } else {
                try {
                    const response = await fetch(`${dataSourceUrl}?id=${encodeURIComponent(actualId)}&t=${Date.now()}`);
                    if (!response.ok) throw new Error('HTTP Error: ' + response.status);
                    json = await response.json();
                } catch(e) {
                    console.warn('Verkkovirhe tai 429 rajapinnassa (Full), käytetään varadataa', e);
                    const isDist = window.location.pathname.includes('/yritys/');
                    const prefix = isDist ? '../' : './';
                    const localRes = await fetch(prefix + 'companies_data.json');
                    const localJson = await localRes.json();
                    const allLocal = Array.isArray(localJson) ? localJson : (localJson.results || []);
                    const matchF = allLocal.find(c => c.id === actualId);
                    if (matchF) {
                        json = matchF;
                    } else {
                        throw e; // Jos tääkään ei onnistu, heitetään virhe jotta näkyy "Ei löytynyt"
                    }
                }
                
                let storeVal = Array.isArray(json) ? json[0] : (json.results ? json.results[0] : json);
                sessionStorage.setItem('laukaainfo_full_' + actualId, JSON.stringify(storeVal));
            }
            
            const companies = Array.isArray(json) ? json : (json.results || []);

            // --- Ladataan yksittäisen yrityksen rikastusdata palvelimelta ---
            try {
                // Haemme vain kyseisen yrityksen datan PHP-rajapinnan kautta, joka piilottaa täyden JSON-tiedoston
                const enrichedRes = await fetch(`https://www.mediazoo.fi/laukaainfo-web/get_enriched_data.php?id=${encodeURIComponent(actualId)}&t=${Date.now()}`);
                if (enrichedRes.ok) {
                    const enrichedData = await enrichedRes.json();
                    
                    companies.forEach(company => {
                        // Varmistetaan, että saatu rikastusdata liitetään oikeaan yritykseen (vaikka PHP tekee sen jo)
                        if (enrichedData && enrichedData.results) {
                            company.enrichedData = enrichedData.results;
                        }
                    });
                }
            } catch (e) {
                console.warn('Virhe ladattaessa rikastusdataa:', e);
            }
            // ------------------------------------------

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

            // Etsitään yritys (vaikka pitäisi olla ainoa tulos, varmistetaan ID-muotoilu)
            const company = companies[0];

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

    /** Vanhentunut ilmainen yritys: nimi, osoite ja nettiosoite (jos annettu) */
    function renderExpiredCompanyCard(company) {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('card-content').style.display = 'block';

        const cardContent = document.getElementById('card-content');
        if (cardContent) cardContent.classList.add('expired-card');

        document.title = `${company.nimi} – LaukaaInfo`;

        const header = document.querySelector('.card-header');
        if (header) {
            header.style.background = '#e2e8f0';
            header.style.color = '#334155';
            header.classList.remove('has-gallery');
        }

        const nameEl = document.getElementById('display-name');
        if (nameEl && !document.getElementById('expired-notice')) {
            const alert = document.createElement('div');
            alert.id = 'expired-notice';
            alert.style.cssText = 'background:#fff3cd;color:#856404;padding:10px;border-radius:8px;margin-bottom:15px;text-align:center;font-weight:bold;border:1px solid #ffeeba;';
            alert.textContent = '⚠️ Yrityksen ilmainen näkyvyys on päättynyt. Näytetään vain nimi, osoite ja kotisivu (jos annettu).';
            nameEl.parentElement.insertBefore(alert, nameEl);
        }

        document.getElementById('display-name').textContent = company.nimi;
        document.getElementById('display-category').textContent = company.kategoria || '';

        const headlineEl = document.getElementById('display-headline');
        if (headlineEl) {
            headlineEl.textContent = '';
            headlineEl.style.display = 'none';
        }

        const descEl = document.getElementById('display-description');
        if (descEl) {
            descEl.textContent = '';
            const descWrap = descEl.closest('.description-block') || descEl.parentElement;
            if (descWrap) descWrap.style.display = 'none';
        }

        const addrElExpired = document.getElementById('display-address');
        if (addrElExpired) addrElExpired.textContent = company.osoite || 'Laukaa';

        const distEl = document.getElementById('display-distance');
        if (distEl) distEl.remove();

        [
            'logo-container',
            'gallery-container',
            'phone-item',
            'google-reviews-item',
            'service-methods-item',
            'service-area-confirmation',
            'card-map',
            'promotional-links-section',
            'video-section',
            'social-links'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const socialIcons = document.getElementById('social-icons');
        if (socialIcons) socialIcons.innerHTML = '';

        const logoContainer = document.getElementById('logo-container');
        if (logoContainer) logoContainer.style.display = 'none';

        const mapContainer = document.getElementById('card-map');
        if (mapContainer) mapContainer.innerHTML = '';

        const websiteItem = document.getElementById('website-item');
        const nettisivu = (company.nettisivu || company.website || '').trim();
        if (websiteItem && nettisivu && nettisivu !== '-') {
            const webLink = document.getElementById('display-website');
            if (webLink && typeof cleanUrl === 'function') {
                const sanitizedUrl = cleanUrl(nettisivu, true);
                const displayUrl = sanitizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                webLink.textContent = displayUrl.length > 25 ? 'www-kotisivulinkki' : displayUrl;
                webLink.href = sanitizedUrl;
                webLink.target = '_blank';
                webLink.rel = 'noopener noreferrer';
                websiteItem.style.display = 'flex';
                setTimeout(() => {
                    if (typeof fitText === 'function') fitText(webLink, 10);
                }, 50);
            }
        } else if (websiteItem) {
            websiteItem.style.display = 'none';
        }

        const infoPanel = document.querySelector('.info-panel');
        if (infoPanel && !document.getElementById('expired-renew-cta')) {
            const cta = document.createElement('div');
            cta.id = 'expired-renew-cta';
            cta.style.cssText = 'margin-top:1.5rem;padding:1.25rem;background:#f0f7ff;border:2px solid #bae6fd;border-radius:16px;text-align:center;';
            cta.innerHTML = `
                <p style="margin:0 0 1rem;color:#334155;line-height:1.5;font-size:0.95rem;">
                    Haluatko palauttaa yrityksen näkyvyyden sivustolla? Valitse sopiva paketti ja lähetä tiedot uudelleen.
                </p>
                <a href="lisaa-yritys.html" class="btn-radar" style="display:inline-block;text-decoration:none;">
                    Palauta näkyvyys – valitse paketti
                </a>
            `;
            infoPanel.appendChild(cta);
        }
    }

    function renderCompanyDetails(company) {
        if (company.is_expired) {
            renderExpiredCompanyCard(company);
            return;
        }

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

        // display-headline was removed in the 2.0 redesign — slogan is now shown in #bc-short-intro
        const headlineEl = document.getElementById('display-headline');
        if (headlineEl) headlineEl.textContent = slogan;
        const descEl = document.getElementById('display-description');
        if (descEl) descEl.textContent = description;
        const addrEl = document.getElementById('display-address');
        if (addrEl) addrEl.textContent = company.osoite || 'Laukaa';

        // Service methods (palvelutapa)
        const tags = (company.tags || '').split(',').map(t => t.trim().toLowerCase());
        const pvtapa = (company.palvelutapa || '').split(',').map(t => t.trim().toLowerCase());
        const combinedTags = [...new Set([...tags, ...pvtapa])];
        
        let serviceIcons = '';
        let serviceTexts = [];
        
        if (combinedTags.includes('toimipiste')) {
            serviceIcons += '🏢 ';
            serviceTexts.push('Toimipiste');
        }
        if (combinedTags.includes('kotikaynti') || combinedTags.includes('kotikäynti')) {
            serviceIcons += '🏠 ';
            serviceTexts.push('Kotikäynti');
        }
        if (combinedTags.includes('etapalvelu') || combinedTags.includes('etäpalvelu')) {
            serviceIcons += '💻 ';
            serviceTexts.push('Etäpalvelu');
        }
        if (combinedTags.includes('toimitus')) {
            serviceIcons += '🚚 ';
            serviceTexts.push('Toimitus');
        }

        if (serviceIcons) {
            document.getElementById('display-name').innerHTML = `${company.nimi} <span style="font-size: 1.2rem; margin-left:10px; font-weight:normal;">${serviceIcons}</span>`;
        }
        
        if (company.service_mode === 'SERVICE_AREA') {
            const badgeHtml = '<span class="service-area-badge">🟠 PALVELEE ALUEELLA</span>';
            document.getElementById('display-name').innerHTML += badgeHtml;
        }

        // Add Palvelutapa row to info panel
        if (serviceTexts.length > 0) {
            const infoPanel = document.querySelector('.info-panel');
            const websiteItem = document.getElementById('website-item');
            
            let serviceItem = document.getElementById('service-methods-item');
            if (!serviceItem) {
                serviceItem = document.createElement('div');
                serviceItem.id = 'service-methods-item';
                serviceItem.className = 'contact-item';
                serviceItem.innerHTML = `
                    <div>
                        <span>Palvelutapa</span>
                        <strong id="display-service-methods"></strong>
                    </div>
                `;
                // Insert after website item
                if (websiteItem) {
                    websiteItem.after(serviceItem);
                } else {
                    // Fallback insertion
                    const socialLinks = document.getElementById('social-links');
                    if (socialLinks) infoPanel.insertBefore(serviceItem, socialLinks);
                }
            }
            document.getElementById('display-service-methods').textContent = serviceTexts.join(', ');
        }

        // Service Area Confirmation (Mobile Service)
        if (company.service_mode === 'SERVICE_AREA') {
            const infoPanel = document.querySelector('.info-panel');
            let confDiv = document.getElementById('service-area-confirmation');
            if (!confDiv) {
                confDiv = document.createElement('div');
                confDiv.id = 'service-area-confirmation';
                confDiv.style.background = '#f0fff4';
                confDiv.style.border = '1px solid #c6f6d5';
                confDiv.style.borderRadius = '8px';
                confDiv.style.padding = '12px';
                confDiv.style.marginTop = '15px';
                confDiv.style.display = 'flex';
                confDiv.style.flexDirection = 'column';
                confDiv.style.gap = '4px';

                confDiv.innerHTML = `
                    <div style="color: #2f855a; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">✔</span> Palvelee myös tällä alueella
                    </div>
                    <div style="font-size: 0.9rem; color: #276749; display: flex; align-items: center; gap: 8px;">
                        <span>🚗</span> Liikkuva palvelu
                    </div>
                    ${company.service_note ? `<div style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 6px; padding-top: 6px; border-top: 1px dotted #ccc;">${company.service_note}</div>` : ''}
                `;
                infoPanel.appendChild(confDiv);
            }
        }

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

                // Add distance badge — attach to the compact address in the new 2.0 header
                const addrShort = document.getElementById('display-address-short');
                const addrFull = document.getElementById('display-address');
                const addressContainer = addrShort ? addrShort.parentElement : (addrFull ? addrFull.parentElement : null);
                let distElem = document.getElementById('display-distance');
                if (!distElem && addressContainer) {
                    distElem = document.createElement('div');
                    distElem.id = 'display-distance';
                    distElem.className = 'distance-badge';
                    addressContainer.appendChild(distElem);
                }
                if (distElem) distElem.innerHTML = `🚗 Etäisyys: ${distText}`;
            } catch (e) { console.error("Error calculating distance", e); }
        }

        // Logo
        const logoImg = document.getElementById('display-logo');
        const logoContainer = document.getElementById('logo-container');
        
        // Reset styles in case of re-render
        logoImg.style.opacity = '1';
        logoImg.style.filter = 'none';
        const existingNoLogo = logoContainer.querySelector('.no-logo-text');
        if (existingNoLogo) existingNoLogo.remove();

        if (company.logo && company.logo !== '-') {
            logoImg.src = company.logo;
            logoContainer.style.display = 'flex';
        } else if (company.media && company.media.length > 0) {
            // Fallback to first image if no logo defined
            logoImg.src = company.media[0].url;
            logoContainer.style.display = 'flex';
        } else {
            // No logo and no media
            logoImg.src = 'logo.png';
            logoImg.style.opacity = '0.15';
            logoImg.style.filter = 'grayscale(1)';
            
            const noLogoText = document.createElement('div');
            noLogoText.className = 'no-logo-text';
            noLogoText.style.cssText = 'position:absolute; bottom:15px; width:100%; text-align:center; font-size:0.8rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:1px; left:0;';
            noLogoText.textContent = 'Ei logoa';
            logoContainer.appendChild(noLogoText);
            
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
            const sanitizedUrl = cleanUrl(company.nettisivu, true);
            const displayUrl = sanitizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''); // Siivotaan protokolla ja loppuslash
            
            if (displayUrl.length > 25) {
                webLink.textContent = 'www-kotisivulinkki';
            } else {
                webLink.textContent = displayUrl;
            }
            
            webLink.href = sanitizedUrl;
            websiteItem.style.display = 'flex';
            
            // Skaalataan vielä varmuuden vuoksi, jos labelikin on liian pitkä kapeilla näytöillä
            setTimeout(() => fitText(webLink, 10), 50);
        } else {
            websiteItem.style.display = 'none';
        }

        // Google Reviews Link
        if (company.google_reviews_url) {
            const infoPanel = document.querySelector('.info-panel');
            let reviewsItem = document.getElementById('google-reviews-item');
            if (!reviewsItem) {
                reviewsItem = document.createElement('div');
                reviewsItem.id = 'google-reviews-item';
                reviewsItem.className = 'contact-item';
                reviewsItem.innerHTML = `
                    <div>
                        <span>Google Arviot</span>
                        <a id="display-reviews" href="${company.google_reviews_url}" target="_blank" rel="noopener noreferrer" style="color:#f4b400; font-weight:bold;">
                            ⭐ Lue ja jätä arvio
                        </a>
                    </div>
                `;
                // Insert after website item or before social icons
                if (websiteItem) {
                    websiteItem.after(reviewsItem);
                } else {
                    const socialLinks = document.getElementById('social-links');
                    if (socialLinks) infoPanel.insertBefore(reviewsItem, socialLinks);
                }
            } else {
                const reviewsLink = reviewsItem.querySelector('#display-reviews');
                reviewsLink.href = company.google_reviews_url;
            }
        }

        // Skaalataan otsikko sopivaksi
        const titleEl = document.getElementById('display-name');
        setTimeout(() => fitText(titleEl, 16), 50);

        // Uudelleenskaalaus kun ikkunaa muutetaan
        window.addEventListener('resize', () => {
            fitText(titleEl, 16);
            if (company.nettisivu && company.nettisivu !== '-') {
                fitText(document.getElementById('display-website'), 10);
            }
        });

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
                let val = cleanUrl(company[key] || '');
                if (val && val !== '-') {

                    const a = document.createElement('a');
                    a.href = val;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.title = info.label;
                    a.style.cssText = 'display:inline-flex; align-items:center; text-decoration:none;';
                    a.innerHTML = `<span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center;">${info.svg}</span>`;
                    socialIcons.appendChild(a);
                    
                    // Merkitään, että tämä some-linkki on jo olemassa
                    company[`has_${key}`] = true;
                }
            });

            // Lisätään puuttuvat some-linkit rikastusdatasta
            if (company.enrichedData && Array.isArray(company.enrichedData.socialLinks)) {
                company.enrichedData.socialLinks.forEach(linkObj => {
                    if (!linkObj || !linkObj.url || !linkObj.platform) return;
                    let platform = linkObj.platform.toLowerCase();
                    if (platform === 'fb') platform = 'facebook';
                    if (platform === 'ig') platform = 'instagram';
                    
                    // Varmistetaan url-muotoilu ja poistetaan mahdolliset virheelliset merkit alusta
                    let url = cleanUrl(linkObj.url.replace(/^\[/, '').split('"')[0].split(']')[0]);
                    
                    if (socialMap[platform] && !company[`has_${platform}`] && url) {
                        const info = socialMap[platform];
                        const a = document.createElement('a');
                        a.href = url;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.title = info.label;
                        a.style.cssText = 'display:inline-flex; align-items:center; text-decoration:none;';
                        a.innerHTML = `<span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center;">${info.svg}</span>`;
                        socialIcons.appendChild(a);
                        company[`has_${platform}`] = true;
                    }
                });
            }

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

            // Share Button
            const shareBtn = document.createElement('button');
            shareBtn.title = 'Jaa yrityskortti';
            shareBtn.style.cssText = 'background:none; border:none; padding:0; cursor:pointer; display:inline-flex; align-items:center; color: var(--primary-blue);';
            shareBtn.innerHTML = `
                <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:var(--light-blue); border-radius:50%; margin-left: 0.5rem;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                    </svg>
                </span>
            `;
            shareBtn.onclick = () => {
                const shareUrl = window.location.href;

                const shareData = {
                    title: document.title,
                    text: slogan || description,
                    url: shareUrl
                };

                if (navigator.share) {
                    navigator.share(shareData).catch(err => console.log('Error sharing:', err));
                } else {
                    // Fallback: Copy to clipboard
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        const originalHtml = shareBtn.innerHTML;
                        shareBtn.innerHTML = '<span style="font-size:0.7rem; color:green; margin-left:0.5rem;">Kopioitu!</span>';
                        setTimeout(() => { shareBtn.innerHTML = originalHtml; }, 2000);
                    }).catch(err => console.error('Could not copy text: ', err));
                }
            };
            socialIcons.appendChild(shareBtn);
        }

        // --- RIKASTUSDATA: Ajanvaraus ja Ota yhteyttä ---
        const actGrid = document.querySelector('.actions-grid');
        const infoPanel = document.querySelector('.info-panel');
        
        const cleanEnrichedUrl = (url) => {
            if (!url) return '';
            return cleanUrl(url.replace(/^\[/, '').split('"')[0].split(']')[0], true);
        };

        if (company.enrichedData) {
            // 1. Ajanvaraus
            const booking = company.enrichedData.booking;
            if (booking && booking.found && booking.url) {
                const bUrl = cleanEnrichedUrl(booking.url);
                if (bUrl) {
                    // Lisätään quick action gridiin, jos mahdollista
                    if (actGrid) {
                        const actBooking = document.createElement('a');
                        actBooking.href = bUrl;
                        actBooking.target = '_blank';
                        actBooking.rel = 'noopener noreferrer';
                        actBooking.className = 'action-card';
                        actBooking.innerHTML = `<span><span class="iconify" data-icon="material-symbols-light:calendar-month-outline"></span></span><strong>Ajanvaraus</strong>`;
                        actGrid.appendChild(actBooking);
                    }
                    
                    // Lisätään info paneeliin
                    if (infoPanel) {
                        const bookingItem = document.createElement('div');
                        bookingItem.className = 'contact-item';
                        bookingItem.innerHTML = `
                            <div>
                                <span>Ajanvaraus</span>
                                <a href="${bUrl}" target="_blank" rel="noopener noreferrer" style="color:#059669; font-weight:bold;">
                                    📅 Varaa aika tästä
                                </a>
                            </div>
                        `;
                        const firstChild = infoPanel.firstChild;
                        if (firstChild) {
                            infoPanel.insertBefore(bookingItem, firstChild);
                        } else {
                            infoPanel.appendChild(bookingItem);
                        }
                    }
                }
            }

            // 2. Ota yhteyttä (Yhteyslomake / Sähköposti)
            const contacts = company.enrichedData.contacts;
            let contactLinkUrl = '';
            
            // Priorisoidaan contactPage sähköpostin yli
            if (contacts && contacts.contactPage && contacts.contactPage !== '-') {
                contactLinkUrl = cleanEnrichedUrl(contacts.contactPage);
            } else if (company.contact_url && company.contact_url !== '-') {
                contactLinkUrl = cleanEnrichedUrl(company.contact_url);
            } else if (contacts && contacts.email && contacts.email !== '-' && !contacts.email.includes('Ei löytynyt')) {
                // Käytetään mailtoa vain jos käyttäjä hyväksyy, mutta aiemman kommentin perusteella
                // sähköposteja haluttiin poistaa. Tehdään kuitenkin fallback, että jos ei ole contactPagea
                // ja haluttiin "email logo, jos mukana on sähköposti", lisätään silti.
                // Ohjeen mukaan korostetaan yhteyslomake-linkkiä.
                contactLinkUrl = `mailto:${contacts.email.trim()}`;
            }

            if (contactLinkUrl) {
                if (actGrid) {
                    const actContact = document.createElement('a');
                    actContact.href = contactLinkUrl;
                    if (!contactLinkUrl.startsWith('mailto:')) {
                        actContact.target = '_blank';
                        actContact.rel = 'noopener noreferrer';
                    }
                    actContact.className = 'action-card';
                    actContact.innerHTML = `<span><span class="iconify" data-icon="material-symbols-light:mail-outline"></span></span><strong>Ota yhteyttä</strong>`;
                    actGrid.appendChild(actContact);
                }
                
                if (infoPanel) {
                    const contactItem = document.createElement('div');
                    contactItem.className = 'contact-item';
                    contactItem.innerHTML = `
                        <div>
                            <span>Ota yhteyttä</span>
                            <a href="${contactLinkUrl}" ${!contactLinkUrl.startsWith('mailto:') ? 'target="_blank" rel="noopener noreferrer"' : ''} style="color:var(--primary-blue); font-weight:bold;">
                                ✉️ ${contactLinkUrl.startsWith('mailto:') ? 'Lähetä sähköpostia' : 'Siirry yhteyslomakkeelle'}
                            </a>
                        </div>
                    `;
                    // Lisätään ennen sosiaalisia linkkejä
                    const socialLinksContainer = document.getElementById('social-links');
                    if (socialLinksContainer) {
                        infoPanel.insertBefore(contactItem, socialLinksContainer);
                    } else {
                        infoPanel.appendChild(contactItem);
                    }
                }
            }
        }

        // --- UUSI: Suosittelemme lähistöllä (Sidebar) ---
        // Haetaan suositukset joko suoraan tai enrichedDatan kautta
        const aiSeoData = company.ai_and_seo 
            || (company.enrichedData && company.enrichedData.ai_and_seo) 
            || window.__LAUKAAINFO_AI_SEO__ 
            || null;

        if (aiSeoData && aiSeoData.nearby_recommendations && aiSeoData.nearby_recommendations.length > 0) {
            const recommendationsDiv = document.createElement('div');
            recommendationsDiv.className = 'contact-item nearby-recommendations';
            recommendationsDiv.style.cssText = 'margin-top: 1.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.8rem;';
            
            let html = `
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom: 0.5rem;">
                    <span class="iconify" data-icon="material-symbols-light:location-on-outline" style="font-size: 1.4rem; color: #f59e0b;"></span>
                    <h3 style="margin:0; font-size: 1.1rem; color: #1e293b;">Suosittelemme lähistöllä</h3>
                </div>
            `;
            
            aiSeoData.nearby_recommendations.forEach(rec => {
                // Rakennetaan linkki, jos id löytyy (käytetään puhdasta nimeä tms.)
                const linkHref = rec.company_id ? (window.location.pathname.includes('/yritys/') ? `../yritys/${rec.company_id.replace('company-', '')}.html` : `yrityskortti.html?id=${rec.company_id.replace('company-', '')}`) : '#';
                
                html += `
                    <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.8rem; transition: transform 0.2s ease, box-shadow 0.2s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.3rem;">
                            ${rec.company_id ? `<a href="${linkHref}" style="font-weight: 700; color: var(--primary-blue); text-decoration: none; font-size: 0.95rem;">${rec.name}</a>` : `<span style="font-weight: 700; color: #334155; font-size: 0.95rem;">${rec.name}</span>`}
                            ${rec.distance_km ? `<span style="font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${rec.distance_km} km</span>` : ''}
                        </div>
                        <div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.4rem;">${rec.reason}</div>
                        ${rec.type ? `<span style="font-size: 0.75rem; font-weight: 600; color: #059669; background: #dcfce7; padding: 2px 8px; border-radius: 50px;">${rec.type}</span>` : ''}
                    </div>
                `;
            });
            
            recommendationsDiv.innerHTML = html;
            
            if (infoPanel) {
                // Lisätään ennen karttaa tai lopuksi
                const cardMap = document.getElementById('card-map');
                if (cardMap) {
                    infoPanel.insertBefore(recommendationsDiv, cardMap);
                } else {
                    infoPanel.appendChild(recommendationsDiv);
                }
            }
        }

        // Promotional Links & Coupon
        const adSection = document.getElementById('promotional-links-section');
        const adList = document.getElementById('ad-links-list');
        const couponDisplay = document.getElementById('coupon-display');
        const couponText = document.getElementById('coupon-text');

        // Check for text coupon (tarjous or coupon field)
        const couponVal = company.tarjous || company.coupon || '';
        if (couponVal && couponVal !== '-' && couponVal !== 'ei' && couponVal !== 'null') {
            adSection.style.display = 'block';
            couponDisplay.style.display = 'block';
            couponText.textContent = couponVal;
        }

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
                });
            }
        }
        
        // Laukaa-syöte direct link
        if (rawId) {
            adSection.style.display = 'block';
            const a = document.createElement('a');
            a.href = `https://laukaainfo.fi/?feed=open&rowid=${rawId}`;
            a.target = '_blank';
            a.className = 'btn-primary';
            a.style.cssText = 'background: #ff9900; padding: 0.6rem 1.2rem; font-size: 0.9rem; border: none;';
            a.textContent = '📱 Laukaa-syöte';
            adList.appendChild(a);
        }

        // Media Gallery (Images & Videos)
        const galleryContainer = document.getElementById('gallery-container');
        const mainImage = document.getElementById('main-image');
        const thumbnails = document.getElementById('image-thumbnails');

        // Helper to extract YouTube ID
        const getYouTubeId = (url) => {
            if (!url) return null;
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        };

        const allMedia = company.media || [];
        const renderMedia = (media) => {
            if (media.type === 'video') {
                mainImage.innerHTML = `<iframe src="${media.url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; border-radius: 20px;"></iframe>`;
            } else {
                mainImage.innerHTML = `<img src="${media.url}" alt="${company.nimi}" style="width:100%; height:100%; object-fit: cover; border-radius: 20px;">`;
            }
        };

        if (allMedia.length > 0) {
            renderMedia(allMedia[0]);
            galleryContainer.style.display = 'block';
            
            // Hide the blue stripe in the header if gallery exists
            const header = document.querySelector('.card-header');
            if (header) header.classList.add('has-gallery');

            if (allMedia.length > 1) {
                thumbnails.innerHTML = '';
                allMedia.forEach(m => {
                    const thumbWrapper = document.createElement('div');
                    thumbWrapper.className = 'thumb-wrapper';
                    thumbWrapper.style.cssText = 'position: relative; cursor: pointer; flex-shrink: 0;';
                    
                    if (m.type === 'video') {
                        const ytId = getYouTubeId(m.url);
                        const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
                        
                        if (ytThumb) {
                            thumbWrapper.innerHTML = `
                                <img src="${ytThumb}" style="width: 120px; height: 90px; object-fit: cover; border-radius: 12px; border: 2px solid transparent;">
                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.8rem; text-shadow: 0 0 10px rgba(0,0,0,0.5);">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                            `;
                        } else {
                            thumbWrapper.innerHTML = `
                                <div style="width: 120px; height: 90px; background: #000; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem;">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                            `;
                        }
                    } else {
                        thumbWrapper.innerHTML = `<img src="${m.url}" style="width: 120px; height: 90px; object-fit: cover; border-radius: 12px; border: 2px solid transparent;">`;
                    }
                    
                    thumbWrapper.onclick = () => renderMedia(m);
                    thumbnails.appendChild(thumbWrapper);
                });
            }
        } else {
            mainImage.innerHTML = `
                <div class="image-placeholder">
                    <img src="logo.png" alt="Ei kuvaa">
                    <div class="placeholder-text">Yrityksen ilmaisprofiilissa ei ole kuvia</div>
                </div>
            `;
            galleryContainer.style.display = 'block';
            thumbnails.innerHTML = '';
        }

        // Hide legacy video section as it's now integrated
        const videoSection = document.getElementById('video-section');
        if (videoSection) videoSection.style.display = 'none';

        // Map & Link
        const mapContainer = document.getElementById('card-map');
        if (company.lat && company.lon && mapContainer) {
            mapContainer.innerHTML = ''; // Clear previous map
            const map = L.map('card-map').setView([company.lat, company.lon], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);
            // Tunnistetaan pakettityyppi (Pro tai Premium)
            const pkgValue = (company.package || company.paketti || company.taso || company.tyyppi || company.type || '').toLowerCase();
            const isPro = pkgValue.includes('pro');
            const isPremiumPkg = pkgValue.includes('premium') || pkgValue.includes('maksu') || pkgValue.includes('paid');

            let iconHtml = '';
            let iconClass = 'custom-marker';
            let iconSize = [24, 24];

            if (isPremiumPkg) {
                iconHtml = `
                    <div class="premium-marker-inner pulsing-premium">
                        <div class="marker-dot"></div>
                    </div>
                `;
                iconClass = 'premium-leaflet-marker';
                iconSize = [26, 26];
            } else if (isPro) {
                iconHtml = `
                    <div class="pro-marker-inner pulsing-pro">
                        <div class="marker-dot"></div>
                    </div>
                `;
                iconClass = 'pro-leaflet-marker';
                iconSize = [26, 26];
            } else {
                // Oletusmarkerin väri kategorian mukaan
                const catColor = (typeof categoryColors !== 'undefined' && categoryColors[company.kategoria]) ? categoryColors[company.kategoria] : '#0056b3';
                iconHtml = `
                    <div style="
                        background-color: ${catColor};
                        width: 20px;
                        height: 20px;
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        border: 2px solid white;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    "></div>
                `;
            }

            const icon = L.divIcon({
                html: iconHtml,
                className: iconClass,
                iconSize: iconSize,
                iconAnchor: [iconSize[0]/2, iconSize[1]],
                popupAnchor: [0, -iconSize[1]]
            });

            L.marker([company.lat, company.lon], { icon: icon }).addTo(map).bindPopup(company.nimi).openPopup();

            // Varmistetaan, että kartta latautuu oikein asettamalla ResizeObserver
            // Tämä pakottaa Leafletin päivittämään koon heti kun säiliön koko muuttuu
            const resizeObserver = new ResizeObserver(() => {
                map.invalidateSize(true);
            });
            resizeObserver.observe(mapContainer);

            requestAnimationFrame(() => {
                map.invalidateSize(true);
            });

            setTimeout(() => {
                map.invalidateSize(true);
            }, 100);

            setTimeout(() => {
                map.invalidateSize(true);
            }, 500);

            // Pidetään myös varalta viiveellä yksi päivitys animointien varalta
            setTimeout(() => map.invalidateSize(true), 1000);
            
            // Tallennetaan map-instanssi globaaliin muuttujaan jotta siihen päästään käsiksi välilehtiä vaihdettaessa
            window.companyMapInstance = map;

            document.getElementById('google-maps-link').href = `https://www.google.com/maps?q=${company.lat},${company.lon}`;
        } else {
            // Fallback for missing coordinates: use karttalinkki or search by name + address
            const mapsLink = document.getElementById('google-maps-link');
            if (company.karttalinkki && company.karttalinkki !== '-') {
                mapsLink.href = company.karttalinkki;
            } else {
                const query = encodeURIComponent(`${company.nimi}, ${company.osoite || 'Laukaa'}`);
                mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
            }
        }

        // ImageKit Promotional Images - checks if image exists and adds as link
        const timestamp = new Date().getTime();

        [1, 2].forEach(index => {
            const baseUrl = `https://ik.imagekit.io/vowzx8znjs/mediazoo/offers/${rawId}_${index}`;

            const tryLoad = (extension) => {
                const imagekitUrl = `${baseUrl}.${extension}?updatedAt=${timestamp}&tr=w-1200,f-auto,q-auto`;
                const tempImg = new Image();
                tempImg.onload = () => {
                    // Image found! Add a link button to ad-links-list
                    if (adList) {
                        adSection.style.display = 'block';
                        const a = document.createElement('a');
                        a.href = imagekitUrl;
                        a.target = '_blank';
                        a.className = 'btn-primary';
                        // Gradient style for offer buttons
                        a.style.cssText = 'background: linear-gradient(135deg, #ff9900 0%, #ff5500 100%); padding: 0.8rem 1.5rem; font-size: 1rem; border: none; box-shadow: 0 4px 15px rgba(255, 85, 0, 0.3); color: white; display: inline-flex; align-items: center; gap: 8px;';
                        a.innerHTML = `<span>🔖</span> Katso tarjouskuva ${index}`;
                        adList.appendChild(a);
                    }
                };
                tempImg.onerror = () => {
                    if (extension === 'png') {
                        tryLoad('jpg'); // Fallback to jpg
                    }
                };
                tempImg.src = imagekitUrl;
            };

            tryLoad('png');
        });

        // RSS Feed / Ajankohtaista logic
        if (company.rss && company.rss !== '-' && company.rss !== '') {
            loadRSS(company.rss);
        }

        // Mobile contact bar (floating, bottom of screen on mobile)
        const mobileBar = document.getElementById('mobile-contact-bar');
        if (mobileBar) {
            mobileBar.innerHTML = '';
            let hasBarActions = false;

            if (company.puhelin && company.puhelin !== '-') {
                const phoneNum = company.puhelin.replace(/[^0-9+]/g, '');
                mobileBar.innerHTML += `<a href="tel:${phoneNum}" style="flex:1;background:#28a745;color:white;padding:12px 10px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700;font-size:0.9rem;">📞 Soita</a>`;
                hasBarActions = true;
            }

            const waNum = (company.whatsapp || company.puhelin || '').replace(/[^0-9]/g, '');
            if (waNum) {
                mobileBar.innerHTML += `<a href="https://wa.me/${waNum}" target="_blank" style="flex:1;background:#25D366;color:white;padding:12px 10px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700;font-size:0.9rem;">💬 WhatsApp</a>`;
                hasBarActions = true;
            }

            const web = company.nettisivu || company.website || '';
            if (web && web !== '-') {
                const webUrl = web.startsWith('http') ? web : `http://${web}`;
                mobileBar.innerHTML += `<a href="${webUrl}" target="_blank" style="flex:1;background:#0056b3;color:white;padding:12px 10px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700;font-size:0.9rem;">🌐 Sivut</a>`;
                hasBarActions = true;
            }

            // Show only on mobile
            if (hasBarActions) {
                const updateBarVisibility = () => {
                    mobileBar.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
                };
                updateBarVisibility();
                window.addEventListener('resize', updateBarVisibility);
            }
        }

        // Suositukset / Recommendations
        loadRecommendations(company);

        // SEO JSON-LD -injektointi
        injectJSONLD(company);

        // --- LAUKAAINFO 2.0 DIGITAL BUSINESS CARD LOGIC ---

        // 1. Tab Switching Setup
        const btnBc = document.getElementById('btn-tab-business-card');
        const btnEp = document.getElementById('btn-tab-extended-profile');
        const btnAi = document.getElementById('btn-tab-ai-info');
        const tabBc = document.getElementById('tab-business-card');
        const tabEp = document.getElementById('tab-extended-profile');
        const tabAi = document.getElementById('tab-ai-info');

        if (btnBc && btnEp && tabBc && tabEp) {
            btnBc.classList.add('active');
            btnEp.classList.remove('active');
            if (btnAi) btnAi.classList.remove('active');
            tabBc.style.display = 'flex';
            tabEp.style.display = 'none';
            if (tabAi) tabAi.style.display = 'none';

            btnBc.onclick = (e) => {
                e.preventDefault();
                btnBc.classList.add('active');
                btnEp.classList.remove('active');
                if (btnAi) btnAi.classList.remove('active');
                tabBc.style.display = 'flex';
                tabEp.style.display = 'none';
                if (tabAi) tabAi.style.display = 'none';
                if (window.companyMapInstance) {
                    setTimeout(() => window.companyMapInstance.invalidateSize(true), 50);
                }
            };
            btnEp.onclick = (e) => {
                e.preventDefault();
                btnEp.classList.add('active');
                btnBc.classList.remove('active');
                if (btnAi) btnAi.classList.remove('active');
                tabBc.style.display = 'none';
                tabEp.style.display = 'block';
                if (tabAi) tabAi.style.display = 'none';
                if (window.companyMapInstance) {
                    setTimeout(() => window.companyMapInstance.invalidateSize(true), 50);
                }
            };
            if (btnAi) {
                btnAi.onclick = (e) => {
                    e.preventDefault();
                    btnAi.classList.add('active');
                    btnBc.classList.remove('active');
                    btnEp.classList.remove('active');
                    tabBc.style.display = 'none';
                    tabEp.style.display = 'none';
                    if (tabAi) tabAi.style.display = 'block';
                };
            }
        }

        // 2. Cover Banner
        const coverPhoto = document.getElementById('bc-cover-photo');
        if (coverPhoto) {
            coverPhoto.style.display = 'flex';
            if (company.media && company.media.length > 0) {
                coverPhoto.style.backgroundImage = `url('${company.media[0].url}')`;
                coverPhoto.classList.add('has-photo');
            } else {
                coverPhoto.style.backgroundImage = 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)';
                coverPhoto.classList.remove('has-photo');
            }
        }

        // 3. Shortened Address & Mock High-Quality Rating in Modern Header Banner
        const displayAddressShort = document.getElementById('display-address-short');
        const displayPostalCity = document.getElementById('display-postal-city');
        if (displayAddressShort) {
            const fullAddress = company.osoite || 'Laukaa';
            const parts = fullAddress.split(',');
            displayAddressShort.textContent = parts[0].trim();
            if (displayPostalCity) {
                if (parts.length > 1) {
                    displayPostalCity.textContent = parts[1].trim();
                    displayPostalCity.style.display = 'block';
                } else {
                    displayPostalCity.style.display = 'none';
                }
            }
        }

        const ratingStars = document.getElementById('display-rating-stars');
        if (ratingStars) {
            if (company.google_reviews_url && company.google_reviews_url !== '-') {
                ratingStars.style.display = 'inline-flex';
                ratingStars.href = company.google_reviews_url;
            } else {
                ratingStars.style.display = 'none';
            }
        }

        // 4. Quick Action Grid Bindings
        const actCall = document.getElementById('act-call');
        const actRoute = document.getElementById('act-route');
        const actWeb = document.getElementById('act-web');
        const actWa = document.getElementById('act-wa');

        if (actCall) {
            if (company.puhelin && company.puhelin !== '-') {
                actCall.href = `tel:${company.puhelin.replace(/[^0-9+]/g, '')}`;
                actCall.style.display = 'flex';
            } else {
                actCall.style.display = 'none';
            }
        }

        if (actWa) {
            const waField = (company.whatsapp || '').trim();
            let waHref = '';
            if (waField && waField !== '-' && waField !== 'false' && waField !== '0') {
                if (waField.startsWith('http')) {
                    waHref = waField;
                } else if (waField === 'true') {
                    const waNum = (company.puhelin || '').replace(/[^0-9]/g, '');
                    if (waNum) waHref = `https://wa.me/${waNum}`;
                } else {
                    const waNum = waField.replace(/[^0-9]/g, '');
                    if (waNum) waHref = `https://wa.me/${waNum}`;
                }
            } else if (company.puhelin && company.puhelin !== '-') {
                const waNum = company.puhelin.replace(/[^0-9]/g, '');
                if (waNum) waHref = `https://wa.me/${waNum}`;
            }

            if (waHref) {
                actWa.href = waHref;
                actWa.style.display = 'flex';
            } else {
                actWa.style.display = 'none';
            }
        }

        if (actRoute) {
            if (company.lat && company.lon) {
                actRoute.href = `https://www.google.com/maps?q=${company.lat},${company.lon}`;
            } else if (company.karttalinkki && company.karttalinkki !== '-') {
                actRoute.href = company.karttalinkki;
            } else {
                const query = encodeURIComponent(`${company.nimi}, ${company.osoite || 'Laukaa'}`);
                actRoute.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
            }
        }

        if (actWeb) {
            if (company.nettisivu && company.nettisivu !== '-') {
                actWeb.href = cleanUrl(company.nettisivu, true);
                actWeb.style.display = 'flex';
            } else {
                actWeb.style.display = 'none';
            }
        }

        // 5. Dynamic Capability Badges
        const capBlock = document.getElementById('bc-capabilities');
        const capList = document.getElementById('bc-capabilities-list');
        if (capBlock && capList) {
            const rawTags = (company.tags || '').split(',').map(t => t.trim()).filter(t => t.length > 0 && t !== '-');
            const rawPalvelu = (company.palvelutapa || '').split(',').map(t => t.trim()).filter(t => t.length > 0 && t !== '-');
            const allBadges = [...new Set([...rawTags, ...rawPalvelu])];

            if (allBadges.length > 0) {
                capList.innerHTML = '';
                allBadges.forEach(badge => {
                    const span = document.createElement('span');
                    span.className = 'cap-badge';
                    let emoji = '⚡';
                    const bLower = badge.toLowerCase();
                    if (bLower.includes('ruoka') || bLower.includes('ravintola') || bLower.includes('kahvila')) emoji = '🍴';
                    else if (bLower.includes('mökk') || bLower.includes('majoit')) emoji = '🏡';
                    else if (bLower.includes('auto') || bLower.includes('huolto') || bLower.includes('renka')) emoji = '🚗';
                    else if (bLower.includes('kauneus') || bLower.includes('kampa') || bLower.includes('partur')) emoji = '✂';
                    else if (bLower.includes('terveys') || bLower.includes('hiero') || bLower.includes('lääk')) emoji = '⚕';
                    else if (bLower.includes('toimipiste')) emoji = '🏢';
                    else if (bLower.includes('kotikäynti')) emoji = '🏠';
                    else if (bLower.includes('etäpalvelu')) emoji = '💻';
                    else if (bLower.includes('toimitus')) emoji = '🚚';
                    
                    span.innerHTML = `<span>${emoji}</span> ${badge}`;
                    span.style.cursor = 'pointer';
                    span.dataset.tag = badge;
                    capList.appendChild(span);
                });

                // Single delegated click listener on the container
                capList.addEventListener('click', function(e) {
                    const badge = e.target.closest('.cap-badge');
                    if (badge && badge.dataset.tag) {
                        window.openTagModal(badge.dataset.tag);
                    }
                });

                capBlock.style.display = 'block';
            } else {
                capBlock.style.display = 'none';
            }
        }

        // 6. Short Slogan / Slogan Intro block
        const introBlock = document.getElementById('bc-intro-block');
        const shortIntro = document.getElementById('bc-short-intro');
        if (introBlock && shortIntro) {
            if (slogan) {
                shortIntro.textContent = `”${slogan}”`;
                introBlock.style.display = 'block';
            } else {
                introBlock.style.display = 'none';
            }
        }

        // 7. Status announcement banner (Yrittäjän päivitys)
        const bcStatusBanner = document.getElementById('bc-status-banner');
        const bcStatusText = document.getElementById('bc-status-text');
        if (bcStatusBanner && bcStatusText) {
            const statusMsg = company.status || company.ilmoitus || company.announcement;
            if (statusMsg && statusMsg !== '-') {
                bcStatusText.textContent = statusMsg;
                bcStatusBanner.style.display = 'block';
            } else {
                bcStatusBanner.style.display = 'none';
            }
        }

        // 8. Ajankohtaista news block (Yrittäjän päivitys)
        const bcNewsBlock = document.getElementById('bc-news-block');
        const bcNewsTitle = document.getElementById('bc-news-title');
        const bcNewsDate = document.getElementById('bc-news-date');
        const bcNewsText = document.getElementById('bc-news-text');
        const bcNewsLink = document.getElementById('bc-news-link');
        
        if (bcNewsBlock && bcNewsTitle && bcNewsDate && bcNewsText && bcNewsLink) {
            if (company.news_title && company.news_title !== '-') {
                bcNewsTitle.textContent = company.news_title;
                bcNewsDate.textContent = company.news_date || '';
                bcNewsText.textContent = company.news_text || '';
                if (company.news_link && company.news_link !== '-') {
                    bcNewsLink.href = company.news_link;
                    bcNewsLink.style.display = 'inline-flex';
                } else {
                    bcNewsLink.style.display = 'none';
                }
                bcNewsBlock.style.display = 'block';
            } else {
                bcNewsBlock.style.display = 'none';
            }
        }

        // 9. QR code generation
        const qrImg = document.getElementById('bc-qr-code');
        const printQrImg = document.getElementById('print-qr-image');
        const downloadQrLink = document.getElementById('btn-download-qr');
        
        if (qrImg) {
            const currentUrl = window.location.href;
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentUrl)}`;
            qrImg.src = qrApiUrl;
            if (printQrImg) {
                printQrImg.src = qrApiUrl;
            }
            if (downloadQrLink) {
                downloadQrLink.href = qrApiUrl;
                downloadQrLink.target = '_blank';
            }
            
            const printCardLink = document.getElementById('print-card-link');
            if (printCardLink) {
                printCardLink.href = currentUrl;
                printCardLink.textContent = "Yrityskortti-linkki";
            }
        }

        // 10. Jaa digitaalinen käyntikortti Button
        const btnShare = document.getElementById('btn-share-link');
        if (btnShare) {
            btnShare.onclick = async (e) => {
                e.preventDefault();
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: `${company.nimi} – Digitaalinen Käyntikortti`,
                            text: `Tutustu yritykseen ${company.nimi} LaukaaInfo-palvelussa!`,
                            url: window.location.href
                        });
                    } catch (err) {
                        console.log('Share failed/cancelled:', err);
                    }
                } else {
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        const originalText = btnShare.innerHTML;
                        btnShare.innerHTML = '<span>✔</span> Kopioitu leikepöydälle!';
                        btnShare.style.backgroundColor = '#16a34a';
                        btnShare.style.color = 'white';
                        setTimeout(() => {
                            btnShare.innerHTML = originalText;
                            btnShare.style.backgroundColor = '';
                            btnShare.style.color = '';
                        }, 2000);
                    } catch (err) {
                        alert('Kopioi linkki: ' + window.location.href);
                    }
                }
            };
        }

        // 11. Tallenna yhteystiedot vCard Button
        const btnSaveContact = document.getElementById('btn-save-contact');
        if (btnSaveContact) {
            btnSaveContact.onclick = (e) => {
                e.preventDefault();
                const vcard = [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `FN:${company.nimi}`,
                    `ORG:${company.nimi}`,
                    `TITLE:${company.kategoria || ''}`,
                    company.puhelin && company.puhelin !== '-' ? `TEL;TYPE=WORK,VOICE:${company.puhelin}` : '',
                    company.osoite && company.osoite !== '-' ? `ADR;TYPE=WORK:;;${company.osoite};;;;` : '',
                    company.nettisivu && company.nettisivu !== '-' ? `URL;TYPE=WORK:${cleanUrl(company.nettisivu, true)}` : '',
                    `NOTE:LaukaaInfo Digitaalinen Käyntikortti - ${slogan || ''}`,
                    'END:VCARD'
                ].filter(line => line.length > 0).join('\r\n');

                const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${slugify(company.nimi)}.vcf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }

        // 12. Tulosta PDF-esite Button & print template setup
        const printLogo = document.getElementById('print-logo');
        const printName = document.getElementById('print-name');
        const printCategory = document.getElementById('print-category');
        const printPhone = document.getElementById('print-phone');
        const printPhoneRow = document.getElementById('print-phone-row');
        const printAddress = document.getElementById('print-address');
        const printAddressRow = document.getElementById('print-address-row');
        const printWebsite = document.getElementById('print-website');
        const printWebsiteRow = document.getElementById('print-website-row');
        const printIntro = document.getElementById('print-intro');
        const printIntroRow = document.getElementById('print-intro-row');

        if (printName) printName.textContent = company.nimi;
        if (printCategory) printCategory.textContent = company.kategoria;
        
        if (printPhone) {
            if (company.puhelin && company.puhelin !== '-') {
                printPhone.textContent = company.puhelin;
                printPhoneRow.style.display = 'block';
            } else {
                printPhoneRow.style.display = 'none';
            }
        }
        if (printAddress) {
            if (company.osoite && company.osoite !== '-') {
                printAddress.textContent = company.osoite;
                printAddressRow.style.display = 'block';
            } else {
                printAddressRow.style.display = 'none';
            }
        }
        if (printWebsite) {
            if (company.nettisivu && company.nettisivu !== '-') {
                const websiteUrl = cleanUrl(company.nettisivu, true);
                printWebsite.textContent = company.nettisivu;
                printWebsite.href = websiteUrl;
                printWebsiteRow.style.display = 'block';
            } else {
                printWebsiteRow.style.display = 'none';
            }
        }
        if (printIntro) {
            if (slogan) {
                printIntro.textContent = `”${slogan}”`;
                printIntroRow.style.display = 'block';
            } else {
                printIntroRow.style.display = 'none';
            }
        }
        if (printLogo) {
            if (company.logo && company.logo !== '-') {
                printLogo.src = company.logo;
                printLogo.style.display = 'block';
            } else if (company.media && company.media.length > 0) {
                printLogo.src = company.media[0].url;
                printLogo.style.display = 'block';
            } else {
                printLogo.style.display = 'none';
            }
        }

        const btnPrint = document.getElementById('btn-print-pdf');
        if (btnPrint) {
            btnPrint.onclick = (e) => {
                e.preventDefault();
                window.print();
            };
        }

        // 13. Pienet Vinkit
        loadYritysVinkit(company.id);

        // 14. AI & SEO -lisädata (ai_and_seo)
        renderAiAndSeo(company);

        // 15. Kohtaamiset integraatio
        renderKohtaamisetForYritys(company);
    }

    async function renderKohtaamisetForYritys(company) {
        if (typeof fetchEncounters !== 'function' || typeof categories === 'undefined') return;
        try {
            const allEncounters = await fetchEncounters();
            const coNameLower = (company.nimi || '').toLowerCase();
            const coCityLower = (company.osoite || '').toLowerCase();
            const related = allEncounters.filter(function(ad) {
                var loc = (ad.location || '').toLowerCase();
                var desc = (ad.description || '').toLowerCase();
                var title = (ad.title || '').toLowerCase();
                return desc.includes(coNameLower) || title.includes(coNameLower) ||
                       (coCityLower && loc.length > 3 && coCityLower.includes(loc));
            }).slice(0, 5);
            if (related.length > 0) {
                var container = document.getElementById('tab-business-card');
                if (!container) return;
                var box = document.createElement('div');
                box.className = 'bc-block';
                box.style.marginTop = '1.5rem';
                var cardsHtml = '';
                related.forEach(function(ad) {
                    var cat = categories[ad.type] || categories['need_help'];
                    cardsHtml += '<a href="ilmoituskortti.html?id=' + ad.id + '" style="display:block;text-decoration:none;color:inherit;background:#f8fafc;border-radius:12px;padding:1rem;border-left:4px solid ' + cat.color + ';transition:background 0.2s;margin-bottom:0.75rem;">'
                        + '<div style="font-size:0.75rem;font-weight:800;text-transform:uppercase;color:' + cat.color + ';margin-bottom:0.3rem;">' + cat.icon + ' ' + cat.title + '</div>'
                        + '<h3 style="font-size:1.05rem;color:var(--secondary-blue);margin:0 0 0.4rem 0;">' + ad.title + '</h3>'
                        + '<div style="font-size:0.85rem;font-weight:600;color:var(--dark-text);">' + (ad.price_info || '') + '</div>'
                        + '</a>';
                });
                box.innerHTML = '<h2 style="font-size:1.3rem;color:var(--secondary-blue);margin-top:0;margin-bottom:0.75rem;">Laukaan Kohtaamispaikka</h2>'
                    + '<p style="font-size:0.9rem;color:var(--light-text);margin-bottom:1rem;">T\u00e4h\u00e4n yritykseen liittyv\u00e4t avoimet haut:</p>'
                    + cardsHtml;
                container.appendChild(box);
            }
        } catch(e) {
            console.error('Kohtaamiset error:', e);
        }
    }

    /**
     * Lataa yrityskohtaiset vinkit vinkit/yritysvinkit.json -tiedostosta
     */
    async function loadYritysVinkit(companyId) {
        try {
            const rawId = String(companyId).replace('company-', '');
            const resp = await fetch('vinkit/yritysvinkit.json?v=' + Date.now());
            if (!resp.ok) return;
            const data = await resp.json();
            
            // Kokeillaan löytää vinkit joko "company-XXX" tai "XXX" avaimella
            let vinkitData = data[companyId] || data[rawId] || null;
            
            const section = document.getElementById('bc-tips-section');
            const list = document.getElementById('bc-tips-list');
            const header = document.getElementById('bc-tips-header');
            
            if (!vinkitData || !vinkitData.vinkit || vinkitData.vinkit.length === 0) {
                if (section) section.style.display = 'none';
                return;
            }
            
            if (header && vinkitData.otsikko) {
                header.innerHTML = `💡 ${vinkitData.otsikko}`;
            }
            
            if (list) {
                list.innerHTML = '';
                vinkitData.vinkit.forEach(vinkki => {
                    const a = document.createElement('a');
                    a.href = vinkki.linkki;
                    a.className = 'bc-tip-item';
                    
                    // Sisäiset linkit avautuu samassa, ulkoiset uudessa välilehdessä
                    if (vinkki.tyyppi === 'ulkoinen') {
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                    }
                    
                    const badgeHtml = vinkki.badge ? `<span class="bc-tip-badge">${vinkki.badge}</span>` : '';
                    
                    a.innerHTML = `
                        <div class="bc-tip-icon">${vinkki.ikoni || '💡'}</div>
                        <div class="bc-tip-content">
                            <div class="bc-tip-title">${vinkki.nimi} ${badgeHtml}</div>
                            <p class="bc-tip-desc">${vinkki.kuvaus}</p>
                        </div>
                        <div class="bc-tip-arrow">
                            <span class="iconify" data-icon="material-symbols-light:arrow-forward-ios"></span>
                        </div>
                    `;
                    list.appendChild(a);
                });
            }
            
            if (section) {
                section.style.display = 'block';
            }
        } catch(e) {
            console.warn('Virhe ladattaessa yritysvinkkejä:', e);
        }
    }

    /**
     * Injektoi yrityksen tiedot JSON-LD Schema (LocalBusiness) -muodossa sivun headiin.
     */
    function injectJSONLD(company) {
        try {
            // Poistetaan vanhat JSON-LD -scriptit (estää duplikaatit)
            ['company-jsonld', 'company-faq-jsonld'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });

            // Puhdistetaan kuvausteksti
            const esittely = company.esittely || '';
            const mainoslause = company.mainoslause || '';
            const fullContent = esittely || mainoslause;
            const baseDescription = fullContent.replaceAll('@@', '').replace(/#[a-zA-Z0-9åäöÅÄÖ]+/g, '').replace(/\s\s+/g, ' ').trim();

            // AI-yhteenveto (ai_and_seo) käytetään ensisijaisena kuvauksena jos saatavilla
            const aiSeo = company.ai_and_seo || (company.enrichedData && company.enrichedData.ai_and_seo) || null;
            const description = (aiSeo && aiSeo.ai_summary) ? aiSeo.ai_summary : (baseDescription || (company.nimi + ' - Laukaan yritys.'));

            const schema = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                "@id": `https://laukaainfo.fi/yrityskortti.html?id=${company.id}`,
                "name": company.nimi,
                "description": description,
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": company.osoite || 'Laukaa',
                    "addressLocality": "Laukaa",
                    "addressCountry": "FI"
                }
            };

            if (company.puhelin && company.puhelin !== '-') {
                schema.telephone = company.puhelin;
            }
            if (company.nettisivu && company.nettisivu !== '-') {
                let webUrl = company.nettisivu.trim();
                if (!webUrl.startsWith('http')) webUrl = 'https://' + webUrl;
                schema.url = webUrl;
            }
            if (company.logo && company.logo !== '-') {
                schema.logo = company.logo;
            } else if (company.media && company.media.length > 0 && company.media[0].url) {
                schema.logo = company.media[0].url;
            }
            if (company.lat && company.lon) {
                schema.geo = {
                    "@type": "GeoCoordinates",
                    "latitude": parseFloat(company.lat),
                    "longitude": parseFloat(company.lon)
                };
            }

            // Palvelualueet (areaServed) ai_and_seo:sta
            if (aiSeo && aiSeo.service_areas_text && aiSeo.service_areas_text.length > 0) {
                schema.areaServed = aiSeo.service_areas_text;
            }

            // Sosiaaliset mediat (sameAs)
            const sameAs = [];
            ['facebook', 'instagram', 'linkedin', 'tiktok'].forEach(key => {
                let val = company[key] || '';
                if (val && val !== '-') {
                    val = val.trim();
                    if (!val.startsWith('http')) val = 'https://' + val;
                    sameAs.push(val);
                }
            });
            if (sameAs.length > 0) schema.sameAs = sameAs;

            const script = document.createElement('script');
            script.id = 'company-jsonld';
            script.type = 'application/ld+json';
            script.text = JSON.stringify(schema, null, 2);
            document.head.appendChild(script);

            // FAQ Schema (erillinen FAQPage -schema, jos FAQ-dataa on)
            if (aiSeo && aiSeo.faq && aiSeo.faq.length > 0) {
                const faqSchema = {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": aiSeo.faq.map(item => ({
                        "@type": "Question",
                        "name": item.question,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": item.answer
                        }
                    }))
                };
                const faqScript = document.createElement('script');
                faqScript.id = 'company-faq-jsonld';
                faqScript.type = 'application/ld+json';
                faqScript.text = JSON.stringify(faqSchema, null, 2);
                document.head.appendChild(faqScript);
            }

            console.log('✓ Injektoitu JSON-LD -skeema yritykselle:', company.nimi, aiSeo ? '(+ ai_and_seo)' : '');
        } catch (e) {
            console.error('Virhe JSON-LD -injektoinnissa:', e);
        }
    }

    /**
     * Renderöi AI & SEO -lisädata näkyväksi yrityskorttiin:
     * - AI-yhteenveto -> digitaalinen käyntikortti -välilehti
     * - FAQ -> laaja esittelyprofiili -välilehti
     * - Kohderyhmät / palvelualueet -> sivun meta description
     * - Tekoälykooste -välilehti
     */
    function renderAiAndSeo(company) {
        // ai_and_seo voi tulla joko suoraan company-objektista, enrichedDatan kautta,
        // tai staattisille premium-sivuille generate_premium.js:n injektoimana window-muuttujana
        const aiSeo = company.ai_and_seo
            || (company.enrichedData && company.enrichedData.ai_and_seo)
            || window.__LAUKAAINFO_AI_SEO__
            || null;
        if (!aiSeo) {
            const aiTabBtn = document.getElementById('btn-tab-ai-info');
            if (aiTabBtn) aiTabBtn.style.display = 'none';
            return;
        }

        // 1. AI-yhteenveto digitaaliseen käyntikorttiin (bc-ai-summary-block)
        const aiSummaryBlock = document.getElementById('bc-ai-summary-block');
        const aiSummaryText = document.getElementById('bc-ai-summary-text');
        if (aiSummaryBlock && aiSummaryText && aiSeo.ai_summary) {
            aiSummaryText.textContent = aiSeo.ai_summary;
            aiSummaryBlock.style.display = 'block';
        }

        // --- Lisätiedot-välilehti (Tab 3) ---

        // Kooste / yhteenveto
        const aiSummaryFull = document.getElementById('display-ai-summary-full');
        if (aiSummaryFull && aiSeo.ai_summary) {
            aiSummaryFull.textContent = aiSeo.ai_summary;
        }

        // Kohderyhmät
        const aiTargetAudienceSection = document.getElementById('ai-target-audience-section');
        const aiTargetAudience = document.getElementById('display-ai-target-audience');
        if (aiTargetAudienceSection && aiTargetAudience && aiSeo.target_audiences && aiSeo.target_audiences.length > 0) {
            aiTargetAudienceSection.style.display = 'block';
            aiTargetAudience.innerHTML = '<ul style="margin:0; padding-left:20px; line-height:1.9; color:#475569;">' +
                aiSeo.target_audiences.map(item => `<li>${item}</li>`).join('') +
                '</ul>';
        }

        // Palvelualueet
        const aiServiceAreasSection = document.getElementById('ai-service-areas-section');
        const aiServiceAreas = document.getElementById('display-ai-service-areas');
        if (aiServiceAreasSection && aiServiceAreas && aiSeo.service_areas_text && aiSeo.service_areas_text.length > 0) {
            aiServiceAreasSection.style.display = 'block';
            aiServiceAreas.innerHTML = aiSeo.service_areas_text.map(area =>
                `<span style="background:#f0fdf4; color:#166534; padding:5px 14px; border-radius:50px; font-size:0.9rem; font-weight:600; border:1px solid #bbf7d0;">📍 ${area}</span>`
            ).join('');
        }

        // Avainsanat
        const aiKeywordsSection = document.getElementById('ai-keywords-section');
        const aiKeywords = document.getElementById('display-ai-keywords');
        if (aiKeywordsSection && aiKeywords && aiSeo.keywords && aiSeo.keywords.length > 0) {
            aiKeywordsSection.style.display = 'block';
            aiKeywords.innerHTML = aiSeo.keywords.map(kw =>
                `<span style="background:var(--light-blue); color:var(--secondary-blue); padding:5px 12px; border-radius:50px; font-size:0.9rem; font-weight:600; border:1px solid #bae6fd;">#${kw}</span>`
            ).join('');
        }

        // Paikallinen konteksti, tarina ja tägit
        const aiLocalCtxSection = document.getElementById('ai-local-context-section');
        const aiLocalCtx = document.getElementById('display-ai-local-context');
        if (aiLocalCtxSection && aiLocalCtx && aiSeo) {
            const lc = aiSeo.local_context || {};
            const hasLandmarks = lc.nearby_landmarks && lc.nearby_landmarks.length > 0;
            const hasText = lc.text_description;
            const hasStory = lc.local_story;
            const hasAtmosphere = aiSeo.atmosphere_tags && aiSeo.atmosphere_tags.length > 0;
            const hasValues = aiSeo.values_tags && aiSeo.values_tags.length > 0;

            if (hasLandmarks || hasText || hasStory || hasAtmosphere || hasValues) {
                aiLocalCtxSection.style.display = 'block';
                let html = '';

                // 1. Paikallinen tarina (Local Story) korostetusti
                if (hasStory) {
                    html += `<div style="margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0;">
                                <h4 style="font-size: 1rem; color: #0f172a; margin: 0 0 0.5rem 0; display:flex; align-items:center; gap:0.4rem;">
                                    <span class="iconify" data-icon="material-symbols-light:history-edu-outline" style="color:var(--primary-blue);"></span> Paikallinen tarina
                                </h4>
                                <p style="margin:0; color:#334155; line-height:1.7; font-style: italic;">"${lc.local_story}"</p>
                             </div>`;
                }

                // 2. Sijainti ja maamerkit
                if (hasText) html += `<p style="margin:0 0 1rem; color:#475569; line-height:1.7;">${lc.text_description}</p>`;
                if (hasLandmarks) {
                    html += '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:1.5rem;">' +
                        lc.nearby_landmarks.map(lm =>
                            `<span style="background:#fef9c3; color:#854d0e; padding:4px 12px; border-radius:50px; font-size:0.85rem; font-weight:600; border:1px solid #fde68a;">📍 ${lm}</span>`
                        ).join('') + '</div>';
                }

                // 3. Tägit (Tunnelma & Arvot)
                if (hasAtmosphere || hasValues) {
                    html += `<div style="display:flex; flex-direction:column; gap:0.8rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">`;
                    
                    if (hasAtmosphere) {
                        html += `<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                    <span style="font-size:0.85rem; color:#64748b; font-weight:bold; margin-right:4px;">Tunnelma:</span>` +
                            aiSeo.atmosphere_tags.map(tag =>
                                `<span style="background:#f3e8ff; color:#6b21a8; padding:3px 10px; border-radius:4px; font-size:0.8rem; font-weight:600; border:1px solid #e9d5ff;">🎭 ${tag}</span>`
                            ).join('') + `</div>`;
                    }
                    
                    if (hasValues) {
                        html += `<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                    <span style="font-size:0.85rem; color:#64748b; font-weight:bold; margin-right:4px;">Arvot:</span>` +
                            aiSeo.values_tags.map(tag =>
                                `<span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:4px; font-size:0.8rem; font-weight:600; border:1px solid #bbf7d0;">🌿 ${tag}</span>`
                            ).join('') + `</div>`;
                    }
                    
                    html += `</div>`;
                }

                aiLocalCtx.innerHTML = html;
            }
        }

        // FAQ Lisätiedot-välilehdellä
        const aiFaqSection = document.getElementById('ai-faq-section');
        const aiFaqList = document.getElementById('display-ai-faq');
        if (aiFaqSection && aiFaqList && aiSeo.faq && aiSeo.faq.length > 0) {
            aiFaqSection.style.display = 'block';
            aiFaqList.innerHTML = '';
            aiSeo.faq.forEach((item, i) => {
                const details = document.createElement('details');
                details.className = 'bc-faq-item';
                if (i === 0) details.open = true;
                details.innerHTML = `
                    <summary class="bc-faq-question">
                        <span class="bc-faq-icon"><span class="iconify" data-icon="material-symbols-light:help-outline" style="font-size:1.2em;"></span></span>
                        ${item.question}
                    </summary>
                    <div class="bc-faq-answer">${item.answer}</div>
                `;
                aiFaqList.appendChild(details);
            });
        }

        // 2. FAQ myös laajaan esittelyprofiiliin (bc-faq-section)
        const faqSection = document.getElementById('bc-faq-section');
        if (faqSection && aiSeo.faq && aiSeo.faq.length > 0) {
            faqSection.style.display = 'block';
            const faqList = faqSection.querySelector('.bc-faq-list');
            if (faqList) {
                faqList.innerHTML = '';
                aiSeo.faq.forEach((item, i) => {
                    const details = document.createElement('details');
                    details.className = 'bc-faq-item';
                    if (i === 0) details.open = true;
                    details.innerHTML = `
                        <summary class="bc-faq-question">
                            <span class="bc-faq-icon"><span class="iconify" data-icon="material-symbols-light:help-outline" style="font-size:1.2em;"></span></span>
                            ${item.question}
                        </summary>
                        <div class="bc-faq-answer">${item.answer}</div>
                    `;
                    faqList.appendChild(details);
                });
            }
        }


        // 3. Päivitetään meta description hakukoneoptimoinnin parantamiseksi
        if (aiSeo.ai_summary) {
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.name = 'description';
                document.head.appendChild(metaDesc);
            }
            metaDesc.content = aiSeo.ai_summary;
        }
    }

    /**
     * Lataa ja näyttää suositukset yritykselle perustuen paired_with_by_context -logiikkaan.
     */
    async function loadRecommendations(currentCompany) {
        const section = document.getElementById('recommendations-section');
        const container = document.getElementById('recommendations-container');
        if (!section || !container) return;

        try {
            console.log('--- loadRecommendations ---');
            console.log('currentCompany:', currentCompany);
            console.log('currentCompany.id:', currentCompany.id);

            const isDist = window.location.pathname.includes('/yritys/');
            const prefix = isDist ? '../' : './';
            
            // Haetaan kaikki yritykset ja niiden profilointidata
            const companiesRes = await fetch(prefix + 'companies_data.json?t=' + Date.now());
            if (!companiesRes.ok) return;
            const allCompanies = await companiesRes.json();
            
            const metadataRes = await fetch(prefix + 'profiling/metadata.json?t=' + Date.now());
            if (!metadataRes.ok) return;
            const metadata = await metadataRes.json();
            
            let allProfiling = {};
            const profPromises = metadata.files.map(file => 
                fetch(prefix + 'profiling/' + file + '?t=' + Date.now()).then(r => r.ok ? r.json() : {})
            );
            const profilesArray = await Promise.all(profPromises);
            profilesArray.forEach(p => Object.assign(allProfiling, p));

            console.log('Kaikki profilointidata ladattu:', Object.keys(allProfiling).length, 'kohdetta');
            
            let currentProfiling = allProfiling[currentCompany.id];
            
            if (!currentProfiling) {
                console.warn('Profilointidataa ei löytynyt yritykselle ID:llä:', currentCompany.id);
                
                // Kokeillaan etsiä:
                // 1. ID ilman "company-" etuliitettä tai sen kanssa
                // 2. Nimen perusteella (esim. tertta vs company-270)
                const targetId = String(currentCompany.id).replace('company-', '');
                
                const altId = Object.keys(allProfiling).find(id => {
                    const cleanId = id.replace('company-', '');
                    if (cleanId === targetId) return true;

                    const p = allProfiling[id];
                    const pNimi = (p.name || p.core?.nimi || '').toLowerCase().trim();
                    const cNimi = (currentCompany.nimi || '').toLowerCase().trim();
                    return pNimi === cNimi || slugify(pNimi) === slugify(cNimi);
                });
                
                if (altId) {
                    console.log('Löytyi vaihtoehtoinen ID profiloinnista:', altId);
                    currentProfiling = allProfiling[altId];
                }
            }

            if (!currentProfiling || !currentProfiling.paired_with_by_context) {
                console.log('Ei paired_with_by_context dataa yritykselle:', currentCompany.id);
                return;
            }

            const getCap = (c, prof) => {
                if (!prof || !prof.categories) return 0;
                // Etsitään kapasiteettia eri kategorioista
                const cats = ['events_and_celebrations', 'business_events', 'funerals_and_memorials'];
                for (const cat of cats) {
                    const data = prof.categories[cat];
                    if (data && (data.capacity_max > 0 || data.seated_capacity > 0)) return data.capacity_max || data.seated_capacity;
                }
                return 0;
            };

            const currentCap = getCap(currentCompany, currentProfiling);
            const recommendations = [];

            const pairedWith = currentProfiling.paired_with_by_context || {};
            const contexts = Object.keys(pairedWith);
            
            console.log('Etsitään suosituksia yritykselle:', currentCompany.nimi, 'Kontekstit:', contexts);

            contexts.forEach(ctx => {
                const pairs = pairedWith[ctx];
                if (!Array.isArray(pairs)) return;

                pairs.forEach(pair => {
                    const pairText = typeof pair === 'string' ? pair : (pair.label ? i18n.getText(pair.label) : '');
                    if (!pairText && typeof pair !== 'object') return;

                    const matches = allCompanies.filter(c => {
                        if (c.id === currentCompany.id) return false;
                        
                        // Fix: Ensure we check both raw ID and 'company-' prefixed ID
                        const cId = String(c.id).startsWith('company-') ? c.id : `company-${c.id}`;
                        const cProf = allProfiling[cId] || allProfiling[c.id];

                        // 1. Täsmäys objekti-määrityksillä (intent_code tai taxonomy_group)
                        if (typeof pair === 'object') {
                            if (pair.intent_code && cProf?.core?.intent_codes?.includes(pair.intent_code)) return true;
                            if (pair.taxonomy_group && cProf?.core?.taxonomy_group === pair.taxonomy_group) return true;
                        }

                        // 2. Täsmäys tekstipohjaisesti (tagit, kategoria, nimi tai sub_context)
                        if (pairText) {
                            const pt = pairText.toLowerCase();
                            const combined = `${c.tags || ''},${c.kategoria || ''},${c.nimi || ''}`.toLowerCase();
                            if (combined.includes(pt)) return true;
                            
                            if (cProf?.core?.sub_contexts) {
                                const subs = Array.isArray(cProf.core.sub_contexts) ? cProf.core.sub_contexts : Object.values(cProf.core.sub_contexts).flat();
                                if (subs.some(sc => sc.toLowerCase().includes(pt))) return true;
                            }
                            
                            if (cProf?.core?.intent_codes?.some(ic => ic.toLowerCase().includes(pt))) return true;
                        }
                        return false;
                    });

                    // Poimitaan muutama satunnainen osuma per pari-määritys
                    // Suodatetaan kapasiteettikohteet pois, jos nykyinen yritys on palvelu
                    const filtered = matches.filter(c => {
                        if (currentCap === 0) {
                            const mProf = allProfiling[c.id];
                            if (getCap(c, mProf) > 0) return false;
                        }
                        return true;
                    });

                    if (filtered.length > 0) {
                        console.log(`Löytyi ${filtered.length} osumaa parille:`, pairText || pair);
                    }

                    const shuffled = filtered.sort(() => 0.5 - Math.random());
                    shuffled.slice(0, 2).forEach(c => {
                        if (!recommendations.find(r => r.id === c.id)) {
                            recommendations.push(c);
                        }
                    });
                });
            });

            console.log('Suositukset yhteensä:', recommendations.length);

            if (recommendations.length > 0) {
                section.style.display = 'block';
                container.innerHTML = '';
                
                // Näytetään max 6 suositusta
                recommendations.slice(0, 6).forEach(rec => {
                    const card = document.createElement('a');
                    card.href = `yrityskortti.html?id=${rec.id}`;
                    card.className = 'recommendation-card';
                    
                    // Siivotaan kuvaus
                    let desc = rec.esittely || '';
                    if (desc.includes('@@')) desc = desc.split('@@')[0];
                    desc = desc.replace(/#[a-zA-Z0-9åäöÅÄÖ]+/g, '').substring(0, 100).trim() + '...';

                    card.innerHTML = `
                        <div class="rec-category">${rec.kategoria}</div>
                        <h4>${rec.nimi}</h4>
                        <p>${desc}</p>
                        <div class="rec-cta">Lue lisää &raquo;</div>
                    `;
                    container.appendChild(card);
                });
            }
        } catch (err) {
            console.warn('Virhe suositusten latauksessa:', err);
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
            console.log('Fetching RSS from:', url);
            // Using rss2json service with a cache-buster. 
            // The free tier usually works without an API key if usage is low.
            const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&t=${Date.now()}`;

            const response = await fetch(proxyUrl);
            const data = await response.json();
            console.log('RSS Status:', data.status, 'Items:', data.items?.length);

            if (data.status === 'ok' && data.items && data.items.length > 0) {
                // If Käyntikortti news is not explicitly set by the entrepreneur, use the latest RSS item!
                const bcNewsBlock = document.getElementById('bc-news-block');
                const bcNewsTitle = document.getElementById('bc-news-title');
                const bcNewsDate = document.getElementById('bc-news-date');
                const bcNewsText = document.getElementById('bc-news-text');
                const bcNewsLink = document.getElementById('bc-news-link');
                
                if (bcNewsBlock && bcNewsBlock.style.display === 'none') {
                    const firstItem = data.items[0];
                    const date = new Date(firstItem.pubDate);
                    const dateStr = date.toLocaleDateString('fi-FI');
                    const snippet = cleanRSSContent(firstItem.description || firstItem.content || '').substring(0, 160) + '...';
                    
                    bcNewsTitle.textContent = firstItem.title;
                    bcNewsDate.textContent = `📅 ${dateStr}`;
                    bcNewsText.textContent = snippet;
                    bcNewsLink.href = firstItem.link;
                    bcNewsLink.style.display = 'inline-flex';
                    bcNewsBlock.style.display = 'block';
                }

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

    // Modal logic for clicking tags
    window.openTagModal = async function(tag) {
        console.log("Avataan tägimodaali:", tag);
        const modal = document.getElementById('tag-filter-modal');
        const title = document.getElementById('tag-modal-title');
        const grid = document.getElementById('tag-modal-grid');
        const closeBtn = document.getElementById('close-tag-modal-btn');
        
        if (!modal || !grid) {
            console.error("Modaali-elementtejä ei löytynyt DOM:sta!");
            return;
        }
        
        title.textContent = `${tag.charAt(0).toUpperCase() + tag.slice(1)} - Yritykset`;
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">Ladataan...</div>';
        // Force all display styles explicitly to avoid CSS class conflicts
        modal.style.cssText = 'display:flex !important; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:10001; align-items:flex-start; justify-content:center; padding-top:5vh; box-sizing:border-box;';
        document.body.style.overflow = 'hidden';
        console.log("Modaali asetettu näkyväksi. Display:", modal.style.display);
        
        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };

        try {
            // Retrieve companies using existing slim cache if possible
            let allCompanies = [];
            const slimCached = sessionStorage.getItem('laukaainfo_companies_slim');
            const slimTime = sessionStorage.getItem('laukaainfo_companies_slim_time');
            
            if (slimCached && slimTime && (Date.now() - parseInt(slimTime) < 1800000)) {
                const slimJson = JSON.parse(slimCached);
                allCompanies = Array.isArray(slimJson) ? slimJson : (slimJson.results || []);
            } else {
                const dataSourceUrl = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';
                const slimRes = await fetch(`${dataSourceUrl}?t=${Date.now()}`);
                const slimJson = await slimRes.json();
                allCompanies = Array.isArray(slimJson) ? slimJson : (slimJson.results || []);
                sessionStorage.setItem('laukaainfo_companies_slim', JSON.stringify(slimJson));
                sessionStorage.setItem('laukaainfo_companies_slim_time', Date.now().toString());
            }
            
            if (!allCompanies || allCompanies.length === 0) {
                const isDist = window.location.pathname.includes('/yritys/');
                const prefix = isDist ? '../' : './';
                const localRes = await fetch(prefix + 'companies_data.json');
                const localJson = await localRes.json();
                allCompanies = Array.isArray(localJson) ? localJson : (localJson.results || []);
            }

            const searchTag = tag.toLowerCase().trim();
            const matches = allCompanies.filter(c => {
                const tags = (c.tags || '').toLowerCase();
                const pvtapa = (c.palvelutapa || '').toLowerCase();
                const kat = (c.kategoria || '').toLowerCase();
                return tags.includes(searchTag) || pvtapa.includes(searchTag) || kat.includes(searchTag);
            });
            
            grid.innerHTML = '';
            
            if (matches.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #64748b; font-weight: 600;">Ei yrityksiä tällä tägillä.</div>';
                return;
            }
            
            matches.forEach(company => {
                const card = document.createElement('a');
                const compId = String(company.id).startsWith('company-') ? company.id.replace('company-', '') : company.id;
                const cleanName = slugify(company.nimi);
                
                // Construct URL based on type
                const isPremium = (company.package === 'premium' || company.tyyppi === 'maksu' || company.tyyppi === 'paid');
                const isInDist = window.location.pathname.includes('/dist/') || window.location.hostname === 'laukaainfo.fi';
                const distPrefix = isInDist ? '' : 'dist/';
                
                card.href = isPremium ? `${distPrefix}yritys/${cleanName}.html#tab-extended-profile` : `yrityskortti.html?id=${cleanName}#tab-extended-profile`;
                card.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; text-decoration: none; color: inherit; transition: all 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.02); cursor: pointer;';
                card.onmouseover = () => { card.style.transform = 'translateY(-4px)'; card.style.borderColor = 'var(--accent-blue)'; card.style.boxShadow = '0 8px 15px rgba(0,0,0,0.05)'; };
                card.onmouseout = () => { card.style.transform = ''; card.style.borderColor = '#e2e8f0'; card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.02)'; };
                
                const shortAddr = (company.osoite || 'Laukaa').split(',')[0].trim();
                
                card.innerHTML = `
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--primary-blue); font-weight: 800; letter-spacing: 0.5px;">${company.kategoria || ''}</div>
                    <h3 style="margin: 0; font-size: 1.15rem; color: var(--secondary-blue); font-family: 'Outfit'; font-weight: 700;">${company.nimi}</h3>
                    <div style="font-size: 0.85rem; color: #64748b; margin-top: auto; display: flex; align-items: center; gap: 4px;"><span>📍</span> ${shortAddr}</div>
                `;
                
                card.onclick = (e) => {
                    // Navigate directly instead of keeping modal open
                    e.preventDefault();
                    closeModal();
                    window.location.href = card.href;
                    // If we are already on yrityskortti.html, reloading with same url might not trigger fetch if hash only changes
                    // If it's a different id, the page will reload. 
                    if (card.href.includes('yrityskortti.html?id=')) {
                        const newId = card.href.split('id=')[1].split('#')[0];
                        const params = new URLSearchParams(window.location.search);
                        const currentId = params.get('id');
                        if (newId !== currentId) {
                            window.location.href = card.href;
                        } else {
                            // Same company, just switch tab
                            const btnEp = document.getElementById('btn-tab-extended-profile');
                            if (btnEp) btnEp.click();
                        }
                    }
                };
                
                grid.appendChild(card);
            });
            
        } catch (error) {
            console.error("Virhe ladattaessa tägi-yrityksiä:", error);
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #ef4444; font-weight: 600;">Virhe tietojen latauksessa.</div>';
        }
    };
})();
