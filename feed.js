/**
 * LaukaaInfo Feed Component — feed.js
 * ─────────────────────────────────────
 */

const LkiFeed = (() => {
  const TYPE_LABELS = {
    event:    '📅 Tapahtuma',
    business: '🏢 Yritys',
    community: '👥 Yhteisö',
    story:    '📖 Tarina',
    offer:    '🎁 Tarjous',
    notice:   '📢 Ilmoitus',
    video:    '🎥 Video',
    pikkuilmoitus: '🔥 Ajankohtaista'
  };

  const TYPE_CLASSES = {
    event:    'lki-badge-type--event',
    business: 'lki-badge-type--business',
    community: 'lki-badge-type--community',
    association: 'lki-badge-type--association',
    story:    'lki-badge-type--story',
    offer:    'lki-badge-type--offer',
    notice:   'lki-badge-type--notice',
    video:    'lki-badge-type--video',
    pikkuilmoitus: 'lki-badge-type--market'
  };

  const FILTERS = [
    { key: 'all',       label: 'Kaikki' },
    { key: 'community', label: '👥 Yhteisöt' },
    { key: 'story',     label: '📖 Tarinat' },
    { key: 'event',     label: '📅 Tapahtumat' },
    { key: 'offer',     label: '🎁 Tarjoukset' },
    { key: 'notice',    label: '📢 Ilmoitukset' },
    { key: 'video',     label: '🎥 Videot' }
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
    let typeLabel = TYPE_LABELS[item.type] || item.type;
    let typeClass = TYPE_CLASSES[item.type] || '';

    // Differentiate between Yritys and Yhdistys based on rowid
    if (item.type === 'business' || item.type === 'community') {
      const bId = parseInt(item.business_id || item.business_rowid || 0);
      if (bId > 1000) {
        typeLabel = '⛪ Yhdistys';
        typeClass = TYPE_CLASSES['association'];
      } else {
        typeLabel = '🏢 Yritys';
        typeClass = TYPE_CLASSES['business'];
      }
    }
    const promoted = item.is_promoted ? `<span class="lki-badge-promoted">⭐ NOSTETTU</span>` : '';
    const dateStr = formatDate(item.publish_at);
    const title = escapeHtml(item.title);
    const desc = escapeHtml(item.description);
    let imgSrc = item.image || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80';

    // Robust video detection: if image is a youtube thumbnail OR a direct link, extract ID
    let video_id = item.video_id;
    const ytPatterns = [
        { key: 'img.youtube.com/vi/', parser: (s) => s.split('/vi/')[1]?.split('/')[0] },
        { key: 'youtube.com/shorts/', parser: (s) => s.split('/shorts/')[1]?.split('?')[0]?.split('&')[0] },
        { key: 'youtube.com/watch?v=', parser: (s) => s.split('v=')[1]?.split('&')[0] },
        { key: 'youtu.be/', parser: (s) => s.split('youtu.be/')[1]?.split('?')[0] }
    ];

    if (!video_id && imgSrc) {
        for (const p of ytPatterns) {
            if (imgSrc.includes(p.key)) {
                video_id = p.parser(imgSrc);
                if (video_id) break;
            }
        }
    }
    const isVideo = !!video_id;

    let socialHtml = '';
    const socials = [];
    if (item.website_url)   socials.push(`<a href="${item.website_url}" target="_blank" class="lki-social-icon" title="Verkkosivut">🌐</a>`);
    if (item.facebook_url)  socials.push(`<a href="${item.facebook_url}" target="_blank" class="lki-social-icon" title="Facebook">f</a>`);
    if (item.instagram_url) socials.push(`<a href="${item.instagram_url}" target="_blank" class="lki-social-icon" title="Instagram">📸</a>`);
    if (item.youtube_url)   socials.push(`<a href="${item.youtube_url}" target="_blank" class="lki-social-icon" title="YouTube">▶️</a>`);


    let contactHtml = '';
    if (item.show_contact) {
      const shareUrlForContact = `https://laukaainfo.fi/?item=${item.id}&feed=open`;
      const emailSubject = encodeURIComponent(`Kysymys LaukaaInfosta: ${item.title}`);
      const emailBody = encodeURIComponent(`Hei! Näin ilmoituksenne LaukaaInfossa:\n"${item.title}"\n\n${shareUrlForContact}`);
      const waText = encodeURIComponent(`Hei! Näin tämän LaukaaInfossa:\n"${item.title}"\n${shareUrlForContact}`);

      const contacts = [];
      if (item.contact_email) contacts.push(`<a href="mailto:${item.contact_email}?subject=${emailSubject}&body=${emailBody}" class="lki-contact-icon" title="Ota yhteyttä sähköpostilla">✉️</a>`);
      if (item.contact_phone) contacts.push(`<a href="https://wa.me/${item.contact_phone}?text=${waText}" target="_blank" class="lki-contact-icon" title="Ota yhteyttä WhatsAppilla">💬</a>`);
      
      if (contacts.length > 0) {
        contactHtml = `<div class="lki-contact-links">${contacts.join('')}</div>`;
      }
    }

    socialHtml = `
      <div class="lki-card__actions">
        ${socials.length > 0 ? `<div class="lki-card__social-links">${socials.join('')}</div>` : ''}
      </div>
    `;

    const videoAttr = isVideo ? `data-video-id="${video_id}" data-is-shorts="${item.is_shorts || imgSrc.includes('hqdefault') ? 'true' : 'false'}"` : '';
    const publisher = item.publisher_name ? `<span class="lki-card__publisher">${escapeHtml(item.publisher_name)}</span>` : '';

    if (item.type === 'pikkuilmoitus') {
      return `
        <article class="lki-card lki-card--market" style="border-left: 5px solid #ffb100; background: #fffdf5; display: block; padding-right: 10px;">
          <div class="lki-card__body" style="width: 100%; box-sizing: border-box;">
            <div class="lki-card__badges">
              <span class="lki-badge-type lki-badge-type--market">🔥 NYT AJANKOHTAISTA</span>
            </div>
            <h3 class="lki-card__title" style="color: #d35400; margin-top: 5px;">${title}</h3>
            <p class="lki-card__desc" style="margin-top: 5px; margin-bottom: 10px;">${desc}</p>
            <div class="lki-card__footer" style="border-top: none; padding-top: 0;">
              <a href="pikkuilmot.html" class="btn-fb" style="display: block; background: #ffb100; color: #000; width: 100%; border-radius: 8px; text-align: center; padding: 12px; font-weight: 700; text-decoration: none; box-sizing: border-box; transition: background 0.2s;">Katso kaikki ilmoitukset (Pikkuilmot) →</a>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="lki-card${item.is_promoted ? ' is-promoted' : ''}${isVideo ? ' lki-card--video' : ''}" data-id="${item.id || ''}" id="lki-feed-item-${item.id || ''}" role="article" ${videoAttr}>
        <div class="lki-card__img-wrap">
          <img class="lki-card__img" src="${imgSrc}" alt="${title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=70'">
          ${isVideo ? '<div class="lki-card__video-placeholder"></div><div class="lki-card__play-indicator">▶️</div>' : ''}
        </div>
        <div class="lki-card__body">
          <div class="lki-card__badges">
            <span class="lki-badge-type ${typeClass}">${typeLabel}</span>
            ${publisher}
            ${promoted}
          </div>
          <h3 class="lki-card__title">${title}</h3>
          <p class="lki-card__desc">${desc}</p>
          <div class="lki-card__footer">
            <div class="lki-card__date">🕐 ${dateStr} ${contactHtml}</div>
            ${socialHtml}
          </div>
          ${isVideo ? '<button class="lki-card__unmute-btn" title="Laita äänet päälle">🔊</button>' : ''}
        </div>
      </article>
    `;
  }

  let videoObserver = null;
  function setupVideoObservers(list) {
    if (!window.IntersectionObserver) return;
    
    if (!videoObserver) {
      videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const card = entry.target;
          const container = card.querySelector('.lki-card__video-placeholder');
          const videoId = card.dataset.videoId;
          
          if (entry.isIntersecting) {
            if (container && !container.innerHTML && videoId) {
              // Start muted autoplay preview
              container.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
              card.classList.add('is-playing');
            }
          } else {
            if (container && container.innerHTML) {
              container.innerHTML = '';
              card.classList.remove('is-playing');
            }
          }
        });
      }, { threshold: 0.1, rootMargin: '50px' });
    }

    list.querySelectorAll('.lki-card--video').forEach(card => {
      videoObserver.observe(card);
    });
  }

  function stopAllVideos() {
    document.querySelectorAll('.lki-card--video').forEach(card => {
      const container = card.querySelector('.lki-card__video-placeholder');
      if (container && container.innerHTML !== '') {
        container.innerHTML = '';
      }
      card.classList.remove('is-playing');
      card.classList.remove('is-playing-unmuted');
      const unmuteBtn = card.querySelector('.lki-card__unmute-btn');
      if (unmuteBtn) {
        unmuteBtn.innerHTML = '🔊';
        unmuteBtn.title = 'Laita äänet päälle';
      }
    });
  }

  function renderList(list, items, activeFilter, activeBusiness) {
    if (!list) return;
    let filtered = items;
    
    // Filter by business ID if provided
    if (activeBusiness) {
      filtered = filtered.filter(i => i.business_id == activeBusiness || i.business_rowid == activeBusiness);
    }
    
    // Filter by type
    if (activeFilter !== 'all') {
      if (activeFilter === 'community') {
        // Community filter includes both business and community types
        filtered = filtered.filter(i => i.type === 'business' || i.type === 'community');
      } else {
        filtered = filtered.filter(i => i.type === activeFilter);
      }
    }

    if (filtered.length === 0) {
      list.innerHTML = `<div class="lki-feed__empty">Ei sisältöä vielä.</div>`;
    } else {
      list.innerHTML = filtered.map(cardHTML).join('');
    }

    // CTA-banneri feedin lopussa (näkyy aina)
    const ctaEl = document.createElement('div');
    ctaEl.className = 'lki-feed__cta-banner';
    ctaEl.innerHTML = `
      <p>Haluatko näkyä täällä?</p>
      <a href="ilmoittaudu.html" class="lki-feed__cta-link">👉 Julkaise LaukaaInfossa</a>
    `;
    list.appendChild(ctaEl);
    
    // Setup video observers after rendering
    setupVideoObservers(list);
  }

  function buildContainer(root) {
    root.innerHTML = `
      <div class="lki-feed">
        <div class="lki-feed__header">
          <span class="lki-live-dot"></span>
          <h2>Uusimmat julkaisut</h2>
          <div class="lki-feed__header-actions">
            <button class="lki-feed__share-btn" id="lki-share-trigger" title="Jaa tämä näkymä">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
              <span>Jaa</span>
            </button>
            <button class="lki-feed__refresh-btn" id="lki-refresh-trigger" title="Päivitä">🔄</button>
          </div>
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
    const shareFeedBtn = container.querySelector('#lki-share-trigger');
    const statusText = container.querySelector('#lki-status-text');
    const newAlert = container.querySelector('#lki-new-alert');
    const filterBar = container.querySelector('.lki-feed__filters');

    let currentItems = [];
    let activeFilter = options.initialFilter || 'all';
    let activeBusiness = options.initialBusiness || null;

    // Map Finnish names if used in URL
    const filterMap = { 
        'tapahtumat': 'event', 'yritykset': 'community', 'yhteisot': 'community', 'yhteisö': 'community', 'tarinat': 'story', 'tarina': 'story', 'tarjoukset': 'offer', 'ilmoitukset': 'notice', 'videot': 'video',
        'tapahtuma': 'event', 'yritys': 'community', 'tarjous': 'offer', 'ilmoitus': 'notice', 'video': 'video'
    };
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
          <div class="lki-lightbox__media-container">
            <img class="lki-lightbox__img" src="" alt="">
            <div class="lki-lightbox__video"></div>
          </div>
        </div>
      `;
      
      document.body.appendChild(lightboxEl);
      lightboxImg = lightboxEl.querySelector('.lki-lightbox__img');
      const lightboxVideo = lightboxEl.querySelector('.lki-lightbox__video');
      
      // Close handlers
      const close = () => {
        lightboxEl.classList.remove('is-open');
        lightboxEl.classList.remove('is-shorts');
        lightboxVideo.innerHTML = '';
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

    function openLightbox(src, alt, videoId = null, isShorts = false) {
      stopAllVideos(); 
      if (!lightboxEl) setupLightbox();
      const videoContainer = lightboxEl.querySelector('.lki-lightbox__video');
      
      if (videoId) {
        lightboxImg.style.display = 'none';
        videoContainer.style.display = 'block';
        videoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        if (isShorts) lightboxEl.classList.add('is-shorts');
      } else {
        lightboxImg.style.display = 'block';
        videoContainer.style.display = 'none';
        videoContainer.innerHTML = '';
        lightboxImg.src = src;
        lightboxImg.alt = alt || 'Kuva';
      }

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
      const pikkuUrl = 'https://www.mediazoo.fi/laukaainfo-web/lki-tori-api.php?ts=' + Date.now();

      // Create a promise for minimum display duration (800ms)
      const minDelay = new Promise(resolve => setTimeout(resolve, forceRefresh ? 800 : 0));

      const fetchPromise = fetch(fetchUrl)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });

      // Implement 12-hour caching for Pikkuilmot summary
      const CACHE_KEY = 'lki_pikku_cache';
      const CACHE_EXPIRY = 12 * 60 * 60 * 1000; // 12 hours
      let pikkuPromise;

      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.ts < CACHE_EXPIRY) {
              pikkuPromise = Promise.resolve(parsed.data);
            }
          }
        } catch (e) { console.warn('Cache read error', e); }
      }

      if (!pikkuPromise) {
        pikkuPromise = fetch(pikkuUrl)
          .then(r => r.ok ? r.json() : null)
          .then(res => {
            if (res && res.status === 'ok') {
               localStorage.setItem(CACHE_KEY, JSON.stringify({ data: res, ts: Date.now() }));
            }
            return res;
          })
          .catch(() => null);
      }

      Promise.all([fetchPromise, pikkuPromise, minDelay])
        .then(([res, pikkuRes]) => {
          let data = Array.isArray(res) ? res : (res.data || []);
          
          if (pikkuRes && pikkuRes.data && pikkuRes.data.length > 0) {
            // Group by tags to find most popular
            const tagCounts = {};
            pikkuRes.data.forEach(ad => {
               (ad.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
            });
            const topTag = Object.entries(tagCounts).sort((a,b) => b[1] - a[1])[0];
            
            // Create summary card
            const summaryCard = {
                id: 'pikkuilmot-summary',
                type: 'pikkuilmoitus',
                title: topTag ? `${topTag[0].toUpperCase()} - tarjontaa Laukaassa` : 'Pikkuilmoitukset Laukaassa',
                description: `${pikkuRes.data.length} uutta ilmoitusta tällä viikolla. Löydä palvelut ja tekijät läheltäsi.`,
                publish_at: pikkuRes.data[0].publish_at,
                is_promoted: true
            };
            
            // Inject summary card at index 1 or 2
            data.splice(1, 0, summaryCard);
          }
          
          // Detect new content: Check if the top item IDs or the summary content has changed
          if (!isInitialLoad && data.length > 0 && currentItems.length > 0) {
            const newKeys = data.slice(0, 3).map(i => i.id).join('|');
            const oldKeys = currentItems.slice(0, 3).map(i => i.id).join('|');
            
            if (newKeys !== oldKeys) {
               newAlert.classList.remove('hidden');
            }
          }

          currentItems = data;
          
          if (isInitialLoad) {
            renderList(list, currentItems, activeFilter, activeBusiness);
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
            renderList(list, currentItems, activeFilter, activeBusiness);
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
          activeBusiness = null; // Reset business-specific filter when a category is manually selected
          renderList(list, currentItems, activeFilter, activeBusiness);
        });
        filterBar.appendChild(btn);
      });
    }

    // Handlers
    // Header sharing handler
    shareFeedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        let filterSlug = activeFilter;
        // Käännetään takaisin suomeksi jos mahdollista URL:ää varten
        const invMap = { 'event': 'tapahtumat', 'community': 'yhteisot', 'story': 'tarinat', 'offer': 'tarjoukset', 'notice': 'ilmoitukset', 'video': 'videot' };
        if (invMap[activeFilter]) filterSlug = invMap[activeFilter];

        const baseUrl = 'https://laukaainfo.fi/';
        let shareUrl = `${baseUrl}?filter=${encodeURIComponent(filterSlug)}&feed=open`;
        
        if (activeBusiness) {
            shareUrl += `&business_id=${encodeURIComponent(activeBusiness)}`;
        }

        navigator.clipboard.writeText(shareUrl).then(() => {
            const origHTML = shareFeedBtn.innerHTML;
            shareFeedBtn.innerHTML = '<span style="color:#27ae60">Linkki kopioitu! ✅</span>';
            shareFeedBtn.classList.add('is-success');
            setTimeout(() => {
                shareFeedBtn.innerHTML = origHTML;
                shareFeedBtn.classList.remove('is-success');
            }, 2000);
        }).catch(err => console.error('Clip err', err));
    });

    list.addEventListener('click', (e) => {


      const img = e.target.closest('.lki-card__img');
      const card = e.target.closest('.lki-card');
      
      if (img && card) {
        e.preventDefault();
        e.stopPropagation();
        
        if (card.classList.contains('lki-card--video')) {
            const vid = card.dataset.videoId;
            const isShorts = card.dataset.isShorts === 'true';
            openLightbox('', '', vid, isShorts);
        } else {
            openLightbox(img.src, img.alt);
        }
        return;
      }
      if (card) {
        // Älä reagoi linkkien klikkauksiin (esim. sosiaalisen median linkit)
        if (e.target.closest('a')) return;

        // NEW: Open Media Modal if is a business item or has rich media
        const itemId = card.dataset.id;
        const item = currentItems.find(i => i.id === itemId);
        
        if (item && window.LkiModal) {
            const isBusiness = item.business_id || item.type === 'business' || item.type === 'community';
            // Only open modal if it's a "premium" or business item
            if (isBusiness || (item.images && item.images.length > 0) || (item.videos && item.videos.length > 0)) {
                LkiModal.open({
                   ...item,
                   nimi: item.title,
                   esittely: item.description,
                   puhelin: item.contact_phone || item.contact_whatsapp,
                   package: item.package || (item.is_promoted ? 'pro' : 'perus')
                });
                return; // Stop here if we opened the modal
            }
        }

        const isNowExpanded = card.classList.toggle('is-expanded');
        
        if (card.classList.contains('lki-card--video')) {
            // Force stop others and play this one
            if (isNowExpanded) {
                stopAllVideos(); // Pysäytetään muut ennen tämän käynnistystä
                const vid = card.dataset.videoId;
                const container = card.querySelector('.lki-card__video-placeholder');
                if (container && vid) {
                     container.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                     card.classList.add('is-playing');
                }
            } else {
                // Sulkiessa sammutetaan tämä video
                const container = card.querySelector('.lki-card__video-placeholder');
                if (container) container.innerHTML = '';
                card.classList.remove('is-playing');
            }
        }
      }
    });

    // Unmute handler — change to Toggle
    list.addEventListener('click', (e) => {
        const unmuteBtn = e.target.closest('.lki-card__unmute-btn');
        if (unmuteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const card = unmuteBtn.closest('.lki-card');
            const container = card.querySelector('.lki-card__video-placeholder');
            const vid = card.dataset.videoId;
            if (container && vid) {
                const nowPlaying = card.classList.contains('is-playing-unmuted');
                if (!nowPlaying) {
                   // Unmute
                   container.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&mute=0&controls=1&loop=1&playlist=${vid}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                   unmuteBtn.innerHTML = '🔇';
                   unmuteBtn.title = 'Mykistä';
                   card.classList.add('is-playing-unmuted');
                } else {
                   // Mute again
                   container.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                   unmuteBtn.innerHTML = '🔊';
                   unmuteBtn.title = 'Laita äänet päälle';
                   card.classList.remove('is-playing-unmuted');
                }
            }
        }
    });

    refreshBtn.addEventListener('click', () => loadFeed(true));
    newAlert.addEventListener('click', () => {
      renderList(list, currentItems, activeFilter, activeBusiness);
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
    const initialBusiness = urlParams.get('business_id') || urlParams.get('company') || urlParams.get('rowid');
    const initialItemId = urlParams.get('item') || urlParams.get('feed_item') || urlParams.get('id');
    document.querySelectorAll('[data-feed-src]').forEach(el => init(el, { initialFilter, initialBusiness, initialItemId }));
  }

  return { init, autoInit };
})();

LkiFeed.autoInit();
