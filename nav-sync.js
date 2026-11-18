/**
 * nav-sync.js – Yhteinen valikkosynkronointi kaikille sivuille.
 * Korvaa desktop-navin ja sidebar-menun sisällön etusivun (index.html) mukaisilla valikoilla.
 * Ladataan script.js:n kautta kaikilla sivuilla.
 * 
 * Päivitä tämä tiedosto, kun valikkorunkoon lisätään/poistetaan kohteita.
 */
(function () {
    'use strict';

    /** Suhteellinen polku juureen (esim. ../ yrityssivuilla) */
    function getBasePath() {
        const script = document.querySelector('script[src*="script.js"]');
        if (script) {
            const src = script.getAttribute('src') || '';
            const m = src.match(/^((?:\.\.\/)*)/);
            if (m) return m[1];
        }
        if (/\/yritys\//i.test(window.location.pathname)) return '../';
        return '';
    }

    /** i18n-käännösfunktio */
    function t(key, fallback) {
        if (typeof i18n !== 'undefined' && i18n.t) {
            const v = i18n.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    /** Tunnistetaan aktiivinen sivu linkin perusteella */
    function isActivePage(href) {
        const loc = window.location;
        const path = loc.pathname.toLowerCase();
        const page = path.split('/').pop() || 'index.html';
        const hash = loc.hash;
        
        // Normalisoidaan href
        const hrefClean = href.replace(/^\.\.\//, '').split('?')[0];
        const hrefPage = hrefClean.split('#')[0];
        const hrefHash = hrefClean.includes('#') ? '#' + hrefClean.split('#')[1] : '';
        
        if (hrefPage === page || hrefPage === page.replace('.html', '')) {
            // Jos hashit pitää täsmätä
            if (hrefHash && hash) return hrefHash === hash;
            if (!hrefHash) return true;
        }
        return false;
    }

    /** Tunnista, mihin päävalikko-osioon nykyinen sivu kuuluu (Yritykset, Ajankohtaista, Julkaisut, Suurennuslasi, Ota yhteyttä) */
    function getActiveSection() {
        const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        
        // Ota yhteyttä / Julkaisupaketit / Kauppa
        if (['palvelun-esittely.html', 'ilmoittaudu.html', 'kauppa.html', 'lisaa-yritys.html'].includes(page)) return 'otayhteytta';
        
        // Yritykset (Koko Laukaa, Taajamat, Kategoriat, Pikahaku)
        if (['laukaa.html', 'leppavesi.html', 'lievestuore.html', 'vehnia.html', 'vihtavuori.html',
             'koko-laukaa.html', 'kategoria.html', 'pikahaku.html',
             'laukaan-ravintolat.html', 'laukaan-autohuollot.html', 'laukaan-parturit-ja-kauneus.html'
        ].includes(page)) return 'yritykset';
        
        // Ajankohtaista
        if (['ajankohtaista.html', 'yhteisot-ja-linkit.html'].includes(page)) return 'ajankohtaista';
        
        // Julkaisut
        if (['seina.html', 'kohtaamiset.html', 'kohdekortit.html', 'toiminta.html', 'galleria.html'].includes(page)) return 'julkaisut';
        
        // Suurennuslasi
        if (['asiahaku.html', 'tarinakartta.html', 'muistokartta.html', 'kadonneet.html', 'havainnot.html', 'alueet.html', 'projekti.html', 'kohdekartta.html'].includes(page)) return 'suurennuslasi';
        
        return '';
    }

    /**
     * Desktop nav – generoi ul.nav-links sisältö
     */
    function renderDesktopNav(base) {
        return `
            <li class="nav-item">
                <a href="#" class="nav-link">Yritykset <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}koko-laukaa.html">Koko Laukaa kartalla</a></li>
                    <li class="has-arrow">
                        <a href="#">Taajamat</a>
                        <ul class="nested-menu">
                            <li><a href="${base}laukaa.html">Laukaa kk</a></li>
                            <li><a href="${base}leppavesi.html">Leppävesi</a></li>
                            <li><a href="${base}lievestuore.html">Lievestuore</a></li>
                            <li><a href="${base}vehnia.html">Vehniä</a></li>
                            <li><a href="${base}vihtavuori.html">Vihtavuori</a></li>
                            <li><a href="${base}kohdekartta.html">Kaikki kohteet kartalla</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}kategoria.html">Kategoriat</a></li>
                    <li><a href="${base}index.html#search-section">Yleishaku</a></li>
                    <li><a href="${base}pikahaku.html">Pikahaku</a></li>
                    <li><a href="${base}index.html#service-needs">Verkostohaku</a></li>
                    <li><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" style="color: #0284c7; font-weight: 600;">Tarjouspyynnöt</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}ajankohtaista.html" class="nav-link">Ajankohtaista <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}ajankohtaista.html#events-card">Tapahtumat</a></li>
                    <li class="has-arrow">
                        <a href="#">Kunta RSS</a>
                        <ul class="nested-menu">
                            <li><a href="${base}ajankohtaista.html#news-card">Tiedotteet</a></li>
                            <li><a href="${base}ajankohtaista.html#decisions-card">Päätöksenteko</a></li>
                            <li><a href="${base}ajankohtaista.html#feedback-card">Palautteet</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}yhteisot-ja-linkit.html">Laukaa Somessa</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}seina.html" class="nav-link">Julkaisut <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}seina.html" style="font-weight: 700; color: #1e40af;">📢 LaukaaInfon Seinä</a></li>
                    <li><a href="${base}kohtaamiset.html">LaukaaInfon Kierto</a></li>
                    <li><a href="${base}kohdekortit.html">LaukaaInfon Tapahtumat ja tarjoukset</a></li>
                    <li><a href="${base}toiminta.html">Yhdistysten Toimintataulu</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link">Suurennuslasi 🔍 <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}asiahaku.html">Päätösten polut</a></li>
                    <li class="has-arrow">
                        <a href="#">Reitit</a>
                        <ul class="nested-menu">
                            <li><a href="${base}tarinakartta.html">Perusreitit</a></li>
                            <li><a href="https://laukaainfo.fi/wonderin/esittely.html" target="_blank" rel="noopener noreferrer">Wonderin elämysreitit</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}kadonneet.html">Löytökori</a></li>
                    <li><a href="${base}havainnot.html">Havainnot alueelta</a></li>
                    <li><a href="${base}alueet.html">Paikat alueella</a></li>
                    <li><a href="${base}kategoria.html">Teemat alueella</a></li>
                    <li><a href="${base}kohdekortit.html?filter=project">Ideat ja projektit alueella</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}ilmoittaudu.html" class="nav-link">Ota yhteyttä <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}lisaa-yritys.html">Lisää yritys</a></li>
                    <li><a href="${base}ilmoittaudu.html">Julkaisukanavat</a></li>
                    <li><a href="${base}kauppa.html">Lisätietoa &amp; Julkaisupaketit</a></li>
                    <li><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" style="color: #0284c7; font-weight: 600;">Kilpailutus</a></li>
                    <li><a href="${base}palvelun-esittely.html">Tietoa palvelusta ja yhteystiedot</a></li>
                </ul>
            </li>
        `;
    }

    /**
     * Sidebar (mobiili) – generoi sidebar-content sisältö
     */
    function renderSidebarContent(base) {
        return `
            <div class="menu-section">
                <h3 class="section-title">01 · YRITYKSET</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}koko-laukaa.html" class="sidebar-link">Koko Laukaa kartalla</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle">Taajamat <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}laukaa.html" class="sidebar-link">Laukaa kk</a></li>
                            <li><a href="${base}leppavesi.html" class="sidebar-link">Leppävesi</a></li>
                            <li><a href="${base}lievestuore.html" class="sidebar-link">Lievestuore</a></li>
                            <li><a href="${base}vehnia.html" class="sidebar-link">Vehniä</a></li>
                            <li><a href="${base}vihtavuori.html" class="sidebar-link">Vihtavuori</a></li>
                            <li><a href="${base}kohdekartta.html" class="sidebar-link">Kaikki kohteet kartalla</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}kategoria.html" class="sidebar-link">Kategoriat</a></li>
                    <li class="menu-item"><a href="${base}index.html#search-section" class="sidebar-link">Yleishaku</a></li>
                    <li class="menu-item"><a href="${base}pikahaku.html" class="sidebar-link">Pikahaku</a></li>
                    <li class="menu-item"><a href="${base}index.html#service-needs" class="sidebar-link">Verkostohaku</a></li>
                    <li class="menu-item"><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" class="sidebar-link" style="color: #0284c7; font-weight: 600;">Tarjouspyynnöt</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">02 · AJANKOHTAISTA</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}ajankohtaista.html#events-card" class="sidebar-link">Tapahtumat</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle">Kunta RSS <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}ajankohtaista.html#news-card" class="sidebar-link">Tiedotteet</a></li>
                            <li><a href="${base}ajankohtaista.html#decisions-card" class="sidebar-link">Päätöksenteko</a></li>
                            <li><a href="${base}ajankohtaista.html#feedback-card" class="sidebar-link">Palautteet</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}yhteisot-ja-linkit.html" class="sidebar-link">Laukaa Somessa</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">03 · JULKAISUT</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}seina.html" class="sidebar-link" style="font-weight: 700; color: #1e40af;">📢 LaukaaInfon Seinä</a></li>
                    <li class="menu-item"><a href="${base}kohtaamiset.html" class="sidebar-link">LaukaaInfon Kierto</a></li>
                    <li class="menu-item"><a href="${base}kohdekortit.html" class="sidebar-link">LaukaaInfon Tapahtumat ja tarjoukset</a></li>
                    <li class="menu-item"><a href="${base}toiminta.html" class="sidebar-link">Yhdistysten Toimintataulu</a></li>
                </ul>
            </div>
            <div class="menu-section highlight-section">
                <h3 class="section-title">04 · SUURENNUSLASI 🔍</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}asiahaku.html" class="sidebar-link">Päätösten polut</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle">Reitit <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}tarinakartta.html" class="sidebar-link">Perusreitit</a></li>
                            <li><a href="https://laukaainfo.fi/wonderin/esittely.html" target="_blank" rel="noopener noreferrer" class="sidebar-link">Wonderin elämysreitit</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}kadonneet.html" class="sidebar-link">Löytökori</a></li>
                    <li class="menu-item"><a href="${base}havainnot.html" class="sidebar-link">Havainnot alueelta</a></li>
                    <li class="menu-item"><a href="${base}alueet.html" class="sidebar-link">Paikat alueella</a></li>
                    <li class="menu-item"><a href="${base}kategoria.html" class="sidebar-link">Teemat alueella</a></li>
                    <li class="menu-item"><a href="${base}kohdekortit.html?filter=project" class="sidebar-link">Ideat ja projektit alueella</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">05 · OTA YHTEYTTÄ</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}lisaa-yritys.html" class="sidebar-link">Lisää yritys</a></li>
                    <li class="menu-item"><a href="${base}ilmoittaudu.html" class="sidebar-link">Julkaisukanavat</a></li>
                    <li class="menu-item"><a href="${base}kauppa.html" class="sidebar-link">Lisätietoa &amp; Julkaisupaketit</a></li>
                    <li class="menu-item"><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" class="sidebar-link" style="color: #0284c7; font-weight: 600;">Kilpailutus</a></li>
                    <li class="menu-item"><a href="${base}palvelun-esittely.html" class="sidebar-link">Tietoa palvelusta ja yhteystiedot</a></li>
                </ul>
            </div>
        `;
    }

    /**
     * Synkronoi navigaatio.
     * Kutsutaan DOMContentLoaded-vaiheessa script.js:stä.
     */
    function syncNavigation() {
        const base = getBasePath();
        
        // --- 0. Päivitetään logo-linkit ---
        const logoLinks = document.querySelectorAll('.nav-logo');
        logoLinks.forEach(logoLink => {
            logoLink.setAttribute('href', base + 'index.html');
            const logoImg = logoLink.querySelector('img');
            if (logoImg) {
                logoImg.setAttribute('src', base + 'logo.png');
            }
        });

        // --- 1. Desktop nav ---
        const desktopNav = document.querySelector('.desktop-nav');
        if (desktopNav) {
            let navLinks = desktopNav.querySelector('ul.nav-links');
            if (!navLinks) {
                navLinks = document.createElement('ul');
                navLinks.className = 'nav-links';
                desktopNav.appendChild(navLinks);
            }
            navLinks.innerHTML = renderDesktopNav(base);
        }

        // Varmistetaan lang-switcher-elementit ja hamburger
        const navContainer = document.querySelector('.nav-container');
        if (navContainer) {
            // Lisätään lang-switcher jos puuttuu
            if (!navContainer.querySelector('.lang-switcher')) {
                const langDiv = document.createElement('div');
                langDiv.className = 'lang-switcher';
                langDiv.innerHTML = `
                    <button class="lang-btn" onclick="i18n.setLanguage('fi')" data-lang="fi">FI</button>
                    <button class="lang-btn" onclick="i18n.setLanguage('en')" data-lang="en">EN</button>
                `;
                // Lisätään ennen hamburgeria tai loppuun
                const hamburger = navContainer.querySelector('.hamburger');
                if (hamburger) {
                    navContainer.insertBefore(langDiv, hamburger);
                } else {
                    navContainer.appendChild(langDiv);
                }
            }

            // Lisätään hamburger-painike jos puuttuu
            if (!navContainer.querySelector('.hamburger')) {
                const btn = document.createElement('button');
                btn.className = 'hamburger';
                btn.id = 'hamburger-btn';
                btn.setAttribute('aria-label', 'Avaa valikko');
                btn.innerHTML = '<span></span><span></span><span></span>';
                navContainer.appendChild(btn);
            }
        }

        // --- 2. Sidebar (mobiili) ---
        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) {
            sidebarContent.innerHTML = renderSidebarContent(base);
        }

        // --- 3. Varmistetaan sidebar-overlay ja sidebar-menu-elementit ---
        if (!document.getElementById('sidebar-overlay')) {
            const nav = document.querySelector('nav.top-nav');
            if (nav) {
                const overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.id = 'sidebar-overlay';
                nav.after(overlay);
            }
        }

        if (!document.getElementById('sidebar-menu')) {
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) {
                const aside = document.createElement('aside');
                aside.className = 'sidebar-menu';
                aside.id = 'sidebar-menu';
                aside.innerHTML = `
                    <div class="sidebar-header">
                        <a href="${base}index.html" class="nav-logo">
                            <img src="${base}logo.png" alt="LaukaaInfo Logo">
                            <span data-i18n="hero_title">LaukaaInfo</span>
                        </a>
                        <button class="close-btn" id="close-sidebar-btn" aria-label="Sulje valikko">&times;</button>
                    </div>
                    <div class="sidebar-content">
                        ${renderSidebarContent(base)}
                    </div>
                `;
                overlay.after(aside);
            }
        }

        // --- 4. i18n-käännös ---
        if (typeof i18n !== 'undefined' && i18n.translatePage) {
            setTimeout(() => i18n.translatePage(), 50);
        }

        // --- 5. Tapahtumakäsittelijät valikolle ---
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const closeBtn = document.getElementById('close-sidebar-btn');
        const sidebarMenu = document.getElementById('sidebar-menu');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        function closeSidebar() {
            if (sidebarMenu) sidebarMenu.classList.remove('active');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        if (hamburgerBtn && !hamburgerBtn._navSyncBound) {
            hamburgerBtn._navSyncBound = true;
            hamburgerBtn.addEventListener('click', () => {
                if (sidebarMenu) sidebarMenu.classList.add('active');
                if (sidebarOverlay) sidebarOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }
        if (closeBtn && !closeBtn._navSyncBound) {
            closeBtn._navSyncBound = true;
            closeBtn.addEventListener('click', closeSidebar);
        }
        if (sidebarOverlay && !sidebarOverlay._navSyncBound) {
            sidebarOverlay._navSyncBound = true;
            sidebarOverlay.addEventListener('click', closeSidebar);
        }

        document.querySelectorAll('.submenu-toggle').forEach(toggle => {
            if (!toggle._navSyncBound) {
                toggle._navSyncBound = true;
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    const parent = toggle.parentElement;
                    const submenu = parent.querySelector('.submenu');
                    parent.classList.toggle('open');
                    if (submenu) submenu.classList.toggle('open');
                });
            }
        });

        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            if (!link._navSyncBound) {
                link._navSyncBound = true;
                link.addEventListener('click', () => {
                    if (link.getAttribute('href') !== '#' && !link.classList.contains('submenu-toggle')) {
                        closeSidebar();
                    }
                });
            }
        });
    }

    // Tehdään globaaliksi niin script.js voi kutsua
    window.syncNavigation = syncNavigation;

    // Automaattinen alustus kun sivu latautuu
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncNavigation);
    } else {
        syncNavigation();
    }
})();

