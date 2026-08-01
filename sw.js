/* ==========================================================================
   sw.js — عامل الخدمة: يجعل اللعبة تعمل بلا إنترنت إطلاقاً
   --------------------------------------------------------------------------
   الاستراتيجية: cache-first لكل شيء.
   السبب: اللعبة ملفات ثابتة بالكامل ولا تتصل بأي خادم أثناء اللعب، فلا
   معنى لاستشارة الشبكة أولاً — ذلك يبطّئ الفتح ويكسرها في أماكن التغطية
   الضعيفة، وهي بالضبط أماكن لعبها (استراحة، مزرعة، رحلة برّ).

   التحديث: كل نشر يرفع CACHE_VERSION، فيُبنى مخزن جديد وتُحذف المخازن
   القديمة عند التفعيل. بدون رفع الرقم يبقى اللاعبون على النسخة القديمة
   إلى الأبد — وهذا أشهر خطأ في عمّال الخدمة.
   ========================================================================== */

const CACHE_VERSION = 'huroof-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/fonts.css',
  './js/themes.js',
  './js/utils.js',
  './js/hive.js',
  './js/game.js',
  './js/ui.js',
  './js/setup.js',
  './data/questions.json',
  './assets/fonts/almarai-300-arabic.woff2',
  './assets/fonts/almarai-300-latin.woff2',
  './assets/fonts/almarai-400-arabic.woff2',
  './assets/fonts/almarai-400-latin.woff2',
  './assets/fonts/almarai-700-arabic.woff2',
  './assets/fonts/almarai-700-latin.woff2',
  './assets/fonts/cairo-400-arabic.woff2',
  './assets/fonts/cairo-400-latin.woff2',
  './assets/fonts/cairo-600-arabic.woff2',
  './assets/fonts/cairo-600-latin.woff2',
  './assets/fonts/cairo-700-arabic.woff2',
  './assets/fonts/cairo-700-latin.woff2',
  './assets/fonts/cairo-900-arabic.woff2',
  './assets/fonts/cairo-900-latin.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-32.png',
];

/* التثبيت: نخزّن كل شيء دفعة واحدة */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll ترمي عند فشل أي ملف واحد، فنضيفها فرادى ونتجاهل الفاشل.
      // ملف أيقونة مفقود يجب ألا يمنع اللعبة كلها من العمل بلا إنترنت.
      .then(cache => Promise.all(
        ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[sw] تعذّر تخزين', url, err);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

/* التفعيل: نحذف كل مخزن لا يحمل النسخة الحالية */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* الجلب: من المخزن أولاً، ومن الشبكة عند الغياب مع تخزين النسخة */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // لا نتدخّل إلا في GET — أي طلب آخر يمر للشبكة كما هو
  if (req.method !== 'GET') return;

  // الطلبات لنطاقات أخرى تمر بلا تخزين
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;

      return fetch(req).then(res => {
        // نخزّن الاستجابات السليمة فقط — تخزين خطأ 404 يُبقيه للأبد
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        // بلا شبكة وبلا مخزن: نعيد الصفحة الرئيسية لطلبات التنقّل
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
