// Test des Verbrauchsmodells: Startwerte gegen EV Database, Kalibrierung mit synthetischen Fahrten,
// und dass App (index.html) und Apps Script (Code.js) exakt dieselbe Physik rechnen.
// Aufruf: node tests/test-modell.js
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const quelle = fs.readFileSync(path.join(wurzel, 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { energieAnteile_, energieKwh_, kalibriere_, loese3_, pruefeFahrt_, MODELL_STANDARD };')();
const M = gs.MODELL_STANDARD;

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const nah = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;
const pro100 = (kmh, T) => gs.energieKwh_(M, gs.energieAnteile_(M, 100, 0, 0, kmh, T, 0));

// 1. Startwerte gegen EV Database (Born 58 kWh, 110 km/h)
pruefe(nah(pro100(110, 23), 18.1, 0.03), '110 km/h, 23 °C: ' + pro100(110, 23).toFixed(2) + ' kWh/100 km (Soll 18,1)');
pruefe(nah(pro100(110, -10), 23.2, 0.03), '110 km/h, −10 °C: ' + pro100(110, -10).toFixed(2) + ' kWh/100 km (Soll 23,2)');
pruefe(pro100(130, 15) > pro100(110, 15) * 1.2, 'Geschwindigkeit wirkt stark: 130 vs 110 km/h');
const hm = gs.energieAnteile_(M, 0.001, 1000, 0, 100, 15, 0).hoehe;
pruefe(hm > 6 && hm < 7.5, '1000 Höhenmeter bergauf ≈ 6–7 kWh: ' + hm.toFixed(2));
const zus = gs.energieAnteile_(M, 100, 0, 0, 120, 15, 300).fahrt / gs.energieAnteile_(M, 100, 0, 0, 120, 15, 0).fahrt;
pruefe(zus > 1.02 && zus < 1.1, '300 kg Zusatzgewicht erhöht den Fahrwiderstand leicht: Faktor ' + zus.toFixed(3));

// 2. Gleichungslöser
const x = gs.loese3_([[2, 1, 0], [1, 3, 1], [0, 1, 4]], [3, 5, 5]);
pruefe(x.every(v => nah(v, 1, 1e-9)), 'loese3_: ' + x);

// 3. Kalibrierung mit synthetischen Fahrten (wahre Faktoren: Fahrt 1,12, Höhe 0,85, Heizung 1,4)
let zufall = 42;
const rnd = () => { zufall = (zufall * 16807) % 2147483647; return zufall / 2147483647; };
const wahr = { gesamt: 1, fahrt: 1.12, hoehe: 0.85, heizung: 1.4 };
const fahrten = [];
for (let i = 0; i < 20; i++) {
  const km = 80 + rnd() * 200, auf = rnd() * 1500, ab = rnd() * 1200, kmh = 95 + rnd() * 40, T = -8 + rnd() * 32;
  const a = gs.energieAnteile_(M, km, auf, ab, kmh, T, 0);
  const real = gs.energieKwh_({ korrektur: wahr }, a) * (1 + (rnd() - 0.5) * 0.04); // ±2 % Rauschen
  fahrten.push({ w: 1, real, a: [a.fahrt, a.hoehe, a.heiz] });
}
const k20 = gs.kalibriere_(fahrten, 58);
pruefe(nah(k20.korrektur.fahrt, 1.12, 0.06) && nah(k20.korrektur.heizung, 1.4, 0.25) && nah(k20.korrektur.hoehe, 0.85, 0.25),
  '20 Fahrten → Faktoren wiedergefunden: ' + JSON.stringify(k20.korrektur));
pruefe(k20.abweichung < 1.5, 'Abweichung nach Kalibrierung klein: ' + k20.abweichung + ' %');

const k2 = gs.kalibriere_(fahrten.slice(0, 2), 58);
pruefe(k2.korrektur.fahrt === 1 && k2.korrektur.hoehe === 1 && k2.korrektur.gesamt > 1 && /Gesamtfaktor/.test(k2.methode), 'wenige Fahrten → nur Gesamtfaktor: ' + JSON.stringify(k2));
const k0 = gs.kalibriere_([], 58);
pruefe(k0.korrektur.gesamt === 1 && k0.abweichung === null, 'ohne Fahrten → Startwerte');
const ausreisser = gs.kalibriere_([{ w: 1, real: 500, a: [10, 0, 1] }], 58);
pruefe(ausreisser.korrektur.gesamt === 1.6, 'Tippfehler wird begrenzt: ' + ausreisser.korrektur.gesamt);

// 4. Prüfung der Formulardaten
const gueltig = { route: 'neuenrade', richtung: 'hin', start_soc: 80, ende_soc: 35, km: 210, start_zeit: '2026-09-15T08:00:00Z', ende_zeit: '2026-09-15T10:10:00Z', start_lat: 46.5, start_lon: 6.5, ende_lat: 47.5, ende_lon: 7.6 };
pruefe(gs.pruefeFahrt_(gueltig) === '', 'gültige Fahrt: ' + gs.pruefeFahrt_(gueltig));
pruefe(gs.pruefeFahrt_({ ...gueltig, ende_soc: 90 }) !== '', 'Ende > Start (unterwegs geladen) abgelehnt');
pruefe(gs.pruefeFahrt_({ ...gueltig, ende_soc: '' }) !== '', 'fehlender Ankunfts-Akkustand abgelehnt');
pruefe(gs.pruefeFahrt_({ ...gueltig, bordcomputer_kmh: 500 }) !== '', 'unplausible Ø-Geschwindigkeit abgelehnt');
pruefe(gs.pruefeFahrt_({ ...gueltig, ende_zeit: '2026-09-15T07:00:00Z' }) !== '', 'Ankunft vor Start abgelehnt');

// 5. App und Script rechnen identisch
const html = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
const block = html.match(/\/\/ ENERGIE-START[^\n]*\n([\s\S]*?)\/\/ ENERGIE-ENDE/);
pruefe(!!block, 'Energie-Block in index.html gefunden');
if (block) {
  const app = new Function(block[1] + '; return { energieAnteile, energieKwh };')();
  const modellJson = JSON.parse(fs.readFileSync(path.join(wurzel, 'modell.json'), 'utf8'));
  for (const fall of [[120, 400, 300, 118, 4, 150], [60, 0, 900, 80, -5, 0], [200, 1600, 1500, 125, 25, 0]]) {
    const ga = gs.energieAnteile_(M, ...fall), aa = app.energieAnteile(modellJson, ...fall);
    const gleich = ['fahrt', 'hoehe', 'heiz'].every(k => Math.abs(ga[k] - aa[k]) < 1e-9);
    pruefe(gleich, 'App = Script für ' + JSON.stringify(fall) + ': ' + JSON.stringify(ga) + ' / ' + JSON.stringify(aa));
  }
  pruefe(JSON.stringify(modellJson.physik) === JSON.stringify(M.physik) && JSON.stringify(modellJson.fahrzeug) === JSON.stringify(M.fahrzeug), 'modell.json enthält dieselben Startwerte wie Code.js');
}

console.log('Beispiele: 110 km/h 23 °C ' + pro100(110, 23).toFixed(1) + ' · 120 km/h 10 °C ' + pro100(120, 10).toFixed(1) + ' · 130 km/h 0 °C ' + pro100(130, 0).toFixed(1) + ' kWh/100 km');
console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
