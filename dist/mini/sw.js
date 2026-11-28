const VERSION = 'db058d10';
const CACHE_NAME = `laukaainfo-mini-${VERSION}`;
const APP_SHELL = [
    '/mini/',
    '/mini/index.html',
    '/mini/manifest.json',
    '/mini/icons/icon-192.png',
    '/mini/icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key.startsWith('laukaainfo-mini-') && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    const url = new URL(event.request.url);
    if (!url.pathname.startsWith('/mini/')) return;

    // Network-first HTML, JS ja CSS -tiedostoille; välimuisti varalla offline-käyttöön
    event.respondWith(
        fetch(event.request)
            .then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                }
                return res;
            })
            .catch(() => caches.match(event.request).then(cached => cached || caches.match('/mini/index.html')))
    );
});

