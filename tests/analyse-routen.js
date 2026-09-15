// Diagnose der berechneten Routen und der Zuordnung — liest linien/*.json und routes.json.
// Aufruf: node tests/analyse-routen.js
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const quelle = fs.readFileSync(path.join(wurzel, 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { projiziere_, haversine_ };')();
const daten = JSON.parse(fs.readFileSync(path.join(wurzel, 'routes.json'), 'utf8'));

const beiKm = (linie, km) => linie.find(p => p[2] >= km) || linie[linie.length - 1];

for (const r of daten.routen) {
  const l = r.linie;
  console.log('\n=== ' + r.id + ': ' + r.laenge_km + ' km, Anstieg hin ' + r.hm_hin + ' / rück ' + r.hm_rueck + ', ' + l.length + ' Stützpunkte');

  // Verlauf alle 40 km
  const stationen = [];
  for (let km = 0; km <= r.laenge_km; km += 40) { const p = beiKm(l, km); stationen.push(Math.round(km) + ':' + p[0].toFixed(3) + ',' + p[1].toFixed(3)); }
  console.log('Verlauf: ' + stationen.join('  '));

  // Nördlichster/östlichster Punkt als Hinweis auf den gewählten Pass
  const maxLat = l.reduce((a, p) => p[0] > a[0] ? p : a);
  const maxLon = l.reduce((a, p) => p[1] > a[1] ? p : a);
  console.log('max Breite ' + maxLat[0] + ',' + maxLat[1] + ' bei km ' + maxLat[2] + ' · max Länge ' + maxLon[0] + ',' + maxLon[1] + ' bei km ' + maxLon[2]);

  // Verdächtige Höhensprünge: Anstieg oder Gefälle > 80 m auf < 1 km Strecke
  const spruenge = [];
  for (let i = 1; i < l.length; i++) {
    const dkm = l[i][2] - l[i - 1][2];
    const auf = l[i][3] - l[i - 1][3], ab = l[i][4] - l[i - 1][4];
    if (dkm < 1 && (auf > 80 || ab > 80)) spruenge.push('km ' + l[i][2] + ' (' + l[i][0] + ',' + l[i][1] + ') +' + auf + '/-' + ab + ' auf ' + dkm.toFixed(2) + ' km');
  }
  console.log('Höhensprünge > 80 m/km: ' + spruenge.length + (spruenge.length ? '\n  ' + spruenge.slice(0, 12).join('\n  ') : ''));

  // Anstieg pro 100 km als Plausibilitätsmaß
  console.log('Anstieg pro 100 km: ' + Math.round(r.hm_hin / r.laenge_km * 100) + ' m');
}

console.log('\n=== Punkte ohne Route — Abstand zur nächsten Route');
for (const p of daten.punkte.filter(p => p.zuordnung.length === 0)) {
  const abstaende = daten.routen.map(r => { const pr = gs.projiziere_(r.linie, p.lat, p.lon); return r.id + ' ' + pr.q.toFixed(1) + ' km (bei km ' + Math.round(pr.km) + ')'; });
  console.log(p.id + ' ' + p.name + ' [' + p.richtung + '] → ' + abstaende.join(' · '));
}

console.log('\n=== Zugeordnete Punkte je Route');
for (const r of daten.routen) {
  const liste = daten.punkte.filter(p => p.zuordnung.some(z => z.route === r.id))
    .map(p => ({ p, z: p.zuordnung.find(z => z.route === r.id) }))
    .sort((a, b) => a.z.km - b.z.km)
    .map(x => '  km ' + String(Math.round(x.z.km)).padStart(3) + '  +' + String(x.z.hm_hin).padStart(4) + ' hm  ' + x.p.id + ' ' + x.p.name + ' [' + x.p.richtung + ']');
  console.log(r.id + ':\n' + liste.join('\n'));
}
