// Erzeugt tests/fixtures/routes-test.json mit denselben Funktionen wie das Apps Script
// (kumuliere_, duenneAus_, baueExport_). Synthetische Route über einen „Pass",
// damit die App vor dem ersten echten Export im Browser prüfbar ist.
// Aufruf: node tests/erzeuge-testdaten.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { kumuliere_, duenneAus_, baueExport_ };')();

// Start Morges, 200 km nach Osten/Südosten, Pass mit 1600 m bei km ~100, Ziel auf 300 m.
const roh = [];
const schritte = 4000; // ~50 m Auflösung
for (let i = 0; i <= schritte; i++) {
  const t = i / schritte;
  const lat = 46.50432 - 0.6 * t;
  const lon = 6.49127 + 2.4 * t;
  const pass = Math.max(0, 1 - Math.abs(t - 0.5) / 0.25); // Dreieck zwischen 25 % und 75 %
  const hoehe = 380 - 80 * t + 1300 * pass + 4 * Math.sin(i / 7); // leichtes Rauschen
  roh.push([lon, lat, hoehe]);
}
const linie = gs.duenneAus_(gs.kumuliere_(roh));
const L = linie[linie.length - 1][2];

const beiKm = km => {
  for (let i = 0; i < linie.length - 1; i++) {
    if (km <= linie[i + 1][2]) {
      const t = (km - linie[i][2]) / (linie[i + 1][2] - linie[i][2]);
      return [linie[i][0] + t * (linie[i + 1][0] - linie[i][0]), linie[i][1] + t * (linie[i + 1][1] - linie[i][1])];
    }
  }
  return [linie[linie.length - 1][0], linie[linie.length - 1][1]];
};

const punkt = (id, name, km, extra) => {
  const [lat, lon] = beiKm(km);
  return Object.assign({
    id, name, adresse: name + ', Teststrasse 1, 1110 Morges', lat, lon: lon + 0.003, // ~230 m neben der Linie
    betreiber: 'EnBW', kw: 150, anzahl: 4, richtung: 'beide', favorit: false, notiz: 'Notiz ' + id,
  }, extra);
};

const punkte = [
  punkt('t01', 'Vor dem Pass', 20),
  punkt('t02', 'Nur Rückfahrt', 45, { richtung: 'rueck', notiz: 'darf in Hinfahrt nicht erscheinen' }),
  punkt('t03', 'Nur Hinfahrt', 60, { richtung: 'hin', betreiber: 'Ionity', kw: 350 }),
  punkt('t04', 'Hinter dem Pass', 130, { favorit: true, notiz: 'Favorit, Coop' }),
  punkt('t05', 'Ohne kW', 170, { kw: null, anzahl: null, betreiber: '' }),
  punkt('t06', 'Kurz vor Ziel', L - 5),
  Object.assign(punkt('t07', 'Weit abseits', 100), { lat: 47.5, lon: 9.0 }),
];

const json = gs.baueExport_([{ id: 'test', name: 'Morges – Testziel', linie }], punkte, '2026-09-15T08:00:00Z');
const ziel = path.join(__dirname, 'fixtures', 'routes-test.json');
fs.writeFileSync(ziel, JSON.stringify(json));
console.log('geschrieben:', ziel, '—', linie.length, 'Stützpunkte,', L, 'km, Anstieg hin', linie[linie.length - 1][3], 'm');
json.punkte.forEach(p => console.log(' ', p.id, p.name, JSON.stringify(p.zuordnung)));
