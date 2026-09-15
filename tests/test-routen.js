// Test der Routenrechnung aus apps-script/Code.js: Haversine, Kumulierung, Ausdünnung, Eingabeformate.
// Aufruf: node tests/test-routen.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { haversine_, kumuliere_, duenneAus_, koordinateAusEingabe_, formatiereDauer_, projiziere_, baueExport_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const nah = (a, b, tol) => Math.abs(a - b) <= tol;

// Haversine: 1 Grad Länge am Äquator = 2πR/360 = 111.195 km
pruefe(nah(gs.haversine_(0, 0, 0, 1), 111.1951, 0.001), 'Haversine 1° am Äquator: ' + gs.haversine_(0, 0, 0, 1));
pruefe(nah(gs.haversine_(46.5043, 6.4913, 46.5043, 6.4913), 0, 1e-9), 'Haversine Nullabstand');

// Kumulierung: rauf 50, runter 30, rauf 10 → hin 60, rück 30
const k = gs.kumuliere_([[6.0, 46.0, 400], [6.01, 46.0, 450], [6.02, 46.0, 420], [6.03, 46.0, 430]]);
const letzter = k[k.length - 1];
pruefe(letzter[3] === 60 && letzter[4] === 30, 'Anstieg hin/rück: ' + letzter[3] + '/' + letzter[4]);
pruefe(k[0][2] === 0 && k[0][3] === 0 && k[0][4] === 0, 'Erster Punkt bei 0');
pruefe(k[0][0] === 46.0 && k[0][1] === 6.0, 'Reihenfolge [lat, lon]');

// Ausdünnung: 10 km flache Strecke in 10-m-Schritten → ca. 40 Punkte, erster/letzter bleiben
const dicht = [];
for (let i = 0; i <= 1000; i++) dicht.push([6.0 + i * 0.00013, 46.0, 400]);
const vollDicht = gs.kumuliere_(dicht);
const duenn = gs.duenneAus_(vollDicht);
pruefe(duenn.length > 30 && duenn.length < 50, 'Ausdünnung flach: ' + duenn.length + ' Punkte');
pruefe(duenn[0][2] === 0 && duenn[duenn.length - 1][2] === Math.round(vollDicht[1000][2] * 100) / 100, 'erster und letzter Punkt bleiben');
let monoton = true;
for (let i = 1; i < duenn.length; i++) if (duenn[i][2] < duenn[i - 1][2] || duenn[i][3] < duenn[i - 1][3] || duenn[i][4] < duenn[i - 1][4]) monoton = false;
pruefe(monoton, 'km und Höhenmeter monoton steigend');
pruefe(duenn.every(p => p.length === 5), 'Stützpunkt hat 5 Werte');

// Ausdünnung: steile Rampe → Höhenkriterium hält mehr Punkte als 250-m-Kriterium allein
const steil = [];
for (let i = 0; i <= 100; i++) steil.push([6.0 + i * 0.00013, 46.0, 400 + i * 2]); // 1 km, 200 m Anstieg
const duennSteil = gs.duenneAus_(gs.kumuliere_(steil));
pruefe(duennSteil.length >= 18, 'Höhenkriterium greift: ' + duennSteil.length + ' Punkte');
pruefe(duennSteil[duennSteil.length - 1][3] === 200, 'Anstieg bleibt nach Ausdünnung exakt: ' + duennSteil[duennSteil.length - 1][3]);

// Rundung
const r = gs.duenneAus_([[46.123456789, 6.987654321, 0, 0, 0, 400], [46.2, 7.0, 12.3456, 10.6, 3.4, 410]]);
pruefe(r[0][0] === 46.12346 && r[0][1] === 6.98765 && r[1][2] === 12.35 && r[1][3] === 11 && r[1][4] === 3, 'Rundung: ' + JSON.stringify(r));

// Eingabeformate
const koord = gs.koordinateAusEingabe_('46.5043239,6.4912739');
pruefe(koord[0] === 6.4912739 && koord[1] === 46.5043239, 'lat,lon → [lon, lat]');
pruefe(gs.koordinateAusEingabe_(' 44.3 , 8.47 ')[1] === 44.3, 'Leerzeichen erlaubt');
let geworfen = false;
try { gs.koordinateAusEingabe_('Savona'); } catch (e) { geworfen = true; }
pruefe(geworfen, 'Ortsname ohne Koordinaten wird abgelehnt, nicht geraten');

pruefe(gs.formatiereDauer_(5 * 3600 + 7 * 60) === '5 h 07 min', 'Fahrzeit-Format: ' + gs.formatiereDauer_(5 * 3600 + 7 * 60));

// Projektion: gerade Linie nach Osten auf 46° Breite, 0 bis ~15.5 km, Anstieg 0 → 100 m
const linieOst = [[46.0, 6.0, 0, 0, 0], [46.0, 6.1, 7.73, 50, 10], [46.0, 6.2, 15.47, 100, 20]];
const mitte = gs.projiziere_(linieOst, 46.0, 6.05);
pruefe(nah(mitte.q, 0, 1e-6) && nah(mitte.km, 3.865, 0.001) && nah(mitte.hm_hin, 25, 1e-6) && nah(mitte.hm_rueck, 5, 1e-6), 'Punkt auf der Linie: ' + JSON.stringify(mitte));
const abseits = gs.projiziere_(linieOst, 46.02, 6.15); // ~2.2 km nördlich
pruefe(nah(abseits.q, 0.02 * 110.574, 0.001) && nah(abseits.km, 11.6, 0.01), 'Querabstand nördlich: ' + JSON.stringify(abseits));
const vorStart = gs.projiziere_(linieOst, 46.0, 5.9); // vor dem Start: t wird auf 0 geklemmt
pruefe(vorStart.km === 0 && nah(vorStart.q, 0.1 * 111.320 * Math.cos(46 * Math.PI / 180), 0.001), 'Klemmung am Linienanfang: ' + JSON.stringify(vorStart));

// Export: Zuordnung nur bis 2 km, Rundung, Punkt ohne Route bleibt mit leerer Zuordnung drin
const exp = gs.baueExport_(
  [{ id: 'test', name: 'Test', linie: linieOst }],
  [
    { id: 'p001', name: 'Auf der Linie', lat: 46.0000012, lon: 6.0512345, richtung: 'beide' },
    { id: 'p002', name: '1,1 km nördlich', lat: 46.01, lon: 6.15, richtung: 'hin' },
    { id: 'p003', name: '5,5 km nördlich', lat: 46.05, lon: 6.15, richtung: 'beide' },
    { id: 'p004', name: 'weit weg', lat: 50.0, lon: 8.0, richtung: 'beide' },
  ],
  '2026-09-15T08:00:00Z'
);
pruefe(exp.version === '1.0' && exp.erzeugt === '2026-09-15T08:00:00Z', 'Kopf von routes.json');
pruefe(exp.routen[0].laenge_km === 15.47 && exp.routen[0].hm_hin === 100 && exp.routen[0].hm_rueck === 20, 'Routen-Summen: ' + JSON.stringify(exp.routen[0]).slice(0, 80));
pruefe(exp.punkte.length === 4, 'alle Punkte exportiert');
pruefe(exp.punkte[0].zuordnung.length === 1 && exp.punkte[0].lat === 46 && exp.punkte[0].lon === 6.05123, 'Punkt auf Linie zugeordnet und gerundet: ' + JSON.stringify(exp.punkte[0]));
pruefe(exp.punkte[1].zuordnung.length === 1 && exp.punkte[1].richtung === 'hin', '1,1 km abseits zugeordnet');
pruefe(exp.punkte[2].zuordnung.length === 0, '5,5 km abseits nicht zugeordnet');
pruefe(exp.punkte[3].zuordnung.length === 0, 'außerhalb des Rechtecks nicht zugeordnet');
const zu = exp.punkte[0].zuordnung[0];
pruefe(zu.route === 'test' && zu.km === 3.96 && zu.hm_hin === 26 && zu.hm_rueck === 5, 'Zuordnungswerte: ' + JSON.stringify(zu));

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
