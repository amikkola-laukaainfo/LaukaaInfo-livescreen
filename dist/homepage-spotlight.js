/**
 * Etusivun kelluva "Esillä nyt" -nosto.
 * Näyttää yhden yrityksen minikortin scrollauksen jälkeen; suljettavissa.
 */
(function () {
    'use strict';

    const STORAGE_HIDE_UNTIL = 'lki_home_spotlight_hide_until';
    const STORAGE_SHOWN_DATE = 'lki_home_spotlight_shown_date';
    const SCROLL_THRESHOLD = 320;
    const HIDE_DAYS = 7;

    function t(key, fallback) {
        if (typeof i18n !== 'undefined' && i18n.t) {
            const v = i18n.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    function todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function isHiddenByUser() {
        const hideUntil = parseInt(localStorage.getItem(STORAGE_HIDE_UNTIL) || '0', 10);
        if (hideUntil && Date.now() < hideUntil) return true;
        if (localStorage.getItem(STORAGE_SHOWN_DATE) === todayKey()) return true;
        return false;
    }

    function markShown() {
        localStorage.setItem(STORAGE_SHOWN_DATE, todayKey());
    }

    function markDismissed() {
        localStorage.setItem(STORAGE_HIDE_UNTIL, String(Date.now() + HIDE_DAYS * 24 * 60 * 60 * 1000));
    }

    function isPremiumCompany(c) {
        const pkg = String(c.package || c.paketti || c.tyyppi || c.taso || '').toLowerCase();
        return ['basic', 'plus', 'pro', 'paid', 'maksu', 'premium'].includes(pkg);
    }

    function isEligible(c) {
        if (!c || c.is_expired) return false;
        const weight = parseInt(c.karusellipaino, 10);
        if (weight < 0) return false;
        if (weight > 0) return true;
        if (isPremiumCompany(c)) return true;
        if (c.media && c.media.length > 0) return true;
        if (c.images && c.images.length > 0) return true;
        const text = (c.mainoslause || c.esittely || '').trim();
        return text.length > 8;
    }

    function spotlightWeight(c) {
        let w = parseInt(c.karusellipaino, 10);
        if (Number.isNaN(w) || w < 0) w = 0;
        if (w === 0 && isPremiumCompany(c)) w = 60;
        if (w === 0 && c.media && c.media.length) w = 25;
        if (w === 0) w = 5;
        return w;
    }

    function pickWeighted(pool) {
        if (!pool.length) return null;
        const total = pool.reduce((s, c) => s + spotlightWeight(c), 0);
        let r = Math.random() * total;
        for (const c of pool) {
            r -= spotlightWeight(c);
            if (r <= 0) return c;
        }
        return pool[pool.length - 1];
    }

    function getCardUrl(c) {
        const slug = typeof slugify === 'function' ? slugify(c.nimi) : String(c.id || '').replace('company-', '');
        if (isPremiumCompany(c)) {
            return `yritys/${slug}.html`;
        }
        const id = c.id || slug;
        return `yrityskortti.html?id=${encodeURIComponent(id)}`;
    }

    function getImageUrl(c) {
        if (c.logo && c.logo !== '-') return c.logo;
        if (c.media && c.media.length) {
            const img = c.media.find(m => m.type === 'image' && m.url) || c.media[0];
            if (img && img.url) return img.url;
        }
        if (c.images && c.images[0]) return c.images[0];
        return null;
    }

    function getTeaser(c) {
        let text = c.mainoslause || c.esittely || '';
        if (text.includes('@@')) text = text.split('@@')[0].trim();
        text = text.replace(/#[\wåäöÅÄÖ]+/gi, '').replace(/\s+/g, ' ').trim();
        if (text.length > 100) text = text.slice(0, 97) + '…';
        return text || c.kategoria || '';
    }

    function buildWidget(company) {
        const root = document.createElement('aside');
        root.id = 'home-spotlight-widget';
        root.className = 'home-spotlight-widget';
        root.setAttribute('role', 'complementary');
        root.setAttribute('aria-label', t('home_spotlight_aria', 'Esillä nyt'));

        const imgUrl = getImageUrl(company);
        const cardUrl = getCardUrl(company);
        const teaser = getTeaser(company);

        root.innerHTML = `
            <div class="home-spotlight-inner">
                <button type="button" class="home-spotlight-close" aria-label="${escapeHtml(t('home_spotlight_close', 'Piilota'))}">&times;</button>
                <span class="home-spotlight-badge">${escapeHtml(t('home_spotlight_badge', 'Esillä nyt'))}</span>
                <a href="${escapeHtml(cardUrl)}" class="home-spotlight-link">
                    <div class="home-spotlight-thumb${imgUrl ? '' : ' home-spotlight-thumb--placeholder'}">${imgUrl ? '' : '🏢'}</div>
                    <div class="home-spotlight-body">
                        <strong class="home-spotlight-name">${escapeHtml(company.nimi)}</strong>
                        <span class="home-spotlight-teaser">${escapeHtml(teaser)}</span>
                        <span class="home-spotlight-cta">${escapeHtml(t('home_spotlight_cta', 'Avaa yrityskortti'))} »</span>
                    </div>
                </a>
            </div>
        `;

        if (imgUrl) {
            const thumb = root.querySelector('.home-spotlight-thumb');
            if (thumb) thumb.style.backgroundImage = `url("${String(imgUrl).replace(/"/g, '\\"')}")`;
        }

        root.querySelector('.home-spotlight-close').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            markDismissed();
            hideWidget(root);
        });

        return root;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function hideWidget(el) {
        if (!el) return;
        el.classList.add('home-spotlight-widget--hide');
        setTimeout(() => el.remove(), 400);
    }

    function showWidget(company) {
        if (document.getElementById('home-spotlight-widget')) return;
        const el = buildWidget(company);
        document.body.appendChild(el);
        markShown();
        requestAnimationFrame(() => el.classList.add('home-spotlight-widget--visible'));
    }

    function tryShow() {
        if (!document.getElementById('home-region-select')) return;
        if (isHiddenByUser()) return;
        const pool = (window.allCompanies || []).filter(isEligible);
        const company = pickWeighted(pool);
        if (!company) return;
        showWidget(company);
    }

    function onScrollMaybeShow() {
        if (window.__homeSpotlightTriggered) return;
        if (window.scrollY < SCROLL_THRESHOLD) return;
        window.__homeSpotlightTriggered = true;
        tryShow();
    }

    function waitForCompanies(maxMs) {
        return new Promise((resolve) => {
            const start = Date.now();
            const tick = () => {
                if (window.allCompanies && window.allCompanies.length > 0) {
                    resolve(window.allCompanies);
                    return;
                }
                if (Date.now() - start > maxMs) {
                    resolve([]);
                    return;
                }
                setTimeout(tick, 200);
            };
            tick();
        });
    }

    async function init() {
        if (!document.getElementById('home-region-select')) return;
        if (isHiddenByUser()) return;

        if (typeof window.loadCompanyData === 'function') {
            try { await window.loadCompanyData(); } catch (e) { /* ignore */ }
        } else {
            await waitForCompanies(8000);
        }

        window.addEventListener('scroll', onScrollMaybeShow, { passive: true });
        onScrollMaybeShow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
