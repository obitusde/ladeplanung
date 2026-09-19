// Ladeplanung — Service Worker, Version 1.0.0 (19.09.2026)
// Nur für offline: immer zuerst das Netz (damit neue Daten und neue App-Versionen sofort ankommen),
// ohne Netz die zuletzt geladene Fassung. Daten werden mit ?t=… geladen → beim Nachschlagen die
// Abfrage ignorieren. Fremde Adressen (Wetter, Google) gehen unverändert durch.
const SPEICHER = 'ladeplanung-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const speicher = await caches.open(SPEICHER);
    try {
      const antwort = await fetch(anfrage);
      if (antwort.ok) {
        const schluessel = new URL(anfrage.url);
        schluessel.search = ''; // eine Fassung je Datei, egal mit welchem ?t=
        await speicher.put(schluessel.href, antwort.clone());
      }
      return antwort;
    } catch (fehler) {
      const alt = await speicher.match(anfrage, { ignoreSearch: true });
      if (alt) return alt;
      throw fehler;
    }
  })());
});
