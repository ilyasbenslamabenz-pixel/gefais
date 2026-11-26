// Espace comité GE-FAIS — mode application.
// La page est toujours demandée au réseau d'abord (on reçoit donc toujours la
// dernière version) ; la copie gardée ne sert que si le réseau ne répond pas.
// Les bibliothèques versionnées (Firebase, jsPDF, polices) sont gardées en cache.
// Les données (Firestore) ne passent jamais par ce cache.
const CACHE = 'gefais-comite-v2';
const PAGE = '/gestion/';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([PAGE, '/gestion/manifest.webmanifest'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

const versionne = url =>
  url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/') ||
  url.hostname === 'cdnjs.cloudflare.com' ||
  url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page de l'application : réseau d'abord, copie de secours ensuite
  if (req.mode === 'navigate' && url.origin === location.origin && url.pathname.startsWith('/gestion/')) {
    e.respondWith(
      // « no-cache » : on revérifie toujours auprès du serveur, chaque mise à jour est donc visible tout de suite
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        if (res.ok) { const copie = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copie)); }
        return res;
      }).catch(() => caches.match(PAGE))
    );
    return;
  }

  // Bibliothèques versionnées : cache d'abord
  if (versionne(url)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copie = res.clone(); caches.open(CACHE).then(c => c.put(req, copie)); }
        return res;
      }))
    );
  }
  // Tout le reste (Firebase, images, etc.) : comportement normal du navigateur
});
