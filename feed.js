/**
 * LaukaaInfo Feed Component — feed.js
 * ─────────────────────────────────────
 * Usage:
 *   LkiFeed.init('#feed-root', { dataUrl: 'demo-data.json' });
 *
 * Or via data attribute:
 *   <div id="feed-root" data-feed-src="demo-data.json"></div>
 *   LkiFeed.autoInit();
 */

const LkiFeed = (() => {
  // ── Labels & icons ─────────────────────────────────────────────
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

  // ── Helpers ────────────────────────────────────────────────────
  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleDateString('fi-FI', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch {
      return isoStr;
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }

  // ── Skeleton placeholders ───────────────────────────────────────
  function renderSkeletons(container, count = 4) {
    const list = container.querySelector('.lki-feed__list');
    if (!list) return;

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

  // ── Single card HTML ────────────────────────────────────────────
  function cardHTML(item) {
    const typeLabel  = TYPE_LABELS[item.type]  || item.type;
    const typeClass  = TYPE_CLASSES[item.type] || '';
    const promoted   = item.is_promoted
      ? `<span class="lki-badge-promoted">⭐ NOSTETTU</span>` : '';
    const dateStr   = formatDate(item.publish_at);
    const title     = escapeHtml(item.title);
    const desc      = escapeHtml(item.description);
    const imgSrc    = item.image || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80';

    // Social links
    let socialHtml = '';
    const socials = [];
    if (item.website_url)   socials.push(`<a href="${item.website_url}" target="_blank" class="lki-social-icon" title="Verkkosivut">🌐</a>`);
    if (item.facebook_url)  socials.push(`<a href="${item.facebook_url}" target="_blank" class="lki-social-icon" title="Facebook">f</a>`);
    if (item.instagram_url) socials.push(`<a href="${item.instagram_url}" target="_blank" class="lki-social-icon" title="Instagram">📸</a>`);
    if (item.youtube_url)   socials.push(`<a href="${item.youtube_url}" target="_blank" class="lki-social-icon" title="YouTube">▶️</a>`);

    if (socials.length > 0) {
      socialHtml = `<div class="lki-card__socials">${socials.join('')}</div>`;
    }

    return `
      <article class="lki-card${item.is_promoted ? ' is-promoted' : ''}" role="article">
        <div class="lki-card__img-wrap">
          <img
            class="lki-card__img"
            src="${imgSrc}"
            alt="${title}"
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=70'"
          >
        </div>
        <div class="lki-card__body">
          <div class="lki-card__badges">
            <span class="lki-badge-type ${typeClass}">${typeLabel}</span>
            ${promoted}
          </div>
          <h3 class="lki-card__title">${title}</h3>
          <p class="lki-card__desc">${desc}</p>
          <div class="lki-card__date">🕐 ${dateStr}</div>
          ${socialHtml}
        </div>
      </article>
    `;
  }

  // ── Render items list ───────────────────────────────────────────
  function renderList(container, items, activeFilter) {
    const list = container.querySelector('.lki-feed__list');
    if (!list) return;

    const filtered = activeFilter === 'all'
      ? items
      : items.filter(i => i.type === activeFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="lki-feed__empty">Ei tuloksia valitussa suodattimessa.</div>`;
      return;
    }

    list.innerHTML = filtered.map(cardHTML).join('');

    // Click handler → open link if item has one
    list.querySelectorAll('.lki-card').forEach((cardEl, idx) => {
      const item = filtered[idx];
      if (item && item.link) {
        cardEl.addEventListener('click', () => {
          window.open(item.link, '_blank', 'noopener');
        });
      }
    });
  }

  // ── Build container HTML ────────────────────────────────────────
  function buildContainer(root) {
    root.innerHTML = `
      <div class="lki-feed">
        <div class="lki-feed__header">
          <span class="lki-live-dot"></span>
          <h2>Uusimmat julkaisut</h2>
        </div>
        <div class="lki-feed__filters" role="group" aria-label="Suodata"></div>
        <div class="lki-feed__list" aria-live="polite"></div>
      </div>
    `;
  }

  // ── Filter bar ──────────────────────────────────────────────────
  function buildFilters(container, items, onFilter) {
    const bar = container.querySelector('.lki-feed__filters');
    if (!bar) return;

    FILTERS.forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'lki-feed__filter-btn' + (f.key === 'all' ? ' active' : '');
      btn.textContent = f.label;
      btn.dataset.filter = f.key;
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.lki-feed__filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onFilter(f.key);
      });
      bar.appendChild(btn);
    });
  }

  // ── Main init ───────────────────────────────────────────────────
  function init(selector, options = {}) {
    const root = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!root) {
      console.warn('[LkiFeed] Root element not found:', selector);
      return;
    }

    const dataUrl = options.dataUrl || root.dataset.feedSrc || 'demo-data.json';

    buildContainer(root);
    const container = root.querySelector('.lki-feed');

    // Show skeletons while loading
    renderSkeletons(container, 4);

    fetch(dataUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        // Sort: newest first
        const sorted = [...data].sort((a, b) => {
          return new Date(b.publish_at) - new Date(a.publish_at);
        });

        let activeFilter = 'all';

        buildFilters(container, sorted, filter => {
          activeFilter = filter;
          renderList(container, sorted, activeFilter);
        });

        renderList(container, sorted, activeFilter);
      })
      .catch(err => {
        const list = container.querySelector('.lki-feed__list');
        if (list) {
          list.innerHTML = `<div class="lki-feed__empty">⚠️ Sisältöä ei voitu ladata: ${err.message}</div>`;
        }
        console.error('[LkiFeed] Load error:', err);
      });
  }

  // ── Auto-init via data attribute ────────────────────────────────
  function autoInit() {
    document.querySelectorAll('[data-feed-src]').forEach(el => {
      init(el, { dataUrl: el.dataset.feedSrc });
    });
  }

  return { init, autoInit };
})();

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', LkiFeed.autoInit);
} else {
  LkiFeed.autoInit();
}
