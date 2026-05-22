/**
 * Yhteinen sivuston valikko – Kartat & Elämykset -osion linkit.
 * Päivitä tämä tiedosto, kun valikkorunkoon lisätään/poistetaan kohteita.
 * Ladataan script.js:n kautta kaikilla sivuilla.
 */
(function () {
    'use strict';

    /** Suhteellinen polku juureen (esim. ../ yrityssivuilla) */
    function getNavBasePath() {
        const script = document.querySelector('script[src*="script.js"]');
        if (script) {
            const src = script.getAttribute('src') || '';
            const m = src.match(/^((?:\.\.\/)*)/);
            if (m) return m[1];
        }
        if (/\/yritys\//i.test(window.location.pathname)) return '../';
        return '';
    }

    function navLabel(key, fallback) {
        if (typeof i18n !== 'undefined' && i18n.t) {
            const t = i18n.t(key);
            if (t && t !== key) return t;
        }
        return fallback;
    }

    /** Kartat & Elämykset – järjestys desktop- ja mobiilivalikossa */
    const MAPS_NAV_ITEMS = [
        { path: 'karttakohteet.html', i18nKey: 'nav_map_points', label: 'Karttakohteet' },
        { path: 'tarinakartta.html', i18nKey: 'nav_story_map', label: 'Tarinakartta' },
        { path: 'tarinakartta.html#kavelyreitit-section', i18nKey: 'nav_route_map', label: 'Reittikartta' },
        { path: 'muistokartta.html', i18nKey: 'nav_memorial_map', label: 'Muistokartta' },
        { path: 'kadonneet.html', i18nKey: 'nav_lost_found', label: 'Kadonneet & löydetyt' }
    ];

    function renderMapsNavList(base, isSidebar) {
        const linkClass = isSidebar ? ' class="sidebar-link"' : '';
        return MAPS_NAV_ITEMS.map(item => {
            const href = base + item.path;
            const text = navLabel(item.i18nKey, item.label);
            return `<li><a href="${href}"${linkClass} data-i18n="${item.i18nKey}">${text}</a></li>`;
        }).join('');
    }

    function syncMapsNavList(list, base) {
        if (!list || list.dataset.mapsNavSynced === '1') return;
        const isSidebar = list.classList.contains('menu-list');
        list.innerHTML = renderMapsNavList(base, isSidebar);
        list.dataset.mapsNavSynced = '1';
        if (typeof i18n !== 'undefined' && i18n.translatePage) {
            i18n.translatePage();
        }
    }

    function initSiteMapsNavigation() {
        const base = getNavBasePath();

        document.querySelectorAll('a[href*="tarinakartta"]').forEach(anchor => {
            const list = anchor.closest('ul.dropdown-menu, ul.menu-list');
            if (!list) return;
            if (!list.querySelector('a[href*="muistokartta"]')) return;
            syncMapsNavList(list, base);
        });
    }

    window.initSiteMapsNavigation = initSiteMapsNavigation;
})();
