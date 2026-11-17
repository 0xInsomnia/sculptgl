// Keeps SculptGL usable offline once it has been opened online (needed to
// install it as an app). Network first so updates arrive; cache fallback.
var CACHE = 'sculptgl-v1';
var CORE = [
  './', 'index.html', 'sculptgl.js', 'css/yagui.css', 'css/mobile.css', 'manifest.webmanifest',
  'resources/icons/icon-192.png', 'resources/icons/icon-512.png',
  'resources/matcaps/matcapFV.jpg', 'resources/alpha/square.jpg', 'resources/alpha/skin.jpg',
  'resources/environments/studio_small_01_1k.png', 'resources/uv.png', 'resources/dropper.png',
  'worker/deflate.js', 'worker/z-worker.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    // one missing file must not stop the rest from being cached
    return Promise.all(CORE.map(function (url) {
      return cache.add(url).catch(function () {});
    }));
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(function (response) {
    if (response.ok) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put(request, copy);
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request, { ignoreSearch: true }).then(function (hit) {
      return hit || Response.error();
    });
  }));
});
