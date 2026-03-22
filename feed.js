/**
 * LaukaaInfo Feed Component — feed.js
 * ─────────────────────────────────────
 */

const LkiFeed = (() => {
  const TYPE_LABELS = {
    event:    '📅 Tapahtuma',
    business: '🏢 Yritys',
    offer:    '🎁 Tarjous'
  };

  const TYPE_CLASSES = {
    event:    'lki-badge-type--event',
    business: 'lki-badge-type--business',
    offer:    'lki-badge-type--offer'
  };

  const FILTERS = [
    { key: 'all',      label: 'Kaikki' },
    { key: 'event',    label: '📅 Tapahtumat' },
    { key: 'business', label: '🏢 Yritykset' },
    { key: 'offer',    label: '🎁 Tarjoukset' }
  ];

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleDateString('fi-FI', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch { return isoStr; }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }

  function renderSkeletons(list, count = 4) {
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'lki-card lki-card--skeleton';
      el.innerHTML = `
        <div class="lki-card__img-wrap lki-skeleton" style="height:100%;min-height:90px;"></div>
        <div class="lki-card__body" style="gap:0.6rem;">
          <div class="lki-skeleton" style="height:14px;width:60%;border-radius:6px;"></div>
          <div class="lki-skeleton" style="height:16px;width:90%;border-radius:6px;"></div>
          <div class="lki-skeleton" style="height:12px;width:75%;border-radius:6px;"></div>
        </div>
      `;
      list.appendChild(el);
    }
  }

  function cardHTML(item) {
    const typeLabel = TYPE_LABELS[item.type] || item.type;
    const typeClass = TYPE_CLASSES[item.type] || '';
    const promoted = item.is_promoted ? `<span class="lki-badge-promoted">⭐ NOSTETTU</span>` : '';
    const dateStr = formatDate(item.publish_at);
    const title = escapeHtml(item.title);
    const desc = escapeHtml(item.description);
    const imgSrc = item.image || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80';

    let socialHtml = '';
    const socials = [];
    if (item.website_url)   socials.push(`<a href="${item.website_url}" target="_blank" class="lki-social-icon" title="Verkkosivut">🌐</a>`);
    if (item.facebook_url)  socials.push(`<a href="${item.facebook_url}" target="_blank" class="lki-social-icon" title="Facebook">f</a>`);
    if (item.instagram_url) socials.push(`<a href="${item.instagram_url}" target="_blank" class="lki-social-icon" title="Instagram">📸</a>`);
    if (item.youtube_url)   socials.push(`<a href="${item.youtube_url}" target="_blank" class="lki-social-icon" title="YouTube">▶️</a>`);

    socialHtml = `
      <div class="lki-card__actions">
        ${socials.length > 0 ? `<div class="lki-card__social-links">${socials.join('')}</div>` : ''}
        <button class="lki-card__share-btn" data-share-id="${item.id}" title="Kopioi jakolinkki" aria-label="Jaa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
        </button>
      </div>
    `;

    return `
      <article class="lki-card${item.is_promoted ? ' is-promoted' : ''}" data-id="${item.id || ''}" id="lki-feed-item-${item.id || ''}" role="article">
        <div class="lki-card__img-wrap">
          <img class="lki-card__img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=70'">
        </div>
        <div class="lki-card__body">
          <div class="lki-card__badges">
            <span class="lki-badge-type ${typeClass}">${typeLabel}</span>
            ${promoted}
          </div>
          <h3 class="lki-card__title">${title}</h3>
          <p class="lki-card__desc">${desc}</p>
          <div class="lki-card__footer">
            <div class="lki-card__date">🕐 ${dateStr}</div>
            ${socialHtml}
          </div>
        </div>
      </article>
    `;
  }

  function renderList(list, items, activeFilter) {
    if (!list) return;
    const filtered = activeFilter === 'all' ? items : items.filter(i => i.type === activeFilter);
    if (filtered.length === 0) {
      list.innerHTML = `<div class="lki-feed__empty">Ei sisältöä vielä.</div>`;
      return;
    }
    list.innerHTML = filtered.map(cardHTML).join('');
  }

  function buildContainer(root) {
    root.innerHTML = `
      <div class="lki-feed">
        <div class="lki-feed__header">
          <span class="lki-live-dot"></span>
          <h2>Uusimmat julkaisut</h2>
          <button class="lki-feed__refresh-btn" id="lki-refresh-trigger" title="Päivitä">🔄</button>
        </div>
        <div class="lki-feed__status-msg hidden" id="lki-status-text">Päivitetään...</div>
        <div class="lki-feed__new-notification hidden" id="lki-new-alert">Uusia päivityksiä saatavilla! 🚀</div>
        <div class="lki-feed__filters" role="group" aria-label="Suodata"></div>
        <div class="lki-feed__list" aria-live="polite"></div>
      </div>
    `;
  }

  function init(selector, options = {}) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) return;

    const dataUrl = options.dataUrl || root.dataset.feedSrc || 'laukaainfo-web/api.php';
    buildContainer(root);
    
    const container = root.querySelector('.lki-feed');
    const list = container.querySelector('.lki-feed__list');
    const refreshBtn = container.querySelector('#lki-refresh-trigger');
    const statusText = container.querySelector('#lki-status-text');
    const newAlert = container.querySelector('#lki-new-alert');
    const filterBar = container.querySelector('.lki-feed__filters');

    let currentItems = [];
    let activeFilter = options.initialFilter || 'all';
    // Map Finnish names if used in URL
    const filterMap = { 'tapahtumat': 'event', 'yritykset': 'business', 'tarjoukset': 'offer', 'tapahtuma': 'event', 'yritys': 'business', 'tarjous': 'offer' };
    if (filterMap[activeFilter]) activeFilter = filterMap[activeFilter];
    
    let lightboxEl = null;
    let lightboxImg = null;

    function setupLightbox() {
      if (document.getElementById('lki-lightbox')) return;
      
      lightboxEl = document.createElement('div');
      lightboxEl.id = 'lki-lightbox';
      lightboxEl.className = 'lki-lightbox';
      lightboxEl.setAttribute('role', 'dialog');
      lightboxEl.setAttribute('aria-label', 'Kuvan katselu');
      
      lightboxEl.innerHTML = `
        <div class="lki-lightbox__content">
          <button class="lki-lightbox__close" aria-label="Sulje">&times;</button>
          <img class="lki-lightbox__img" src="" alt="">
        </div>
      `;
      
      document.body.appendChild(lightboxEl);
      lightboxImg = lightboxEl.querySelector('.lki-lightbox__img');
      
      // Close handlers
      const close = () => {
        lightboxEl.classList.remove('is-open');
        document.body.classList.remove('lki-no-scroll');
      };
      
      lightboxEl.addEventListener('click', (e) => {
        if (e.target === lightboxEl || e.target.classList.contains('lki-lightbox__close')) {
          close();
        }
      });
      
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightboxEl.classList.contains('is-open')) {
          close();
        }
      });
    }

    function openLightbox(src, alt) {
      if (!lightboxEl) setupLightbox();
      lightboxImg.src = src;
      lightboxImg.alt = alt || 'Kuva';
      lightboxEl.classList.add('is-open');
      document.body.classList.add('lki-no-scroll');
    }

    let isInitialLoad = true;

    function loadFeed(forceRefresh = false) {
      if (forceRefresh) {
        refreshBtn.classList.add('is-loading');
        statusText.classList.remove('hidden');
      }

      // Bypass cache with timestamp
      const fetchUrl = dataUrl + (dataUrl.includes('?') ? '&' : '?') + 'ts=' + Date.now();

      // Create a promise for minimum display duration (800ms)
      const minDelay = new Promise(resolve => setTimeout(resolve, forceRefresh ? 800 : 0));

      const fetchPromise = fetch(fetchUrl)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });

      Promise.all([fetchPromise, minDelay])
        .then(([res]) => {
          const data = Array.isArray(res) ? res : (res.data || []);
          
          // Detect new content (compare first item ID)
          if (!isInitialLoad && data.length > 0 && currentItems.length > 0) {
            if (data[0].id !== currentItems[0].id) {
              newAlert.classList.remove('hidden');
            }
          }

          currentItems = data;
          
          if (isInitialLoad) {
            renderList(list, currentItems, activeFilter);
            buildFilters();
            isInitialLoad = false;
            
            if (options.initialItemId) {
              setTimeout(() => {
                const targetCard = list.querySelector(`.lki-card[data-id="${options.initialItemId}"]`);
                if (targetCard) {
                  targetCard.classList.add('is-expanded');
                  targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  const origShadow = targetCard.style.boxShadow;
                  targetCard.style.transition = 'box-shadow 0.5s ease';
                  targetCard.style.boxShadow = '0 0 0 4px var(--accent)';
                  setTimeout(() => {
                    targetCard.style.boxShadow = origShadow;
                  }, 2500);
                }
              }, 300);
            }
          } else if (forceRefresh) {
            renderList(list, currentItems, activeFilter);
            newAlert.classList.add('hidden');
          }
        })
        .catch(err => {
          console.error('[LkiFeed] Load error:', err);
          if (isInitialLoad) {
               list.innerHTML = `<div class="lki-feed__error">Ei yhteyttä – näytetään viimeisin sisältö.</div>`;
          }
        })
        .finally(() => {
          refreshBtn.classList.remove('is-loading');
          statusText.classList.add('hidden');
        });
    }

    function buildFilters() {
      filterBar.innerHTML = '';
      FILTERS.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'lki-feed__filter-btn' + (f.key === activeFilter ? ' active' : '');
        btn.textContent = f.label;
        btn.addEventListener('click', () => {
          filterBar.querySelectorAll('.lki-feed__filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeFilter = f.key;
          renderList(list, currentItems, activeFilter);
        });
        filterBar.appendChild(btn);
      });
    }

    // Handlers
    list.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('.lki-card__share-btn');
      if (shareBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cardId = shareBtn.getAttribute('data-share-id');
        
        // Päätellään jakolinkki datan alkuperäisestä osoitteesta
        let shareBaseUrl = options.shareUrl || root.dataset.shareSrc;
        if (!shareBaseUrl) {
           // Tehdään data-osoitteesta varmasti absoluuttinen
           const absoluteDataUrl = new URL(dataUrl, window.location.href).href;
           
           if (absoluteDataUrl.includes('api.php')) {
               shareBaseUrl = absoluteDataUrl.split('?')[0].replace(/api\.php$/, 'item.php');
           } else {
               // Jos api.php ei löydy polusta, korvataan viimeinen osa item.php:llä
               shareBaseUrl = absoluteDataUrl.split('?')[0];
               shareBaseUrl = shareBaseUrl.substring(0, shareBaseUrl.lastIndexOf('/') + 1) + 'item.php';
           }
        }
        
        const shareUrl = shareBaseUrl + '?id=' + encodeURIComponent(cardId);
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            const origHTML = shareBtn.innerHTML;
            shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
            setTimeout(() => shareBtn.innerHTML = origHTML, 2000);
        }).catch(err => console.error('Clip err', err));
        return;
      }

      const img = e.target.closest('.lki-card__img');
      if (img) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(img.src, img.alt);
        return;
      }
      
      const card = e.target.closest('.lki-card');
      if (card) {
        // Älä reagoi linkkien klikkauksiin (esim. sosiaalisen median linkit)
        if (e.target.closest('a')) return;
        
        card.classList.toggle('is-expanded');
      }
    });

    refreshBtn.addEventListener('click', () => loadFeed(true));
    newAlert.addEventListener('click', () => {
      renderList(list, currentItems, activeFilter);
      newAlert.classList.add('hidden');
      window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' });
    });

    // Auto-refresh every 90s
    setInterval(() => loadFeed(false), 90000);

    // Start
    renderSkeletons(list, 4);
    loadFeed(false);
  }

  function autoInit() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialFilter = urlParams.get('filter') || urlParams.get('feed_filter'); 
    const initialItemId = urlParams.get('item') || urlParams.get('feed_item') || urlParams.get('id');
    document.querySelectorAll('[data-feed-src]').forEach(el => init(el, { initialFilter, initialItemId }));
  }

  return { init, autoInit };
})();

LkiFeed.autoInit();
