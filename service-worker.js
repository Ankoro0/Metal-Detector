const CACHE_NAME = 'detektor-tracker-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/db.js',
    '/manifest.json'
];

// Instalacija - keširaj fajlove
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache otvorena');
                return cache.addAll(urlsToCache);
            })
    );
});

// Aktivacija - obriši stare keševe
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Brišem stari keš:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch - prvo keš, pa network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Vraća iz keša ako postoji, inače fetch sa neta
                return response || fetch(event.request);
            })
    );
});
