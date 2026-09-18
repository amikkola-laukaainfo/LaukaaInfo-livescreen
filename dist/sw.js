const VERSION = '043ce7a9'; // Auto-updated by build
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

    // Strategia: Network First (Datalle kuten PHP-rajapinnat ja JSON)
    // Erityisesti api.php, jota ei haluta välimuistittaa pysyvästi
    if (url.pathname.includes('api.php') || url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Älä välimuistita api.php kutsuja, jos niissä on timestamp (ts=)
                    // Tämä estää välimuistin paisumisen
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

    // Strategia: Cache First (Staattisille asseteille)
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
