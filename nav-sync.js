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
                <a href="#" class="nav-link" data-i18n="nav_companies">Yritykset <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}koko-laukaa.html" data-i18n="nav_all_laukaa_map">Koko Laukaa kartalla</a></li>
                    <li class="has-arrow">
                        <a href="#" data-i18n="nav_areas">Taajamat</a>
                        <ul class="nested-menu">
                            <li><a href="${base}laukaa.html">Laukaa kk</a></li>
                            <li><a href="${base}leppavesi.html">Leppävesi</a></li>
                            <li><a href="${base}lievestuore.html">Lievestuore</a></li>
                            <li><a href="${base}vehnia.html">Vehniä</a></li>
                            <li><a href="${base}vihtavuori.html">Vihtavuori</a></li>
                            <li><a href="${base}kohdekartta.html" data-i18n="nav_all_places_map">Kaikki kohteet kartalla</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}kategoria.html" data-i18n="nav_industries">Toimialat</a></li>
                    <li><a href="${base}index.html#search-section" data-i18n="nav_general_search">Yleishaku</a></li>
                    <li><a href="${base}pikahaku.html" data-i18n="nav_quicksearch">Pikahaku</a></li>
                    <li><a href="${base}index.html#service-needs" data-i18n="nav_network_search">Verkostohaku</a></li>
                    <li><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" style="color: #0284c7; font-weight: 600;" data-i18n="nav_tender_requests">Tarjouspyynnöt</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}ajankohtaista.html" class="nav-link" data-i18n="nav_current">Ajankohtaista <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}ajankohtaista.html#events-card" data-i18n="nav_events">Tapahtumat</a></li>
                    <li class="has-arrow">
                        <a href="#" data-i18n="nav_rss">Kunta RSS</a>
                        <ul class="nested-menu">
                            <li><a href="${base}ajankohtaista.html#news-card" data-i18n="nav_news">Tiedotteet</a></li>
                            <li><a href="${base}ajankohtaista.html#decisions-card" data-i18n="nav_decisions">Päätöksenteko</a></li>
                            <li><a href="${base}ajankohtaista.html#feedback-card" data-i18n="nav_feedback">Palautteet</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}yhteisot-ja-linkit.html" data-i18n="nav_some">Laukaa Somessa</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}seina.html" class="nav-link" data-i18n="nav_publications">Julkaisut <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}seina.html" style="font-weight: 700; color: #1e40af;" data-i18n="nav_wall">📢 LaukaaInfon Seinä</a></li>
                    <li><a href="${base}kohtaamiset.html" data-i18n="nav_circle">LaukaaInfon Kierto</a></li>
                    <li><a href="${base}kohdekortit.html" data-i18n="nav_events_offers">LaukaaInfon Tapahtumat ja tarjoukset</a></li>
                    <li><a href="${base}toiminta.html" data-i18n="nav_association_board">Yhdistysten Toimintataulu</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" data-i18n="nav_magnifier">Suurennuslasi 🔍 <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}asiahaku.html" data-i18n="nav_paths">Päätösten polut</a></li>
                    <li class="has-arrow">
                        <a href="#" data-i18n="nav_routes">Reitit</a>
                        <ul class="nested-menu">
                            <li><a href="${base}tarinakartta.html" data-i18n="nav_basic_routes">Perusreitit</a></li>
                            <li><a href="https://laukaainfo.fi/wonderin/esittely.html" target="_blank" rel="noopener noreferrer" data-i18n="nav_wonderin_routes">Wonderin elämysreitit</a></li>
                        </ul>
                    </li>
                    <li><a href="${base}kadonneet.html" data-i18n="nav_lost_basket">Löytökori</a></li>
                    <li><a href="${base}havainnot.html" data-i18n="nav_observations">Havainnot alueelta</a></li>
                    <li><a href="${base}alueet.html" data-i18n="nav_places">Paikat alueella</a></li>
                    <li><a href="${base}kohdekortit.html?filter=project" data-i18n="nav_ideas_projects">Ideat ja projektit alueella</a></li>
                </ul>
            </li>
            <li class="nav-item">
                <a href="${base}ilmoittaudu.html" class="nav-link" data-i18n="nav_contact">Ota yhteyttä <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span></a>
                <ul class="dropdown-menu">
                    <li><a href="${base}lisaa-yritys.html" data-i18n="nav_add_company">Lisää yritys</a></li>
                    <li><a href="${base}ilmoittaudu.html" data-i18n="nav_channels">Julkaisukanavat</a></li>
                    <li><a href="${base}kauppa.html" data-i18n="nav_packages">Lisätietoa &amp; Julkaisupaketit</a></li>
                    <li><a href="${base}palvelun-esittely.html" data-i18n="nav_about_service_contact">Tietoa palvelusta ja yhteystiedot</a></li>
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
                <h3 class="section-title">01 · <span data-i18n="nav_companies">YRITYKSET</span></h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}koko-laukaa.html" class="sidebar-link" data-i18n="nav_all_laukaa_map">Koko Laukaa kartalla</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle"><span data-i18n="nav_areas">Taajamat</span> <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}laukaa.html" class="sidebar-link">Laukaa kk</a></li>
                            <li><a href="${base}leppavesi.html" class="sidebar-link">Leppävesi</a></li>
                            <li><a href="${base}lievestuore.html" class="sidebar-link">Lievestuore</a></li>
                            <li><a href="${base}vehnia.html" class="sidebar-link">Vehniä</a></li>
                            <li><a href="${base}vihtavuori.html" class="sidebar-link">Vihtavuori</a></li>
                            <li><a href="${base}kohdekartta.html" class="sidebar-link" data-i18n="nav_all_places_map">Kaikki kohteet kartalla</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}kategoria.html" class="sidebar-link" data-i18n="nav_industries">Toimialat</a></li>
                    <li class="menu-item"><a href="${base}index.html#search-section" class="sidebar-link" data-i18n="nav_general_search">Yleishaku</a></li>
                    <li class="menu-item"><a href="${base}pikahaku.html" class="sidebar-link" data-i18n="nav_quicksearch">Pikahaku</a></li>
                    <li class="menu-item"><a href="${base}index.html#service-needs" class="sidebar-link" data-i18n="nav_network_search">Verkostohaku</a></li>
                    <li class="menu-item"><a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" rel="noopener noreferrer" class="sidebar-link" style="color: #0284c7; font-weight: 600;" data-i18n="nav_tender_requests">Tarjouspyynnöt</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">02 · <span data-i18n="nav_current">AJANKOHTAISTA</span></h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}ajankohtaista.html#events-card" class="sidebar-link" data-i18n="nav_events">Tapahtumat</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle"><span data-i18n="nav_rss">Kunta RSS</span> <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}ajankohtaista.html#news-card" class="sidebar-link" data-i18n="nav_news">Tiedotteet</a></li>
                            <li><a href="${base}ajankohtaista.html#decisions-card" class="sidebar-link" data-i18n="nav_decisions">Päätöksenteko</a></li>
                            <li><a href="${base}ajankohtaista.html#feedback-card" class="sidebar-link" data-i18n="nav_feedback">Palautteet</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}yhteisot-ja-linkit.html" class="sidebar-link" data-i18n="nav_some">Laukaa Somessa</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">03 · <span data-i18n="nav_publications">JULKAISUT</span></h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}seina.html" class="sidebar-link" style="font-weight: 700; color: #1e40af;" data-i18n="nav_wall">📢 LaukaaInfon Seinä</a></li>
                    <li class="menu-item"><a href="${base}kohtaamiset.html" class="sidebar-link" data-i18n="nav_circle">LaukaaInfon Kierto</a></li>
                    <li class="menu-item"><a href="${base}kohdekortit.html" class="sidebar-link" data-i18n="nav_events_offers">LaukaaInfon Tapahtumat ja tarjoukset</a></li>
                    <li class="menu-item"><a href="${base}toiminta.html" class="sidebar-link" data-i18n="nav_association_board">Yhdistysten Toimintataulu</a></li>
                </ul>
            </div>
            <div class="menu-section highlight-section">
                <h3 class="section-title">04 · <span data-i18n="nav_magnifier">SUURENNUSLASI 🔍</span></h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}asiahaku.html" class="sidebar-link" data-i18n="nav_paths">Päätösten polut</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle"><span data-i18n="nav_routes">Reitit</span> <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="${base}tarinakartta.html" class="sidebar-link" data-i18n="nav_basic_routes">Perusreitit</a></li>
                            <li><a href="https://laukaainfo.fi/wonderin/esittely.html" target="_blank" rel="noopener noreferrer" class="sidebar-link" data-i18n="nav_wonderin_routes">Wonderin elämysreitit</a></li>
                        </ul>
                    </li>
                    <li class="menu-item"><a href="${base}kadonneet.html" class="sidebar-link" data-i18n="nav_lost_basket">Löytökori</a></li>
                    <li class="menu-item"><a href="${base}havainnot.html" class="sidebar-link" data-i18n="nav_observations">Havainnot alueelta</a></li>
                    <li class="menu-item"><a href="${base}alueet.html" class="sidebar-link" data-i18n="nav_places">Paikat alueella</a></li>
                    <li class="menu-item"><a href="${base}kohdekortit.html?filter=project" class="sidebar-link" data-i18n="nav_ideas_projects">Ideat ja projektit alueella</a></li>
                </ul>
            </div>
            <div class="menu-section">
                <h3 class="section-title">05 · <span data-i18n="nav_contact">OTA YHTEYTTÄ</span></h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}lisaa-yritys.html" class="sidebar-link" data-i18n="nav_add_company">Lisää yritys</a></li>
                    <li class="menu-item"><a href="${base}ilmoittaudu.html" class="sidebar-link" data-i18n="nav_channels">Julkaisukanavat</a></li>
                    <li class="menu-item"><a href="${base}kauppa.html" class="sidebar-link" data-i18n="nav_packages">Lisätietoa &amp; Julkaisupaketit</a></li>
                    <li class="menu-item"><a href="${base}palvelun-esittely.html" class="sidebar-link" data-i18n="nav_about_service_contact">Tietoa palvelusta ja yhteystiedot</a></li>
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

