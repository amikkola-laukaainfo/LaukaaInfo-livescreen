/**
 * LaukaaInfo – Dynaaminen kuvien lataaja (image-loader.js)
 * 
 * Lukee keskitetyn site-images.json -tiedoston ja korvaa perussivujen
 * merkityt taustakuvat (data-bg-slot) ja kuvatagit (data-image-slot)
 * Supabase Storage -osoitteilla tai ulkoisilla linkeillä.
 * 
 * Säilyttää aina alkuperäisen kuvan luotettavana fallbackina!
 */
(function() {
    'use strict';

    const CONFIG_URL = 'site-images.json';
    let imageMap = {};
    let isLoaded = false;
    const pendingCallbacks = [];

    // Hakee ja parsii kuva-asetukset
    async function initImageLoader() {
        try {
            // Lisätään aikaleima välimuistin ohittamiseksi (tunnin välein)
            const cacheKey = Math.floor(Date.now() / (1000 * 60 * 10)); // 10 min cache
            const res = await fetch(`${CONFIG_URL}?v=${cacheKey}`);
            if (!res.ok) throw new Error(`Latausvirhe: ${res.status}`);
            
            const data = await res.json();
            
            // Muodostetaan id -> url kartta (tukee sekä array että object -muotoja)
            if (Array.isArray(data.slots)) {
                data.slots.forEach(slot => {
                    if (slot && slot.id) {
                        imageMap[slot.id] = {
                            url: (slot.currentUrl || '').trim(),
                            fallback: slot.fallbackUrl || '',
                            label: slot.label || ''
                        };
                    }
                });
            } else if (data.slots && typeof data.slots === 'object') {
                Object.keys(data.slots).forEach(id => {
                    const slot = data.slots[id];
                    imageMap[id] = {
                        url: (typeof slot === 'string' ? slot : slot.currentUrl || '').trim(),
                        fallback: slot.fallbackUrl || '',
                        label: slot.label || ''
                    };
                });
            }

            isLoaded = true;

            // Päivitetään sivun elementit
            applySiteImages();

            // Kutsutaan odottavat kuuntelijat
            while (pendingCallbacks.length > 0) {
                const cb = pendingCallbacks.shift();
                try { cb(imageMap); } catch (e) { console.warn('image-loader callback error:', e); }
            }

        } catch (err) {
            console.warn('[image-loader] Ei voitu ladata dynaamisia kuvia, käytetään oletuksia:', err.message);
            isLoaded = true;
        }
    }

    /**
     * Etsii ja päivittää kaikki data-bg-slot ja data-image-slot -elementit
     */
    function applySiteImages(root = document) {
        if (!root) return;

        // 1. Taustakuvat (data-bg-slot)
        const bgElements = root.querySelectorAll('[data-bg-slot]');
        bgElements.forEach(el => {
            const slotId = el.getAttribute('data-bg-slot');
            if (!slotId || !imageMap[slotId]) return;

            const targetUrl = imageMap[slotId].url;
            if (!targetUrl) return; // Jos tyhjä, pidetään HTML:n oma kuva

            // Tarkistetaan nykyinen taustatyyli (jos siinä on gradientti, säilytetään se)
            const currentStyle = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
            
            if (currentStyle.includes('linear-gradient') || currentStyle.includes('radial-gradient')) {
                // Poimitaan mahdollinen liukuväri
                const gradientMatch = currentStyle.match(/((?:linear|radial)-gradient\([^)]+\))/i);
                if (gradientMatch) {
                    el.style.backgroundImage = `${gradientMatch[1]}, url('${targetUrl}')`;
                    return;
                }
            }

            // Oletus: asetetaan suora taustakuva
            el.style.backgroundImage = `url('${targetUrl}')`;
        });

        // 2. Kuvatagit (data-image-slot)
        const imgElements = root.querySelectorAll('[data-image-slot]');
        imgElements.forEach(img => {
            const slotId = img.getAttribute('data-image-slot');
            if (!slotId || !imageMap[slotId]) return;

            const targetUrl = imageMap[slotId].url;
            if (!targetUrl) return;

            const originalSrc = img.src;
            img.onerror = function() {
                // Jos uusi kuva ei lataudu, palataan alkuperäiseen
                img.src = originalSrc;
                img.onerror = null;
            };
            img.src = targetUrl;
        });
    }

    /**
     * Julkinen apumetodi: palauttaa slotin aktiivisen URL:n tai fallbackin
     */
    window.getSiteImageUrl = function(slotId, defaultFallback = '') {
        if (imageMap[slotId] && imageMap[slotId].url) {
            return imageMap[slotId].url;
        }
        if (imageMap[slotId] && imageMap[slotId].fallback) {
            return imageMap[slotId].fallback;
        }
        return defaultFallback;
    };

    /**
     * Julkinen metodi uuden elementtipuun päivittämiseen (esim. dynaamiset kortit)
     */
    window.applySiteImages = applySiteImages;

    /**
     * Mahdollisuus rekisteröidä callback, joka suoritetaan kun kuvat on ladattu
     */
    window.onSiteImagesLoaded = function(cb) {
        if (isLoaded) {
            cb(imageMap);
        } else {
            pendingCallbacks.push(cb);
        }
    };

    // Tarkkaillaan dynaamisesti lisättäviä kortteja (kuten alueet.js kortit)
    const observer = new MutationObserver((mutations) => {
        let hasSlotElements = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        if (node.hasAttribute('data-bg-slot') || node.hasAttribute('data-image-slot') ||
                            node.querySelector('[data-bg-slot], [data-image-slot]')) {
                            hasSlotElements = true;
                            break;
                        }
                    }
                }
            }
            if (hasSlotElements) break;
        }
        if (hasSlotElements) {
            applySiteImages();
        }
    });

    // Käynnistetään kun DOM on valmis
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initImageLoader();
            observer.observe(document.body, { childList: true, subtree: true });
        });
    } else {
        initImageLoader();
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

})();

