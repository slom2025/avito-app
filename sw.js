importScripts('store.js');
const SHELL = ['./', 'index.html', 'store.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open('shell-v2').then(c => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Сеть в первую очередь (чтобы обновления приложения приходили сразу), кэш — когда сети нет
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(r => { const c = r.clone(); caches.open('shell-v2').then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  const received_at = Date.now();
  let d = {};
  try { if (e.data) d = e.data.json(); } catch (_) { d = {title: 'Авито-охотник', body: e.data ? e.data.text() : ''}; }
  const item = Object.assign({id: 'push-' + received_at, title: 'Находка', body: ''}, d, {received_at});
  const delay = item.sent_at ? Math.max(0, (received_at - item.sent_at) / 1000) : null;
  e.waitUntil((async () => {
    try { await Store.put(item); await Store.trim(); } catch (_) {}
    const cl = await clients.matchAll({type: 'window', includeUncontrolled: true});
    cl.forEach(c => c.postMessage({type: 'item', item}));
    await self.registration.showNotification(item.title, {
      body: item.body, icon: 'icon-192.png', tag: item.id, data: {url: item.url || './', id: item.id},
      timestamp: item.sent_at || received_at
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '';
  const target = url ? './?go=' + encodeURIComponent(url) : './';
  e.waitUntil((async () => {
    const cl = await clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const c of cl) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({type: 'go', url}); return; }
    }
    await clients.openWindow(target);
  })());
});
