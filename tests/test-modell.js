// Test des Verbrauchsmodells: Startwerte gegen EV Database, Kalibrierung mit synthetischen Fahrten,
// und dass App (index.html) und Apps Script (Code.js) exakt dieselbe Physik rechnen.
// Aufruf: node tests/test-modell.js
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const quelle = fs.readFileSync(path.join(wurzel, 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { energieAnteile_, energieKwh_, kalibriere_, kalibriereZeilen_, loese3_, pruefeFahrt_, tempoFaktor_, MODELL_STANDARD };')();
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
  fahrten.push({ w: 1, real, a: [a.fahrt, a.hoehe, a.heiz], temp: T });
}
const k20 = gs.kalibriere_(fahrten, 58);
const wirk = n => k20.korrektur.gesamt * k20.korrektur[n];
pruefe(nah(wirk('fahrt'), 1.12, 0.08) && wirk('heizung') > 1.05 && wirk('heizung') < 1.6 && wirk('hoehe') > 0.6 && wirk('hoehe') < 1.1,
  '20 Fahrten → wirksame Faktoren in der richtigen Richtung: Fahrt ' + wirk('fahrt').toFixed(2) + ', Höhe ' + wirk('hoehe').toFixed(2) + ', Heizung ' + wirk('heizung').toFixed(2));
pruefe(k20.abweichung < 1.5, 'Abweichung nach Kalibrierung klein: ' + k20.abweichung + ' %');
pruefe(k20.ausreisser.every(x => !x), 'keine Ausreißer in sauberen Daten');

// Ausreißer: ein Wert mit 75 % mehr Verbrauch wird erkannt und verfälscht die Faktoren nicht
const mitAusreisser = fahrten.slice(0, 8).concat([{ ...fahrten[8], real: fahrten[8].real * 1.75 }]);
const ka = gs.kalibriere_(mitAusreisser, 58);
pruefe(ka.ausreisser[8] === true && ka.ausreisser.slice(0, 8).every(x => !x), 'Ausreißer erkannt: ' + JSON.stringify(ka.ausreisser));
pruefe(ka.abweichung < 2, 'Abweichung ohne Ausreißer klein: ' + ka.abweichung);

// Gleiche Temperatur überall → Heizung bleibt fest bei 1
const warm = fahrten.slice(0, 8).map(f => ({ ...f, temp: 24 }));
pruefe(gs.kalibriere_(warm, 58).korrektur.heizung === 1, 'Heizung ohne Temperaturspanne fest');

// Echte ABRP-Werte aus dem Blatt „Fahrten" (15.09.2026): Zeile 4 (Oftringen 2:43 h, 64 %) passt nicht zu Zeile 3
const echt = [
  ['Morges → EnBW Bühl', 354.7, 1026, 1281, 97, 26.6, 100, 7],
  ['Morges → EnBW Weil am Rhein', 204.8, 1002, 1135, 92, 24.7, 100, 49],
  ['Morges → AMAG Oftringen', 172.5, 857, 677, 97, 24.9, 100, 57],
  ['Morges → AMAG Oftringen', 172.5, 857, 677, 64, 24.9, 100, 36],
  ['AMAG Crissier → AMAG Bern', 102, 619, 478, 94, 24.1, 100, 70],
  ['Morges → Tesla Supercharger', 236, 2417, 2569, 81, 23.8, 100, 28],
].map(r => ({ notiz: r[0], km: r[1], hmAuf: r[2], hmAb: r[3], kmh: r[4], temp: r[5], start: r[6], ende: r[7], zusatzKg: 0, quelle: 'ABRP', bordcomputer: false, dauer: true, verwenden: 'ja' }));
const ergEcht = gs.kalibriereZeilen_(echt);
pruefe(/Ausreißer/.test(ergEcht.zeilen[3].status) && ergEcht.zeilen.filter(z => /Ausreißer/.test(z.status)).length === 1, 'Oftringen 2:43 h als einziger Ausreißer: ' + ergEcht.zeilen.map(z => z.status).join(' | '));
const kg = ergEcht.modell.korrektur;
pruefe(kg.gesamt > 0.85 && kg.gesamt < 1.0 && kg.heizung === 1, 'echte Werte → Gesamtfaktor ' + kg.gesamt.toFixed(3) + ', Heizung fest: ' + JSON.stringify(kg));
pruefe(ergEcht.modell.kalibrierung.abweichung_prozent < 6 && Math.abs(ergEcht.modell.kalibrierung.quellen.ABRP.tendenz) < 4,
  'echte Werte → Abweichung ' + ergEcht.modell.kalibrierung.abweichung_prozent + ' %, Tendenz ' + ergEcht.modell.kalibrierung.quellen.ABRP.tendenz);
console.log('Echte ABRP-Werte: ' + ergEcht.modell.kalibrierung.methode + ' · Faktoren ' + JSON.stringify(kg) + ' · Ø Abweichung ' + ergEcht.modell.kalibrierung.abweichung_prozent + ' %');

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
// Reisetempo: Faktor aus echten Fahrten auf den Schnitt der Route
const routenTempo = { neuenrade: 109, savona_simplon: 87 };
const tempoZeilen = [
  { route: 'neuenrade', km: 300, bordcomputer: 120, quelle: 'gemessen' },
  { route: 'savona_simplon', km: 100, bordcomputer: 87, quelle: 'gemessen' },
  { route: 'neuenrade', km: 200, bordcomputer: 150, quelle: 'ABRP' },          // ABRP zählt nicht
  { route: 'neuenrade', km: 200, bordcomputer: '', quelle: 'gemessen' },       // ohne Bordcomputer
  { route: 'neuenrade', km: 200, bordcomputer: 130, quelle: 'gemessen', verwenden: 'nein' },
  { route: 'unbekannt', km: 200, bordcomputer: 130, quelle: 'gemessen' },      // Route ohne Fahrzeit
];
const tf = gs.tempoFaktor_(tempoZeilen, routenTempo);
pruefe(tf.fahrten === 2 && Math.abs(tf.faktor - ((120 / 109 * 300 + 1 * 100) / 400)) < 0.002, 'Tempo-Faktor: ' + JSON.stringify(tf));
pruefe(JSON.stringify(gs.tempoFaktor_([], routenTempo)) === '{"faktor":1,"fahrten":0}', 'ohne echte Fahrt Faktor 1');
pruefe(gs.tempoFaktor_([{ route: 'neuenrade', km: 300, bordcomputer: 300, quelle: 'gemessen' }], routenTempo).faktor === 1.4, 'Faktor begrenzt');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
