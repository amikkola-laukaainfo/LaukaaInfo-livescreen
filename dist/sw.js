const VERSION = 'fb5c5153';
const CACHE_NAME = `laukaainfo-${VERSION}`;
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@400;600;700&display=swap'
];

// Asennus - välimuistitaan staattiset tiedostot turvallisesti
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(ASSETS.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

// Aktivointi - siivotaan vanhat välimuistit ja otetaan hallinta heti
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Nouto-strategia: Network First JS, HTML ja datatiedostoille jotta päivitykset tulevat heti läpi
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Dynamic Network First for HTML, JS and API/JSON data
    if (
        event.request.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.includes('api.php') ||
        url.pathname.endsWith('.json')
    ) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok && !url.search.includes('ts=')) {
                        const clonedResponse = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache First kuville ja tyyleille
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});

// Kuuntele viestejä
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
