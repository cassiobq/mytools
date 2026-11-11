// Service worker: o app abre e funciona sem sinal. Os dados não passam por aqui (ficam no IndexedDB
// e vão direto ao Supabase); o cache guarda só as páginas e os arquivos do app.
const VERSAO = 'crm-v2';
const PAGINAS = ['/', '/hoje/', '/painel/', '/lista/', '/config/', '/manifest.webmanifest', '/icone-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(PAGINAS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase e outros: direto na rede
  if (url.pathname.startsWith('/_next/static/')) {
    // Arquivos com hash no nome: cache primeiro.
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return resp;
    })));
    return;
  }
  // Páginas e o resto: rede primeiro (versão nova), cache se estiver sem sinal.
  e.respondWith(fetch(e.request).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
    return resp;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
