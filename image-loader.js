/**
 * LaukaaInfo – Automaattinen kuvien lataaja (laukaainfo-images.js / image-loader.js)
 * 
 * Hakee image-slots.json (tai site-images.json) tiedoston ja asettaa kuvaosoitteet automaattisesti
 * elementeille, joissa on data-slot="[slot_id]" (tai data-bg-slot / data-image-slot).
 * 
 * Säilyttää olemassa olevat gradientit ja sisältää fallback-varmistuksen!
 */
(function() {
  'use strict';

  const CONFIG_PATHS = ['image-slots.json', 'site-images.json'];
  const cacheKey = Math.floor(Date.now() / (1000 * 60 * 10)); // 10 min välimuisti
  let slotMap = {};
  let isLoaded = false;
  const pendingCallbacks = [];
  const cssBaseBackgrounds = {};

  function storeCssBackgrounds() {
    try {
      var els = document.querySelectorAll('[data-slot],[data-bg-slot],[data-image-slot]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var slotId = el.getAttribute('data-slot') || el.getAttribute('data-bg-slot') || el.getAttribute('data-image-slot');
        if (slotId && !cssBaseBackgrounds[slotId]) {
          var bg = window.getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none' && bg.includes('gradient')) {
            cssBaseBackgrounds[slotId] = bg;
          }
        }
      }
    } catch (e) { /* huomioimatta */ }
  }

  // Tallennetaan heti
  storeCssBackgrounds();

  function fetchConfig(index) {
    if (index >= CONFIG_PATHS.length) {
      console.warn('LaukaaInfo image slots: Konfiguraatiotiedostoa ei löytynyt.');
      return;
    }

    const path = `${CONFIG_PATHS[index]}?v=${cacheKey}`;
    fetch(path)
      .then(function(res) {
        if (!res.ok) throw new Error('Not found: ' + path);
        return res.json();
      })
      .then(function(data) {
        const slots = data.slots || data;

        if (Array.isArray(slots)) {
          slots.forEach(function(s) {
            if (s && s.id) {
              const activeUrl = (s.currentUrl || s.url || s.fallbackUrl || '').trim();
              slotMap[s.id] = {
                url: activeUrl,
                fallback: s.fallbackUrl || '',
                label: s.label || ''
              };
            }
          });
        } else if (typeof slots === 'object') {
          Object.keys(slots).forEach(function(id) {
            const s = slots[id];
            const activeUrl = typeof s === 'string' ? s : (s.currentUrl || s.url || s.fallbackUrl || '').trim();
            slotMap[id] = {
              url: activeUrl,
              fallback: s.fallbackUrl || '',
              label: s.label || ''
            };
          });
        }

        isLoaded = true;
        applySiteImages();

        // Ajetaan uudelleen 500ms, 1200ms ja 2500ms viiveillä siltä varalta,
        // että tietoa-paikasta.js tai muu async-skripti valmistuu myöhemmin
        setTimeout(function() { if (isLoaded) applySiteImages(); }, 500);
        setTimeout(function() { if (isLoaded) applySiteImages(); }, 1200);
        setTimeout(function() { if (isLoaded) applySiteImages(); }, 2500);

        while (pendingCallbacks.length > 0) {
          const cb = pendingCallbacks.shift();
          try { cb(slotMap); } catch (e) { console.warn(e); }
        }
      })
      .catch(function(err) {
        fetchConfig(index + 1);
      });
  }

  function applySiteImages(root) {
    root = root || document;
    storeCssBackgrounds();

    const elements = root.querySelectorAll('[data-slot], [data-bg-slot], [data-image-slot]');

    elements.forEach(function(el) {
      const slotId = el.getAttribute('data-slot') || el.getAttribute('data-bg-slot') || el.getAttribute('data-image-slot');
      if (!slotId || !slotMap[slotId]) return;

      const item = slotMap[slotId];
      const targetUrl = item.url;
      if (!targetUrl) return;

      if (el.tagName.toLowerCase() === 'img') {
        const originalSrc = el.src;
        el.onerror = function() {
          if (item.fallback && el.src !== item.fallback) {
            el.src = item.fallback;
          } else {
            el.src = originalSrc;
          }
          el.onerror = null;
        };
        el.src = targetUrl;
      } else {
        const baseBg = cssBaseBackgrounds[slotId] || '';

        if (baseBg && baseBg !== 'none' && /url\([^)]+\)/i.test(baseBg)) {
          el.style.backgroundImage = baseBg.replace(/url\([^)]+\)/i, 'url("' + targetUrl + '")');
        } else if (baseBg && baseBg !== 'none' && baseBg.includes('gradient')) {
          el.style.backgroundImage = baseBg + ', url("' + targetUrl + '")';
        } else if (el.classList.contains('place-identity-hero') || el.id === 'place-hero') {
          // Varma oletusgradientti alueiden ja taajamien hero-otsikoille
          el.style.backgroundImage = 'linear-gradient(135deg, rgba(0, 86, 179, 0.82) 0%, rgba(0, 40, 100, 0.9) 100%), url("' + targetUrl + '")';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
        } else {
          const currentStyle = el.style.backgroundImage || '';
          if (currentStyle && /url\([^)]+\)/i.test(currentStyle)) {
            el.style.backgroundImage = currentStyle.replace(/url\([^)]+\)/i, 'url("' + targetUrl + '")');
          } else if (currentStyle && currentStyle.includes('gradient')) {
            el.style.backgroundImage = currentStyle + ', url("' + targetUrl + '")';
          } else {
            el.style.backgroundImage = 'url("' + targetUrl + '")';
          }
        }
      }
    });
  }

  window.getSiteImageUrl = function(slotId, defaultFallback) {
    if (slotMap[slotId] && slotMap[slotId].url) {
      return slotMap[slotId].url;
    }
    return defaultFallback || (slotMap[slotId] && slotMap[slotId].fallback) || '';
  };

  window.applySiteImages = applySiteImages;

  window.onSiteImagesLoaded = function(cb) {
    if (isLoaded) {
      cb(slotMap);
    } else {
      pendingCallbacks.push(cb);
    }
  };

  const observer = new MutationObserver(function(mutations) {
    let hasTarget = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.addedNodes && m.addedNodes.length > 0) {
        for (let j = 0; j < m.addedNodes.length; j++) {
          const node = m.addedNodes[j];
          if (node.nodeType === 1) {
            if (node.hasAttribute('data-slot') || node.hasAttribute('data-bg-slot') || node.hasAttribute('data-image-slot') ||
                node.querySelector('[data-slot], [data-bg-slot], [data-image-slot]')) {
              hasTarget = true;
              break;
            }
          }
        }
      }
      if (hasTarget) break;
    }
    if (hasTarget) {
      applySiteImages();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      fetchConfig(0);
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    fetchConfig(0);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
})();
