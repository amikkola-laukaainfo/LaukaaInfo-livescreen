(function () {
    'use strict';

    const root = document.getElementById('homepage-feed-highlights');
    if (!root) return;

    const maxHighlights = 3;
    const placeholderImage = 'kuvia/syote.jpg';

    const typeLabels = {
        event: 'Tapahtuma',
        business: 'Yritys',
        community: 'Yhteisö',
        story: 'Tarina',
        offer: 'Tarjous',
        notice: 'Ilmoitus',
        announcement: 'Tiedote',
        news: 'Uutinen',
        video: 'Video',
        pikkuilmoitus: 'Ajankohtaista',
        kohde: 'Kohde',
        place: 'Paikka'
    };

    const typeIcons = {
        event: '📅',
        offer: '🎁',
        announcement: '📢',
        news: '📰',
        notice: '📌',
        video: '🎥',
        kohde: '📇',
        business: '🏢',
        place: '📍'
    };

    const placeTypeIcons = {
        NATURE: '🌿',
        LANDMARK: '🏛️',
        ATTRACTION: '✨',
        SERVICE: '🏪',
        BUILDING: '🏠',
        AREA: '🗺️',
        ROUTE: '🥾'
    };

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shuffleArray(array) {
        const cloned = array.slice();
        for (let i = cloned.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
        }
        return cloned;
    }

    function truncate(text, maxLength) {
        if (!text) return '';
        text = text.trim();
        if (text.length <= maxLength) return escapeHtml(text);
        return escapeHtml(text.slice(0, maxLength).replace(/\s+$/, '')) + '…';
    }

    function getSupabase() {
        if (window.LaukaaSupabase) return window.LaukaaSupabase;
        if (window.supabase) {
            const sbUrl = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
            const sbKey = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';
            window.LaukaaSupabase = window.supabase.createClient(sbUrl, sbKey);
            return window.LaukaaSupabase;
        }
        return null;
    }

    function isExpired(post) {
        const now = new Date();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (post.expires_at && new Date(post.expires_at) <= now) return true;

        if (post.type === 'event' || post.event_end_at || post.event_start_at) {
            const end = post.event_end_at || post.event_start_at;
            if (end) {
                const d = new Date(end);
                if (!isNaN(d.getTime())) {
                    if (typeof end === 'string' && !end.includes('T') && !end.includes(':')) {
                        d.setHours(23, 59, 59, 999);
                    }
                    if (now.getTime() > d.getTime() + ONE_DAY_MS) return true;
                }
            }
        } else if (post.type === 'offer' || post.offer_end_at) {
            if (post.offer_end_at) {
                const d = new Date(post.offer_end_at);
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    if (now.getTime() > d.getTime() + ONE_DAY_MS) return true;
                }
            }
        }
        return false;
    }

    async function loadPostsFromSupabase() {
        const sb = getSupabase();
        if (sb) {
            try {
                const { data, error } = await sb
                    .from('posts')
                    .select('id, type, title, description, content, place_id, organization_id, status, visibility, image_url, link, target_id, target_type, event_start_at, event_end_at, offer_start_at, offer_end_at, created_at, published_at')
                    .in('type', ['event', 'offer', 'announcement', 'news', 'notice', 'video'])
                    .in('status', ['published', 'APPROVED'])
                    .eq('visibility', 'public')
                    .order('created_at', { ascending: false })
                    .limit(30);

                if (!error && Array.isArray(data)) {
                    return data.filter(p => !isExpired(p));
                }
            } catch (err) {
                console.warn('[Highlights] Supabase posts -haku epäonnistui:', err);
            }
        }

        // REST fallback
        try {
            const url = 'https://duxluwyqxvbmkkjzuzkz.supabase.co/rest/v1/posts?type=in.(event,offer,announcement,news,notice,video)&status=in.(published,APPROVED)&visibility=eq.public&select=id,type,title,description,content,place_id,organization_id,status,visibility,image_url,link,target_id,target_type,event_start_at,event_end_at,offer_start_at,offer_end_at,created_at,published_at&order=created_at.desc&limit=30';
            const res = await fetch(url, {
                headers: {
                    'apikey': 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu',
                    'Authorization': 'Bearer sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu'
                }
            });
            if (res.ok) {
                const raw = await res.json();
                return (raw || []).filter(p => !isExpired(p));
            }
        } catch (e) {
            console.warn('[Highlights] REST fallback epäonnistui:', e);
        }
        return [];
    }

    async function loadPlacesFromSupabase() {
        const sb = getSupabase();
        if (sb) {
            try {
                const { data, error } = await sb
                    .from('places')
                    .select('place_id, name, canonical_name, type, municipality, description')
                    .or('status.eq.active,status.eq.ACTIVE,status.is.null')
                    .limit(30);
                if (!error && data) return data;
            } catch (e) {
                console.warn('[Highlights] Places-haku epäonnistui:', e);
            }
        }
        return [];
    }

    async function loadKohdekortitJson() {
        try {
            const response = await fetch(`kohdekortit/kohteet.json?ts=${Date.now()}`);
            if (!response.ok) return [];
            const json = await response.json();
            return Array.isArray(json) ? json.filter(item => item && item.status !== 'inactive') : [];
        } catch (err) {
            return [];
        }
    }

    function getItemDestination(item) {
        if (!item) return { url: 'index.html', label: 'Avaa kohdekortti »', type: 'kohde' };

        // 1. Feed-julkaisut: ohjataan suoraan feediin kyseiseen julkaisuun
        const isFeed = item.type === 'notice' || 
                       item.type === 'feed' || 
                       item.type === 'pikkuilmoitus' || 
                       item.type === 'video' || 
                       item.target_type === 'feed' ||
                       item.source === 'feed';
        if (isFeed) {
            const id = item.id || item.target_id;
            return {
                url: id ? `index.html?item=${encodeURIComponent(id)}&feed=open` : 'index.html?feed=open',
                label: 'Avaa feed-julkaisu »',
                type: 'feed'
            };
        }

        // 2. Tapahtumat: ohjataan kohdekortti.html -sivulle
        const isEvent = item.type === 'event' || item.target_type === 'event';
        if (isEvent) {
            const id = item.id || item.target_id;
            return {
                url: id ? `kohdekortti.html?id=${encodeURIComponent(id)}` : 'kohdekortit.html',
                label: 'Näytä koko tapahtuma »',
                type: 'event'
            };
        }

        // 3. Seinäjulkaisut: ohjataan seina.html sivulle ko. julkaisuun
        const isSeina = item.type === 'announcement' || 
                        item.type === 'news' || 
                        item.type === 'wall' || 
                        item.target_type === 'wall' || 
                        item.target_type === 'project' ||
                        Boolean(item.organization_id) ||
                        item.source === 'posts';
        if (isSeina) {
            const id = item.id || item.target_id;
            return {
                url: id ? `seina.html?post=${encodeURIComponent(id)}` : 'seina.html',
                label: 'Avaa seinäjulkaisu »',
                type: 'seina'
            };
        }

        // Oletus: kohdekortti
        const id = item.id || item.target_id;
        return {
            url: id ? `kohdekortti.html?id=${encodeURIComponent(id)}` : 'kohdekortit.html',
            label: 'Avaa kohdekortti »',
            type: 'kohde'
        };
    }

    function normalizePostEntity(post) {
        const title = post.title || 'Laukaa-syöte';
        const desc = post.description || post.content || '';
        const img = post.image_url || null;
        const dest = getItemDestination(post);

        return {
            source: 'posts',
            id: post.id,
            target_id: post.target_id || null,
            target_type: post.target_type || null,
            organization_id: post.organization_id || null,
            title: title,
            description: desc,
            image: img,
            type: post.type || 'announcement',
            place_id: post.place_id || null,
            event_date: post.event_start_at || post.published_at || post.created_at,
            targetUrl: dest.url,
            ctaLabel: dest.label
        };
    }

    function normalizeKohdeEntity(entity) {
        return {
            source: 'kohde_json',
            id: entity.id,
            title: entity.name,
            description: entity.shortDescription || entity.description || '',
            image: Array.isArray(entity.images) && entity.images.length ? entity.images[0] : null,
            type: entity.type || 'kohde',
            targetUrl: `kohdekortti.html?id=${encodeURIComponent(entity.id)}`
        };
    }

    function normalizePlaceEntity(place) {
        const icon = placeTypeIcons[place.type] || '📍';
        const label = {
            NATURE: 'Luontokohde',
            LANDMARK: 'Nähtävyys',
            ATTRACTION: 'Nähtävyys',
            SERVICE: 'Palvelukeskus',
            BUILDING: 'Rakennus',
            AREA: 'Alue',
            ROUTE: 'Reitti'
        }[place.type] || 'Paikka';

        return {
            source: 'place',
            id: place.place_id,
            title: place.name || place.canonical_name,
            description: place.description || `${icon} ${label} – ${place.municipality || 'Laukaa'}`,
            image: null,
            type: 'place',
            placeIcon: icon,
            placeLabel: label,
            targetUrl: `tietoa-paikasta.html?id=${encodeURIComponent(place.place_id)}`
        };
    }

    function createCard(item) {
        const title = escapeHtml(item.title || 'Laukaa-syöte');
        const desc = truncate(item.description || '', 120);
        const typeLabel = escapeHtml(typeLabels[item.type] || 'Julkaisu');
        const typeIcon = typeIcons[item.type] || '📌';
        const targetUrl = item.targetUrl || 'kohdekortit.html';

        const card = document.createElement('article');

        if (item.type === 'event') {
            card.className = 'homepage-feed-highlights__card homepage-feed-highlights__card--event-text';
            const img = item.image;
            const rawDate = item.event_date;
            let dateStr = 'Tapahtuma';
            if (rawDate) {
                try {
                    const d = new Date(rawDate);
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
                    }
                } catch (e) {}
            }

            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    ${img ? `<div class="homepage-feed-highlights__card-media" style="background-image:url('${String(img).replace(/'/g, "\\'")}');"></div>` : ''}
                    <div class="homepage-feed-highlights__card-body homepage-feed-highlights__card-body--event-text">
                        <div class="homepage-feed-highlights__event-date-badge">
                            <span class="homepage-feed-highlights__event-date-icon">📅</span>
                            <span class="homepage-feed-highlights__event-date-text">${escapeHtml(dateStr)}</span>
                            <span class="homepage-feed-highlights__badge homepage-feed-highlights__badge--event">${typeLabel}</span>
                        </div>
                        <h3 class="homepage-feed-highlights__card-title">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta" style="color: #ea580c; font-weight: 700;">Näytä koko tapahtuma »</span>
                    </div>
                </a>
            `;
        } else if (item.type === 'offer') {
            card.className = 'homepage-feed-highlights__card';
            const img = item.image;
            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    ${img ? `<div class="homepage-feed-highlights__card-media" style="background-image:url('${String(img).replace(/'/g, "\\'")}');"></div>` : ''}
                    <div class="homepage-feed-highlights__card-body" style="background: linear-gradient(135deg, #fffcf0 0%, #fff 100%); border-top: 4px solid #f59e0b;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="homepage-feed-highlights__badge" style="background:#fef3c7; color:#b45309;">🎁 ${typeLabel}</span>
                        </div>
                        <h3 class="homepage-feed-highlights__card-title">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta" style="color: #b45309; font-weight: 700;">Katso tarjous »</span>
                    </div>
                </a>
            `;
        } else if (item.type === 'place') {
            card.className = 'homepage-feed-highlights__card homepage-feed-highlights__card--place';
            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    <div class="homepage-feed-highlights__card-body homepage-feed-highlights__card-body--place" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-top: 4px solid #059669; padding: 1.5rem; display:flex; flex-direction:column; gap:0.75rem; height:100%; box-sizing:border-box;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span style="font-size: 2rem; line-height:1;">${escapeHtml(item.placeIcon || '📍')}</span>
                            <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #059669; background: #dcfce7; padding: 0.25rem 0.75rem; border-radius: 50px;">${escapeHtml(item.placeLabel || 'Paikka')}</span>
                        </div>
                        <h3 class="homepage-feed-highlights__card-title" style="color: #064e3b; font-size: 1.1rem; margin: 0;">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc" style="color: #047857; font-size: 0.9rem; margin: 0; flex:1;">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta" style="color: #059669; font-weight: 700;">Tutustu paikkaan »</span>
                    </div>
                </a>
            `;
        } else {
            card.className = 'homepage-feed-highlights__card';
            const img = item.image || placeholderImage;
            card.innerHTML = `
                <a href="${targetUrl}" class="homepage-feed-highlights__card-link">
                    <div class="homepage-feed-highlights__card-media" style="background-image:url('${String(img).replace(/'/g, "\\'")}');"></div>
                    <div class="homepage-feed-highlights__card-body">
                        <span class="homepage-feed-highlights__badge">${typeIcon} ${typeLabel}</span>
                        <h3 class="homepage-feed-highlights__card-title">${title}</h3>
                        <p class="homepage-feed-highlights__card-desc">${desc}</p>
                        <span class="homepage-feed-highlights__card-cta">${escapeHtml(item.ctaLabel || 'Avaa julkaisu »')}</span>
                    </div>
                </a>
            `;
        }
        return card;
    }

    function renderHighlights(items) {
        root.innerHTML = '';
        if (!items.length) {
            root.innerHTML = '<div class="homepage-feed-highlights__empty">Ei nostoja saatavilla juuri nyt.</div>';
            return;
        }

        const cards = document.createElement('div');
        cards.className = 'homepage-feed-highlights__cards';

        items.forEach(item => cards.appendChild(createCard(item)));
        root.appendChild(cards);

        const action = document.createElement('div');
        action.className = 'homepage-feed-highlights__footer';
        action.innerHTML = `
            <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap; width: 100%;">
                <button type="button" class="btn-radar homepage-feed-highlights__button" data-i18n="feed_open_publications">${window.i18n ? window.i18n.t('feed_open_publications') : 'Avaa julkaisujen syöte'}</button>
                <a href="kohdekortit.html" class="btn-radar" style="text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:0.5rem; background: linear-gradient(135deg, #f5a623, #e09010); color: #000; box-shadow: 0 4px 12px rgba(245, 166, 35, 0.35); font-weight: 700;">📅 <span data-i18n="feed_events_and_offers">${window.i18n ? window.i18n.t('feed_events_and_offers') : 'Tapahtumat ja tarjoukset'}</span></a>
            </div>
        `;
        root.appendChild(action);

        const feedBtn = document.getElementById('toggle-feed-btn');
        const openButton = action.querySelector('.homepage-feed-highlights__button');
        if (openButton) {
            openButton.addEventListener('click', () => {
                if (feedBtn && feedBtn.classList.contains('closed')) {
                    feedBtn.click();
                }
                const content = document.getElementById('feed-accordion-content');
                if (content) {
                    content.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
    }

    async function loadHighlights() {
        root.innerHTML = '<div class="homepage-feed-highlights__loading">Ladataan nostoja…</div>';

        try {
            // 1. Hae julkaisut Supabase posts -taulusta
            const posts = await loadPostsFromSupabase();
            const normalizedPosts = posts.map(normalizePostEntity);

            // 2. Hae JSON-lähteet (fallback / täydentävä data) ja poista duplikaatit
            const jsonKohteet = await loadKohdekortitJson();
            const postUuids = new Set(posts.map(p => p.id).filter(Boolean));
            const postTargetIds = new Set(posts.map(p => p.target_id).filter(Boolean));
            const uniqueJson = jsonKohteet.filter(j => !postUuids.has(j.id) && !postTargetIds.has(j.id));
            const normalizedJson = uniqueJson.map(normalizeKohdeEntity);

            // 3. Hae paikkoja Supabasesta
            const places = await loadPlacesFromSupabase();
            const normalizedPlaces = shuffleArray(places).map(normalizePlaceEntity);

            // Yhdistetään kohde- ja julkaisukortit
            const allContentCards = [...normalizedPosts, ...normalizedJson];

            if (!allContentCards.length && !normalizedPlaces.length) {
                renderHighlights([]);
                return;
            }

            // Valitaan esille nostettavat 3 korttia:
            // - Erotellaan tapahtumat, tarjoukset ja yleiset julkaisut
            const events = allContentCards.filter(c => c.type === 'event');
            const offers = allContentCards.filter(c => c.type === 'offer');
            const others = allContentCards.filter(c => c.type !== 'event' && c.type !== 'offer');

            const selected = [];

            // Suositaan kuvalisia ja ajankohtaisia nostoja
            const hasImg = (c) => Boolean(c.image);

            // Jos tapahtumia löytyy, nostetaan 1 tapahtuma
            if (events.length > 0) {
                const pickedEvent = events.find(hasImg) || events[0];
                selected.push(pickedEvent);
            }

            // Jos tarjouksia löytyy, nostetaan 1 tarjous
            if (offers.length > 0 && selected.length < maxHighlights) {
                const pickedOffer = offers.find(hasImg) || offers[0];
                selected.push(pickedOffer);
            }

            // Mahdollisesti 1 paikkakortti monipuolisuuden vuoksi (50% todennäköisyys)
            if (normalizedPlaces.length > 0 && selected.length < maxHighlights && Math.random() < 0.5) {
                selected.push(normalizedPlaces[0]);
            }

            // Täytetään loput paikat muista julkaisuista (uutiset, tiedotteet, videot, ym.)
            const remainingPool = shuffleArray(
                allContentCards.filter(c => !selected.some(s => s.id === c.id))
            );

            // Ensisijaisesti kuvalliset julkaisut
            const withImages = remainingPool.filter(hasImg);
            const withoutImages = remainingPool.filter(c => !hasImg(c));
            const sortedRemaining = [...withImages, ...withoutImages];

            for (const item of sortedRemaining) {
                if (selected.length >= maxHighlights) break;
                selected.push(item);
            }

            // Jos vieläkin tilaa, täydennetään paikoilla
            if (selected.length < maxHighlights && normalizedPlaces.length > 0) {
                for (const p of normalizedPlaces) {
                    if (selected.length >= maxHighlights) break;
                    if (!selected.some(s => s.id === p.id)) {
                        selected.push(p);
                    }
                }
            }

            renderHighlights(selected.slice(0, maxHighlights));
        } catch (err) {
            console.error('Homepage feed highlights load failed:', err);
            root.innerHTML = '<div class="homepage-feed-highlights__error">Nostojen lataus epäonnistui. Yritä hetken kuluttua uudelleen.</div>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadHighlights);
    } else {
        loadHighlights();
    }
})();
