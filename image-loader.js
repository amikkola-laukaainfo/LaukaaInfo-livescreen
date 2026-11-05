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

  // Tuetaan sekä image-slots.json että site-images.json tiedostoja
  const CONFIG_PATHS = ['image-slots.json', 'site-images.json'];
  const cacheKey = Math.floor(Date.now() / (1000 * 60 * 10)); // 10 min välimuisti
  let slotMap = {};
  let isLoaded = false;
  const pendingCallbacks = [];

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

        while (pendingCallbacks.length > 0) {
          const cb = pendingCallbacks.shift();
          try { cb(slotMap); } catch (e) { console.warn(e); }
        }
      })
      .catch(function(err) {
        // Kokeillaan toista tiedostonimeä
        fetchConfig(index + 1);
      });
  }

  function applySiteImages(root) {
    root = root || document;

    // 1. data-slot (AI Studion suositus) sekä data-bg-slot ja data-image-slot
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
        // Taustakuvat (hero-bannerit, kortit jne.)
        const currentStyle = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';

        // Jos taustassa on jo url(...), korvataan vain kuvaosoite, jotta liukuvärit (linear-gradient) säilyvät ehjinä
        if (/url\([^)]+\)/i.test(currentStyle)) {
          el.style.backgroundImage = currentStyle.replace(/url\([^)]+\)/i, 'url("' + targetUrl + '")');
        } else if (currentStyle.includes('gradient')) {
          el.style.backgroundImage = currentStyle + ', url("' + targetUrl + '")';
        } else {
          el.style.backgroundImage = 'url("' + targetUrl + '")';
        }
      }
    });
  }

  // Julkiset apufunktiot
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

  // Tarkkaillaan dynaamisia lisäyksiä DOM:iin (kuten alueet.js kortit)
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

