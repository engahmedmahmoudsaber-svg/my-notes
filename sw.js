/*
  sw.js — بيخلّي التطبيق يشتغل من غير نت بعد أول فتح.
  بيخزّن ملفات التطبيق نفسها بس (مش بياناتك). بياناتك في المتصفح ومش بتعدّي من هنا.
  لو عدّلت أي ملف، غيّر رقم CACHE عشان الموبايل ياخد النسخة الجديدة.
*/
var CACHE = 'tazkir-shell-v1';
var FILES = [
  './',
  'index.html',
  'style.css',
  'logic.js',
  'app.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// الأول من الكاش (سريع وشغال أوفلاين)، وبنحدّث الكاش في الخلفية
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
