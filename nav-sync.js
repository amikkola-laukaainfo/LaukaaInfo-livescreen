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

    /** Tunnista, mihin päävalikko-osioon nykyinen sivu kuuluu (Kauppa, Hakulinkit, Ajankohtaista, jne.) */
    function getActiveSection() {
        const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        
        // Palvelun esittely
        if (page === 'palvelun-esittely.html') return 'palvelun-esittely';
        
        // Kauppa
        if (['ilmoittaudu.html', 'kauppa.html', 'lisaa-yritys.html'].includes(page)) return 'kauppa';
        
        // Hakulinkit (Taajamat, Kategoriat, Suosituimmat)
        if (['laukaa.html', 'leppavesi.html', 'lievestuore.html', 'vehnia.html', 'vihtavuori.html',
             'koko-laukaa.html', 'kategoria.html',
             'laukaan-ravintolat.html', 'laukaan-autohuollot.html', 'laukaan-parturit-ja-kauneus.html'
        ].includes(page)) return 'hakulinkit';
        
        // Ajankohtaista
        if (page === 'ajankohtaista.html') return 'ajankohtaista';
        
        // Päätösten polut
        if (page === 'asiahaku.html') return 'paatostenpolut';
        
        // Kartat & Elämykset
        if (['kohdekartta.html', 'tarinakartta.html', 'muistokartta.html', 'kadonneet.html'].includes(page)) return 'kartat';
        
        return '';
    }

    /**
     * Desktop nav – generoi ul.nav-links sisältö
     */
    function renderDesktopNav(base) {
        const activeSection = getActiveSection();
        
        function activeClass(section) {
            return activeSection === section ? ' active' : '';
        }

        return `
                <li class="nav-item">
                    <a href="${base}palvelun-esittely.html" class="nav-link${activeClass('palvelun-esittely')}">Palvelun esittely</a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link${activeClass('kauppa')}" data-i18n="nav_shop">Kauppa <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                    <ul class="dropdown-menu">
                        <li><a href="${base}kohtaamiset.html">Kohtaamispaikka</a></li>
                        <li><a href="${base}omat-sivut.html" style="font-weight:600; color:#0ea5e9;">Omat sivut (Kirjaudu)</a></li>
                        <li><a href="${base}ilmoittaudu.html" data-i18n="nav_feed">Feed-julkaisu</a></li>
                        <li><a href="${base}kauppa.html" data-i18n="nav_shop_packages">Julkaisupaketit</a></li>
                        <li><a href="${base}lisaa-yritys.html" data-i18n="nav_business_profile">Yritysprofiili</a></li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link${activeClass('hakulinkit')}" data-i18n="nav_search_links">Hakulinkit <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                    <ul class="dropdown-menu">
                        <li class="has-arrow">
                            <a href="#" data-i18n="nav_featured">Suosituimmat</a>
                            <ul class="nested-menu" id="nav-featured">
                            </ul>
                        </li>
                        <li class="has-arrow">
                            <a href="#" data-i18n="nav_categories">Kategoriat</a>
                            <ul class="nested-menu" id="nav-categories">
                            </ul>
                        </li>
                        <li class="has-arrow">
                            <a href="#" data-i18n="nav_areas">Taajamat</a>
                            <ul class="nested-menu">
                                <li><a href="${base}laukaa.html">Laukaa kk</a></li>
                                <li><a href="${base}leppavesi.html">Leppävesi</a></li>
                                <li><a href="${base}lievestuore.html">Lievestuore</a></li>
                                <li><a href="${base}vehnia.html">Vehniä</a></li>
                                <li><a href="${base}vihtavuori.html">Vihtavuori</a></li>
                            </ul>
                        </li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a href="${base}ajankohtaista.html" class="nav-link${activeClass('ajankohtaista')}" data-i18n="nav_current">Ajankohtaista <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                    <ul class="dropdown-menu">
                        <li><a href="${base}ajankohtaista.html#events-card" data-i18n="nav_events">Tapahtumat</a></li>
                        <li><a href="${base}ajankohtaista.html#news-card" data-i18n="nav_news">Tiedotteet</a></li>
                        <li><a href="${base}ajankohtaista.html#decisions-card" data-i18n="nav_decisions">Päätöksenteko</a></li>
                        <li><a href="${base}ajankohtaista.html#feedback-card" data-i18n="nav_feedback">Palautteet</a></li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link${activeClass('paatostenpolut')}" data-i18n="nav_paths">P&#228;&#228;t&#246;sten polut <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                    <ul class="dropdown-menu">
                        <li><a href="${base}asiahaku.html" data-i18n="nav_search_explore">Hae ja tutki</a></li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link${activeClass('kartat')}" data-i18n="nav_maps">Kartat &amp; El&#228;mykset <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                    <ul class="dropdown-menu" data-maps-nav-synced="1">
                        <li><a href="${base}kohdekartta.html" data-i18n="nav_map_points">Karttakohteet</a></li>
                        <li><a href="${base}tarinakartta.html" data-i18n="nav_story_map">Tarinakartta</a></li>
                        <li><a href="${base}tarinakartta.html#kavelyreitit-section" data-i18n="nav_route_map">Reittikartta</a></li>
                        <li><a href="${base}muistokartta.html" data-i18n="nav_memorial_map">Muistokartta</a></li>
                        <li><a href="${base}kadonneet.html" data-i18n="nav_lost_found">Kadonneet &amp; löydetyt</a></li>
                    </ul>
                </li>`;
    }

    /**
     * Sidebar (mobiili) – generoi sidebar-content sisältö
     */
    function renderSidebarContent(base) {
        const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        
        function sidebarActive(href) {
            const hrefPage = href.replace(base, '').split('#')[0].split('?')[0];
            if (hrefPage === page) return ' active';
            return '';
        }

        return `
            <div class="menu-section">
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}palvelun-esittely.html" class="sidebar-link${sidebarActive(base + 'palvelun-esittely.html')}" style="font-weight: bold; color: var(--primary-blue);">Tietoa palvelusta</a></li>
                </ul>
            </div>
            <!-- Pääosio: KAUPPA -->
            <div class="menu-section">
                <h3 class="section-title" data-i18n="nav_shop">KAUPPA</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}kohtaamiset.html" class="sidebar-link${sidebarActive(base + 'kohtaamiset.html')}">Kohtaamispaikka</a></li>
                    <li class="menu-item"><a href="${base}omat-sivut.html" class="sidebar-link${sidebarActive(base + 'omat-sivut.html')}" style="font-weight:600; color:#0ea5e9;">Omat sivut (Kirjaudu)</a></li>
                    <li class="menu-item"><a href="${base}ilmoittaudu.html" class="sidebar-link${sidebarActive(base + 'ilmoittaudu.html')}" data-i18n="nav_feed">Feed-julkaisu</a></li>
                    <li class="menu-item"><a href="${base}kauppa.html" class="sidebar-link${sidebarActive(base + 'kauppa.html')}" data-i18n="nav_shop_packages">Julkaisupaketit</a></li>
                    <li class="menu-item"><a href="${base}lisaa-yritys.html" class="sidebar-link${sidebarActive(base + 'lisaa-yritys.html')}" data-i18n="nav_business_profile">Yritysprofiili</a></li>
                </ul>
            </div>

            <!-- Pääosio: HAKULINKIT -->
            <div class="menu-section">
                <h3 class="section-title" data-i18n="nav_search_links">HAKULINKIT</h3>
                <ul class="menu-list">
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle" data-i18n="nav_featured">Suosituimmat <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                        <ul class="submenu" id="sidebar-featured">
                        </ul>
                    </li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle" data-i18n="nav_categories">Kategoriat <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                        <ul class="submenu" id="sidebar-categories">
                        </ul>
                    </li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle" data-i18n="nav_areas">Taajamat <span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size:1.2em;vertical-align:middle"></span></span></a>
                        <ul class="submenu">
                            <li><a href="${base}laukaa.html" class="sidebar-link${sidebarActive(base + 'laukaa.html')}">Laukaa kk</a></li>
                            <li><a href="${base}leppavesi.html" class="sidebar-link${sidebarActive(base + 'leppavesi.html')}">Leppävesi</a></li>
                            <li><a href="${base}lievestuore.html" class="sidebar-link${sidebarActive(base + 'lievestuore.html')}">Lievestuore</a></li>
                            <li><a href="${base}vehnia.html" class="sidebar-link${sidebarActive(base + 'vehnia.html')}">Vehniä</a></li>
                            <li><a href="${base}vihtavuori.html" class="sidebar-link${sidebarActive(base + 'vihtavuori.html')}">Vihtavuori</a></li>
                        </ul>
                    </li>
                </ul>
            </div>

            <!-- Pääosio: AJANKOHTAISTA -->
            <div class="menu-section">
                <h3 class="section-title" data-i18n="nav_current">AJANKOHTAISTA</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}ajankohtaista.html#events-card" class="sidebar-link${sidebarActive(base + 'ajankohtaista.html')}" data-i18n="nav_events">Tapahtumat</a>
                    </li>
                    <li class="menu-item"><a href="${base}ajankohtaista.html#news-card" class="sidebar-link" data-i18n="nav_news">Tiedotteet</a>
                    </li>
                    <li class="menu-item"><a href="${base}ajankohtaista.html#decisions-card"
                            class="sidebar-link" data-i18n="nav_decisions">Päätöksenteko</a></li>
                    <li class="menu-item"><a href="${base}ajankohtaista.html#feedback-card" class="sidebar-link" data-i18n="nav_feedback">Palautteet</a>
                    </li>
                </ul>
            </div>

            <!-- Pääosio: PÄÄTÖSTEN POLUT -->
            <div class="menu-section">
                <h3 class="section-title" data-i18n="nav_paths">PÄÄTÖSTEN POLUT</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="${base}asiahaku.html" class="sidebar-link${sidebarActive(base + 'asiahaku.html')}" data-i18n="nav_search_explore">Hae ja tutki</a></li>
                </ul>
            </div>

            <!-- Korostettu osio: KARTAT & ELÄMYKSET -->
            <div class="menu-section highlight-section">
                <h3 class="section-title" data-i18n="nav_maps">KARTAT &amp; EL&#196;MYKSET &#11088;</h3>
                <ul class="menu-list" data-maps-nav-synced="1">
                    <li class="menu-item"><a href="${base}kohdekartta.html" class="sidebar-link${sidebarActive(base + 'kohdekartta.html')}" data-i18n="nav_map_points">Karttakohteet</a></li>
                    <li class="menu-item"><a href="${base}tarinakartta.html" class="sidebar-link${sidebarActive(base + 'tarinakartta.html')}" data-i18n="nav_story_map">Tarinakartta</a></li>
                    <li class="menu-item"><a href="${base}tarinakartta.html#kavelyreitit-section" class="sidebar-link" data-i18n="nav_route_map">Reittikartta</a></li>
                    <li class="menu-item"><a href="${base}muistokartta.html" class="sidebar-link${sidebarActive(base + 'muistokartta.html')}" data-i18n="nav_memorial_map">Muistokartta</a></li>
                    <li class="menu-item"><a href="${base}kadonneet.html" class="sidebar-link${sidebarActive(base + 'kadonneet.html')}" data-i18n="nav_lost_found">Kadonneet &amp; löydetyt</a>
                    </li>
                </ul>
            </div>`;
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
    }

    // Tehdään globaaliksi niin script.js voi kutsua
    window.syncNavigation = syncNavigation;
})();
