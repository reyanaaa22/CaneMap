// Service Worker for CaneMap Offline Support
// Caches essential pages for Worker and Driver offline work logging

const CACHE_NAME = 'canemap-offline-v1';
const OFFLINE_PAGES = [
    '/frontend/Worker/Workers.html',
    '/frontend/Driver/Driver_Dashboard.html',
    '/backend/Worker/Workers.js',
    '/backend/Driver/Driver_Dashboard.js',
    '/backend/Driver/driver-ui.js',
    '/backend/Driver/driver-init.js',
    '/backend/Common/offline-db.js',
    '/backend/Common/offline-sync.js',
    '/backend/Common/ui-popup.js',
    '/backend/Common/firebase-config.js',
    // Add Font Awesome for icons
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    // Add Tailwind CSS
    'https://cdn.tailwindcss.com'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching offline pages');
                return cache.addAll(OFFLINE_PAGES);
            })
            .then(() => {
                console.log('Service Worker: Installed successfully');
                return self.skipWaiting(); // Activate immediately
            })
            .catch((error) => {
                console.error('Service Worker: Installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated successfully');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // If online, return network response and update cache
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // If offline, try to serve from cache
                    return caches.match(request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                console.log('Service Worker: Serving from cache:', request.url);
                                return cachedResponse;
                            }

                            // If not in cache, return a fallback or error page
                            console.log('Service Worker: Page not cached:', request.url);
                            return new Response('Offline - Page not available', {
                                status: 503,
                                statusText: 'Service Unavailable',
                                headers: new Headers({
                                    'Content-Type': 'text/plain'
                                })
                            });
                        });
                })
        );
    }
    // For other requests (JS, CSS, images), use network-first strategy
    else {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache
                    return caches.match(request)
                        .then((cachedResponse) => {
                            return cachedResponse || new Response('Offline', { status: 503 });
                        });
                })
        );
    }
});

// Message event - handle commands from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CACHE_URLS') {
        const urls = event.data.urls || [];
        caches.open(CACHE_NAME).then((cache) => {
            cache.addAll(urls);
        });
    }
});
