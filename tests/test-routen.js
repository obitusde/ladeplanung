// Test der Routenrechnung aus apps-script/Code.js: Haversine, Kumulierung, Ausdünnung, Eingabeformate.
// Aufruf: node tests/test-routen.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { haversine_, kumuliere_, duenneAus_, koordinateAusEingabe_, formatiereDauer_, projiziere_, baueExport_, strassenAbschnitte_, strasseBeiKm_, istRaststaette_, kurzStrasse_, hoechsterPunkt_, waehleStrasse_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const nah = (a, b, tol) => Math.abs(a - b) <= tol;

// Haversine: 1 Grad Länge am Äquator = 2πR/360 = 111.195 km
pruefe(nah(gs.haversine_(0, 0, 0, 1), 111.1951, 0.001), 'Haversine 1° am Äquator: ' + gs.haversine_(0, 0, 0, 1));
pruefe(nah(gs.haversine_(46.5043, 6.4913, 46.5043, 6.4913), 0, 1e-9), 'Haversine Nullabstand');

// Kumulierung: Grundform. Höhen werden über 2 km geglättet, daher hier nur Verhalten statt exakter Werte.
const k = gs.kumuliere_([[6.0, 46.0, 400], [6.01, 46.0, 450], [6.02, 46.0, 420], [6.03, 46.0, 430]]);
pruefe(k[0][2] === 0 && k[0][3] === 0 && k[0][4] === 0, 'Erster Punkt bei 0');
pruefe(k[0][0] === 46.0 && k[0][1] === 6.0, 'Reihenfolge [lat, lon]');
pruefe(nah(k[3][2], 3 * 0.01 * 111.1951 * Math.cos(46 * Math.PI / 180), 0.01), 'km kumuliert: ' + k[3][2]);

// Pass: 20 km je 1000 m rauf und runter, 50 m Auflösung → Anstieg ≈ Höhenunterschied
const pass = [];
for (let i = 0; i <= 800; i++) { const km = i * 0.05; pass.push([6 + km / 77.3, 46, 400 + 1000 * (1 - Math.abs(km - 20) / 20)]); }
const kp = gs.kumuliere_(pass);
const endePass = kp[kp.length - 1];
pruefe(endePass[3] > 900 && endePass[3] <= 1000 && endePass[4] > 900 && endePass[4] <= 1000, 'Pass 1000 m: Anstieg/Gefälle ' + Math.round(endePass[3]) + '/' + Math.round(endePass[4]));
pruefe(Math.max(...kp.map(p => p[5])) > 1350, 'Scheitel bleibt erhalten: ' + Math.round(Math.max(...kp.map(p => p[5]))));

// Rauschen ±4 m auf flacher Strecke zählt nicht
const rauschen = [];
for (let i = 0; i <= 200; i++) rauschen.push([6 + i * 0.001, 46, 400 + (i % 2 ? 4 : -4)]);
const kr = gs.kumuliere_(rauschen);
pruefe(kr[kr.length - 1][3] === 0 && kr[kr.length - 1][4] === 0, 'Rauschen ±4 m ergibt keinen Anstieg: ' + kr[kr.length - 1][3] + '/' + kr[kr.length - 1][4]);

// Ausreißer an Talwänden: flach, alle 1 km ein Sprung um +80 m über 100 m → fast kein Anstieg
const talwand = [];
for (let i = 0; i <= 300; i++) talwand.push([6 + i * 0.0013, 46, 400 + (i % 10 === 5 ? 80 : 0)]);
const kt = gs.kumuliere_(talwand);
pruefe(kt[kt.length - 1][3] < 20, 'Talwand-Ausreißer werden geglättet: Anstieg ' + Math.round(kt[kt.length - 1][3]));

// Straßennamen kürzen
pruefe(gs.kurzStrasse_('Autostrada dei Trafori, A26') === 'A26', 'Autobahnnummer aus langem Namen');
pruefe(gs.kurzStrasse_('A 5') === 'A 5' && gs.kurzStrasse_('Route du Grand-Saint-Bernard, N21, 21') === 'Route du Grand-Saint-Bernard', 'Kurzformen');
pruefe(gs.kurzStrasse_('Kantonsstrasse, 9') === 'Kantonsstrasse' && gs.kurzStrasse_('') === '', 'erster Teil vor Komma / leer');

// Straßenabschnitte aus ORS-Schritten
const vollKurz = [[46, 6, 0], [46, 6.1, 5], [46, 6.2, 10], [46, 6.3, 15], [46, 6.4, 20]];
const strassen = gs.strassenAbschnitte_([{ von: 0, name: 'Route de Lausanne' }, { von: 1, name: 'A 1' }, { von: 2, name: 'A 1' }, { von: 3, name: '-' }, { von: 4, name: 'A 5' }], vollKurz);
pruefe(JSON.stringify(strassen) === JSON.stringify([[0, 'Route de Lausanne'], [5, 'A 1'], [15, ''], [20, 'A 5']]), 'Abschnitte zusammengefasst: ' + JSON.stringify(strassen));
pruefe(gs.strasseBeiKm_(strassen, 7) === 'A 1', 'Straße bei km 7');
pruefe(gs.strasseBeiKm_(strassen, 16) === 'A 1', 'unbenanntes Stück → nächste benannte Straße (A 1 endet bei 15)');
pruefe(gs.strasseBeiKm_(strassen, 19) === 'A 5', 'unbenanntes Stück näher an A 5');
pruefe(gs.strasseBeiKm_([], 3) === '', 'ohne Abschnitte leer');

// Raststätten-Erkennung
pruefe(gs.istRaststaette_({ richtung: 'hin', name: 'EnBW', adresse: '', notiz: '' }), 'einseitig erreichbar → Raststätte');
pruefe(gs.istRaststaette_({ richtung: 'beide', name: 'EnBW Ladestation Freudenberg', adresse: 'Autobahn-Raststätte-Siegerland-West 1', notiz: '' }), 'Adresse mit Raststätte');
pruefe(!gs.istRaststaette_({ richtung: 'beide', name: 'EnBW Ladestation Walldorf', adresse: 'Roter Str. 2', notiz: 'Hotel' }), 'normale Station keine Raststätte');

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
for (let i = 0; i <= 1000; i++) steil.push([6.0 + i * 0.00013, 46.0, 400 + i * 1]); // 10 km, 1000 m Anstieg
const vollSteil = gs.kumuliere_(steil);
const duennSteil = gs.duenneAus_(vollSteil);
pruefe(duennSteil.length > 60, 'Höhenkriterium greift: ' + duennSteil.length + ' Punkte (nur 250 m wären ~40)');
pruefe(duennSteil[duennSteil.length - 1][3] === Math.round(vollSteil[vollSteil.length - 1][3]), 'Anstieg bleibt nach Ausdünnung gleich: ' + duennSteil[duennSteil.length - 1][3]);

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
  [{ id: 'test', name: 'Test', linie: linieOst, strassen: [[0, 'Route de Genève'], [8, 'A 1']] }],
  [
    { id: 'p001', name: 'Auf der Linie', lat: 46.0000012, lon: 6.0512345, richtung: 'beide' },
    { id: 'p002', name: '1,1 km nördlich', lat: 46.01, lon: 6.15, richtung: 'hin' },
    { id: 'p003', name: '5,5 km nördlich', lat: 46.05, lon: 6.15, richtung: 'beide' },
    { id: 'p004', name: 'weit weg', lat: 50.0, lon: 8.0, richtung: 'beide' },
    { id: 'p005', name: '3,3 km nördlich', lat: 46.03, lon: 6.12, richtung: 'beide', notiz: 'Autohof' },
    { id: 'p006', name: 'Raststätte', lat: 46.001, lon: 6.18, richtung: 'beide', notiz: 'Raststätte' },
  ],
  '2026-09-15T08:00:00Z'
);
pruefe(exp.version === '1.2' && exp.erzeugt === '2026-09-15T08:00:00Z', 'Kopf von routes.json');
pruefe(exp.routen[0].laenge_km === 15.47 && exp.routen[0].hm_hin === 100 && exp.routen[0].hm_rueck === 20, 'Routen-Summen: ' + JSON.stringify(exp.routen[0]).slice(0, 80));
pruefe(exp.punkte.length === 6, 'alle Punkte exportiert');
const p005 = exp.punkte[4].zuordnung[0], p006 = exp.punkte[5].zuordnung[0];
pruefe(p005 && p005.quer_km === 3.3 && p005.strasse === 'A1' && p005.raststaette === false, '3,3 km abseits zugeordnet mit Straße: ' + JSON.stringify(p005));
pruefe(p006 && p006.quer_km === 0.1 && p006.raststaette === true && p006.strasse === 'A1', 'Raststätte direkt an A 1: ' + JSON.stringify(p006));
pruefe(exp.punkte[0].zuordnung[0].strasse === 'Route de Genève' && exp.punkte[1].zuordnung[0].raststaette === false, 'Straße vor km 8; 1,1 km abseits keine Raststätte');
pruefe(exp.punkte[0].zuordnung.length === 1 && exp.punkte[0].lat === 46 && exp.punkte[0].lon === 6.05123, 'Punkt auf Linie zugeordnet und gerundet: ' + JSON.stringify(exp.punkte[0]));
pruefe(exp.punkte[1].zuordnung.length === 1 && exp.punkte[1].richtung === 'hin', '1,1 km abseits zugeordnet');
pruefe(exp.punkte[2].zuordnung.length === 1 && exp.punkte[2].zuordnung[0].quer_km === 5.5, '5,5 km abseits zugeordnet (Korridor 10 km): ' + JSON.stringify(exp.punkte[2].zuordnung));
pruefe(exp.punkte[3].zuordnung.length === 0, 'außerhalb des Rechtecks nicht zugeordnet');
const zu = exp.punkte[0].zuordnung[0];
pruefe(zu.route === 'test' && zu.km === 3.96 && zu.hm_hin === 26 && zu.hm_rueck === 5, 'Zuordnungswerte: ' + JSON.stringify(zu));

// Export ab 1.2: Straße der Station (Spalte „Straße") vor der Straße der Route
const exp2 = gs.baueExport_(
  [{ id: 'test', name: 'Test', linie: linieOst, strassen: [[0, 'Route de Genève'], [8, 'A 96']], hoechster: [12, 800], dauer_s: 600 }],
  [
    { id: 'p001', name: 'A', lat: 46.0, lon: 6.05, richtung: 'beide', strasse: '' },
    { id: 'p002', name: 'B', lat: 46.0, lon: 6.15, richtung: 'beide', strasse: 'A 7, A 96' },
    { id: 'p003', name: 'C', lat: 46.0, lon: 6.16, richtung: 'beide', strasse: 'A 7' },
    { id: 'p004', name: 'D', lat: 46.0, lon: 6.17, richtung: 'beide', strasse: '–' },
  ],
  '2026-09-18T08:00:00Z'
);
const str = i => exp2.punkte[i].zuordnung[0].strasse;
pruefe(str(0) === 'Route de Genève' && str(1) === 'A96' && str(2) === 'A7' && str(3) === 'A96', 'Straßen im Titel: ' + [0, 1, 2, 3].map(str));
pruefe(gs.waehleStrasse_('A96/A99', 'A 99') === 'A99' && gs.waehleStrasse_('A 96, A 99', '') === 'A96', 'Schreibweise ohne Leerzeichen, / als Trenner');
pruefe(exp2.routen[0].dauer_s === 600 && exp2.routen[0].hoechster[1] === 800, 'Fahrzeit und höchster Punkt exportiert');
pruefe(JSON.stringify(gs.hoechsterPunkt_([[0, 0, 0, 0, 0, 400], [0, 0, 12.34, 0, 0, 2005.4], [0, 0, 20, 0, 0, 900]])) === '[12.3,2005]', 'höchster Punkt');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
