// Test der Link-Auswertung aus apps-script/Code.js gegen echte aufgelöste Maps-Links.
// Aufruf: node tests/test-links.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { werteMapsUrlAus_, betreiberAusName_, nameMitOrt_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

// 1. Alle echten Links: Name, Koordinaten im plausiblen Bereich, Betreiber erkannt.
const zeilen = fs.readFileSync(path.join(__dirname, 'fixtures', 'maps-links.tsv'), 'utf8').trim().split(/\r?\n/);
const betreiberZaehlung = {};
for (const z of zeilen) {
  const [code, url] = z.split('\t');
  const info = gs.werteMapsUrlAus_(url);
  pruefe(info.name !== '', code + ': kein Name');
  pruefe(info.lat > 43 && info.lat < 52 && info.lon > 5 && info.lon < 12, code + ': Koordinaten außerhalb des Korridors ' + info.lat + ',' + info.lon);
  const b = gs.betreiberAusName_(info.name) || '(keiner)';
  betreiberZaehlung[b] = (betreiberZaehlung[b] || 0) + 1;
}
console.log(zeilen.length + ' Links ausgewertet, Betreiber:', betreiberZaehlung);

// 2. Einzelfälle aus dem Brief und Rückfallmuster.
const amag = gs.werteMapsUrlAus_('https://www.google.com/maps/place/AMAG-Ladestation/@47.0393597,5.0221103,7z/data=!4m6!3m5!1s0x0:0x0!8m2!3d46.5226087!4d6.6133511!16s');
pruefe(amag.lat === 46.5226087 && amag.lon === 6.6133511, '!3d/!4d muss Vorrang vor @ (Kartenausschnitt) haben');
pruefe(amag.name === 'AMAG-Ladestation', 'Name mit Bindestrich');

const nurAt = gs.werteMapsUrlAus_('https://www.google.com/maps/place/Irgendwas/@46.1,7.2,15z');
pruefe(nurAt.lat === 46.1 && nurAt.lon === 7.2, 'Rückfall auf @lat,lon');

const ohne = gs.werteMapsUrlAus_('https://www.google.com/maps?cid=123456');
pruefe(ohne.lat === null, 'Link ohne Koordinaten muss null liefern (nicht raten)');

pruefe(gs.werteMapsUrlAus_('https://www.google.com/maps/place/Porsche+Sales+%26+Marketplace/@1,1,1z').name === 'Porsche Sales & Marketplace', 'URL-Dekodierung');

// 3. Name mit Ort.
pruefe(gs.nameMitOrt_('EnBW Ladestation', 'Achern') === 'EnBW Ladestation Achern', 'Ort anhängen');
pruefe(gs.nameMitOrt_('AMAG Baden', 'Baden') === 'AMAG Baden', 'Ort nicht doppelt');
pruefe(gs.nameMitOrt_('Tesla Supercharger', '') === 'Tesla Supercharger', 'ohne Ort unverändert');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
