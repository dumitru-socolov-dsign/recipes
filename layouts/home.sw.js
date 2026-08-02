{{- /* Service worker generat la build. Versiunea cache-ului conține data build-ului,
       deci rebuild-ul zilnic de la 06:00 invalidează automat cache-ul vechi. */ -}}
{{- /* Un singur service worker, la rădăcină, cu scope pe tot site-ul. Precache-ul cuprinde
       AMBELE limbi: comutatorul de limbă trebuie să meargă și fără semnal, altfel jumătate
       din aplicație dispare exact când ești în magazin, unde ai cea mai mare nevoie de ea. */ -}}
{{- $js := resources.Get "js/app.js" | js.Build (dict "minify" true "target" "es2020") -}}
{{- $shell := slice "/manifest.webmanifest" "/icons/icon.svg" $js.RelPermalink -}}
{{- range hugo.Sites -}}
  {{- $shell = $shell | append (.Home.OutputFormats.Get "json").RelPermalink -}}
  {{- range .Pages -}}
    {{- if in (slice "home" "section" "page") .Kind -}}
      {{- $shell = $shell | append .RelPermalink -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- $shell = uniq $shell -}}
const VERSION = {{ printf "v-%s-%s" (now.Format "20060102-150405") (substr (now.Format "150405") 0 4) | jsonify }};
const SHELL = {{ $shell | jsonify }};

/* Precache: shell-ul aplicației + toate paginile de rețete, ca modul gătit să
   funcționeze complet fără semnal. */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isHTML = (r) => r.mode === 'navigate' || (r.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  /* Navigări și date: rețea întâi, ca rebuild-ul zilnic să se vadă imediat;
     cache-ul e plasa de siguranță când nu ai semnal. */
  if (isHTML(request) || url.pathname.endsWith('/app.json')) {
    e.respondWith((async () => {
      try {
        const net = await fetch(request);
        const c = await caches.open(VERSION);
        c.put(request, net.clone());
        return net;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) ||
          new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  /* Restul (JS, imagini, iconuri): cache întâi, sunt versionate prin URL. */
  e.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    const net = await fetch(request);
    if (net.ok) (await caches.open(VERSION)).put(request, net.clone());
    return net;
  })());
});
