// 🏖️ 沙坑训练场 Service Worker v5 — 网络优先，离线兜底（外壳）
// v4（2026-10-28 P3 静态化）：移除 marked（运行时不再渲染）；SHELL 预缓存 course/index.json（首屏秒开）
// v5（2026-10-28 P6 进度落库）：index.html 改了（新增进度同步接线）→ 升版清旧缓存，
//     否则老学员拿到的是 v4 的旧 JS（没有进度同步代码）。
const CACHE = 'sandy-hollow-v5';
const SHELL = ['./', './index.html', './course-dom.js', './course/index.json', './assets/favicon.svg', './assets/icon-192.png', './assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API 跨域直连，不缓存
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
