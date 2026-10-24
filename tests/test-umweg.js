// Test der Umweg-Rechnung aus apps-script/Code.js (Script v0.26.0): Aufgaben je Station/Richtung, Wert mit Zuschlag,
// Anhängen an routes.json, Rechnen mit nachgebautem ORS (Rückfall ohne Fahrtrichtung bei HTTP 400).
// Aufruf: node tests/test-umweg.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const abfragen = [];
let antwort400 = 0;
const UrlFetchApp = {
  fetch(url, opt) {
    const nutz = JSON.parse(opt.payload);
    abfragen.push(nutz);
    if (antwort400 > 0 && nutz.bearings) { antwort400--; return { getResponseCode: () => 400, getContentText: () => '{"error":"bearings"}' }; }
    const mit = nutz.coordinates.length === 3;
    const summe = mit ? { duration: 600 + 8 * 60, distance: 10000 + 4000 } : { duration: 600, distance: 10000 };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ routes: [{ summary: summe }] }) };
  },
};
const Utilities = { sleep() {} };
const gs = new Function('UrlFetchApp', 'Utilities', quelle +
  '; return { umwegAufgaben_, umwegWert_, umwegAnhaengen_, berechneUmwege_, umwegKurs_ };')(UrlFetchApp, Utilities);

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const nah = (a, b, tol) => Math.abs(a - b) <= tol;

// gerade Strecke nach Osten, 100 km, je km ein Punkt (lat, lon, km)
const lon0 = 7, proKm = 1 / (111.32 * Math.cos(47 * Math.PI / 180));
const linie = [];
for (let km = 0; km <= 100; km++) linie.push([47, lon0 + km * proKm, km, 0, 0]);
const json = {
  routen: [{ id: 'r', laenge_km: 100, linie }],
  punkte: [
    { id: 'p1', name: 'Mitte', lat: 47.001, lon: lon0 + 50 * proKm, richtung: 'hin', zuordnung: [{ route: 'r', km: 50, quer_km: 0.1 }] },
    { id: 'p2', name: 'Anfang', lat: 47.001, lon: lon0 + 10 * proKm, richtung: 'beide', zuordnung: [{ route: 'r', km: 10, quer_km: 4 }] },
  ],
};

const auf = gs.umwegAufgaben_(json);
pruefe(auf.length === 3, '3 Aufgaben (p1 hin, p2 hin+rück), waren ' + auf.length);
const a1 = auf.find(a => a.punkt === 'p1');
pruefe(a1 && a1.richtung === 'hin' && nah(a1.a[0], lon0 + 20 * proKm, 1e-6) && nah(a1.b[0], lon0 + 80 * proKm, 1e-6), 'p1: A bei km 20, B bei km 80: ' + JSON.stringify(a1 && [a1.a, a1.b]));
pruefe(a1 && nah(a1.kursA, 90, 1) && nah(a1.kursB, 90, 1), 'Kurs nach Osten ≈ 90°: ' + (a1 && a1.kursA));
const a2r = auf.find(a => a.punkt === 'p2' && a.richtung === 'rueck');
pruefe(a2r && nah(a2r.a[0], lon0 + 40 * proKm, 1e-6) && nah(a2r.b[0], lon0, 1e-6) && nah(a2r.kursA, 270, 1), 'p2 rück: A km 40, B am Anfang (gekürzt), Kurs 270°: ' + JSON.stringify(a2r && [a2r.a, a2r.b, a2r.kursA]));
pruefe(auf.every(a => a.s.length === 2 && a.schluessel.startsWith('UMWEG_')), 'Station als [lon, lat], Schlüssel UMWEG_…');

// Wert: unter 3 min ohne Zuschlag, darüber × 1,2; nie negativ
pruefe(JSON.stringify(gs.umwegWert_(600, 10000, 700, 10100)) === '[1.7,0.1]', 'kurzer Umweg: ' + gs.umwegWert_(600, 10000, 700, 10100));
pruefe(JSON.stringify(gs.umwegWert_(600, 10000, 1080, 14000)) === '[9.6,4]', '8 min × 1,2 = 9,6: ' + gs.umwegWert_(600, 10000, 1080, 14000));
pruefe(JSON.stringify(gs.umwegWert_(600, 10000, 590, 9900)) === '[0,0]', 'negativ → 0: ' + gs.umwegWert_(600, 10000, 590, 9900));

// Rechnen: 3 Aufgaben × 2 Abfragen, bei der ersten 400 mit Fahrtrichtung → nochmal ohne
const gemerkt = {};
antwort400 = 1;
const erg = gs.berechneUmwege_(auf, {}, 'schluessel', (k, v) => { gemerkt[k] = v; });
pruefe(erg.neu === 3 && erg.fehler.length === 0, '3 neu berechnet: ' + JSON.stringify(erg));
pruefe(abfragen.length === 7 && abfragen[0].bearings && !abfragen[1].bearings, 'Rückfall ohne Fahrtrichtung nach 400: ' + abfragen.length);
pruefe(abfragen[2].coordinates.length === 3 && JSON.stringify(abfragen[2].bearings[1]) === '[]', 'Station ohne Fahrtrichtung: ' + JSON.stringify(abfragen[2].bearings));
pruefe(Object.values(gemerkt).every(v => v.endsWith('|9.6|4')), 'gemerkt mit Fingerabdruck: ' + Object.values(gemerkt)[0]);
// zweiter Lauf: nichts mehr zu tun
const vorher = abfragen.length;
pruefe(gs.berechneUmwege_(auf, gemerkt, 'schluessel', () => {}).neu === 0 && abfragen.length === vorher, 'schon gemerkt → keine Abfrage');

// Anhängen
const kopie = JSON.parse(JSON.stringify(json));
const an = gs.umwegAnhaengen_(kopie, auf, gemerkt);
const z1 = kopie.punkte[0].zuordnung[0], z2 = kopie.punkte[1].zuordnung[0];
pruefe(an.fertig === 3 && JSON.stringify(z1.umweg) === '{"hin":[9.6,4]}' && z2.umweg.hin && z2.umweg.rueck, 'angehängt: ' + JSON.stringify([z1.umweg, z2.umweg]));
pruefe(an.auffaellig.length === 0, 'nichts auffällig');
// Station verschoben → Fingerabdruck passt nicht mehr
const verschoben = JSON.parse(JSON.stringify(json));
verschoben.punkte[0].lat = 47.01;
const an2 = gs.umwegAnhaengen_(verschoben, gs.umwegAufgaben_(verschoben), gemerkt);
pruefe(an2.fertig === 2 && !verschoben.punkte[0].zuordnung[0].umweg, 'verschobene Station neu zu rechnen: ' + an2.fertig);
// auffällig: +25 km bei 0,1 km Abstand
const viel = { ...gemerkt, [a1.schluessel]: a1.fp + '|18|25' };
pruefe(gs.umwegAnhaengen_(JSON.parse(JSON.stringify(json)), auf, viel).auffaellig.length === 1, 'großer Umweg auffällig');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
