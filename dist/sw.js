const VERSION = '28faa33b'; // Auto-updated by build
const CACHE_NAME = `laukaainfo-${VERSION}`;
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Asennus - välimuistitaan staattiset tiedostot
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Aktivointi - siivotaan vanhat välimuistit ja otetaan hallinta heti
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(key => key !== CACHE_NAME)
                        .map(key => caches.delete(key))
                );
            }),
            self.clients.claim()
        ])
    );
});

// Nouto-strategia
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. Ohita kaikki cross-origin pyynnöt (Supabase, external API:t, CORS-proxy:t jne.)
    if (url.origin !== self.location.origin) {
        return;
    }

    // 2. Ohita Chrome-extension ja non-http(s) protokollat
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // 3. HTML-sivut: Network First – aina tuorein versio jossa oikeat JS-viittaukset
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 3. Strategia: Network First (Datalle kuten PHP-rajapinnat ja JSON)
    if (url.pathname.includes('api.php') || url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (!url.search.includes('ts=')) {
                        const clonedResponse = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 4. Strategia: Network First myös versioituneille JS/CSS-tiedostoille
    //    (hash muuttuu joka buildissa, ei haluta vanhentuneita versioita välimuistista)
    if (url.pathname.match(/\.[a-f0-9]{8}\.(js|css)$/)) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 5. Strategia: Cache First (Staattisille, ei-versioituneille asseteille: HTML, kuvat jne.)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request);
            })
    );
});


// Kuuntele viestejä (esim. SKIP_WAITING)
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
