// Test der Vergleichswerte (ABRP / My CUPRA) aus apps-script/Code.js mit den echten routes.json und Linien.
// Aufruf: node tests/test-vergleich.js
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const quelle = fs.readFileSync(path.join(wurzel, 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { parseFahrzeit_, pruefeVergleich_, positionAufRoute_, streckenwerte_, gewichtFuer_, quellenStatistik_, vergleichsRouten_, kurznameServer_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

// Fahrzeit
pruefe(gs.parseFahrzeit_('2:10') === 130 && gs.parseFahrzeit_('2h10') === 130 && gs.parseFahrzeit_('2.05') === 125, 'h:mm-Formate');
pruefe(gs.parseFahrzeit_('95') === 95 && gs.parseFahrzeit_('95 min') === 95, 'Minuten');
pruefe(gs.parseFahrzeit_('') === null && Number.isNaN(gs.parseFahrzeit_('zwei Stunden')) && Number.isNaN(gs.parseFahrzeit_('2:75')), 'leer / unlesbar');

// Prüfung
const gut = { quelle: 'ABRP', route: 'neuenrade', richtung: 'hin', von: 'anfang', nach: 'p041', start_soc: 90, ende_soc: 55, fahrzeit: '2:05', temperatur: '' };
pruefe(gs.pruefeVergleich_(gut) === '', 'gültig: ' + gs.pruefeVergleich_(gut));
pruefe(gs.pruefeVergleich_({ ...gut, quelle: '' }) !== '', 'ohne Quelle abgelehnt');
pruefe(gs.pruefeVergleich_({ ...gut, nach: 'anfang' }) !== '', 'Von = Nach abgelehnt');
pruefe(gs.pruefeVergleich_({ ...gut, ende_soc: 95 }) !== '', 'Ankunft > Start abgelehnt');
pruefe(gs.pruefeVergleich_({ ...gut, fahrzeit: 'bald' }) !== '', 'unlesbare Fahrzeit abgelehnt');
pruefe(gs.pruefeVergleich_({ ...gut, von: 'x; drop' }) !== '', 'ungültige Station abgelehnt');

// Gewichte
pruefe(gs.gewichtFuer_('gemessen', true, true) === 1 && gs.gewichtFuer_('gemessen', false, true) === 0.5, 'gemessen 1 / 0,5');
pruefe(gs.gewichtFuer_('ABRP', false, true) === 0.3 && gs.gewichtFuer_('My CUPRA', false, false) === 0.15, 'ABRP / My CUPRA 0,3 / 0,15');

// Statistik je Quelle
const st = gs.quellenStatistik_([{ quelle: 'ABRP', diff: 2 }, { quelle: 'ABRP', diff: -4 }, { quelle: 'gemessen', diff: 1 }]);
pruefe(st.ABRP.n === 2 && st.ABRP.abweichung === 3 && st.ABRP.tendenz === -1 && st.gemessen.n === 1, 'Statistik: ' + JSON.stringify(st));

// Positionen und Strecke mit echten Daten
const json = JSON.parse(fs.readFileSync(path.join(wurzel, 'routes.json'), 'utf8'));
const linie = JSON.parse(fs.readFileSync(path.join(wurzel, 'linien', 'neuenrade.json'), 'utf8')).linie;
const anfang = gs.positionAufRoute_(json, linie, 'neuenrade', 'anfang');
const ende = gs.positionAufRoute_(json, linie, 'neuenrade', 'ende');
const weil = json.punkte.find(p => /Weil am Rhein/.test(p.name));
const pWeil = gs.positionAufRoute_(json, linie, 'neuenrade', weil.id);
pruefe(anfang.km === 0 && anfang.name === 'Morges' && ende.name === 'Neuenrade' && Math.abs(ende.km - json.routen[0].laenge_km) < 1, 'Anfang/Ende: ' + JSON.stringify([anfang.name, ende.name, ende.km]));
pruefe(pWeil && pWeil.km > 150 && pWeil.km < 260, 'Weil am Rhein bei km ' + (pWeil && pWeil.km));
pruefe(gs.positionAufRoute_(json, linie, 'neuenrade', 'p999') === null, 'unbekannte Station → null');
const hin = gs.streckenwerte_('hin', anfang, pWeil), rueck = gs.streckenwerte_('rueck', pWeil, anfang);
pruefe(Math.abs(hin.km - rueck.km) < 1e-9 && hin.auf === rueck.ab && hin.ab === rueck.auf, 'Hin- und Rückrichtung spiegeln Anstieg und Gefälle');
pruefe(gs.streckenwerte_('hin', pWeil, anfang).km === 0, 'falsche Reihenfolge → 0 km');

// Auswahllisten
const vr = gs.vergleichsRouten_(json);
pruefe(vr.length === json.routen.length && vr[0].stationen.length > 10 && vr[0].stationen.every(s => typeof s.km === 'number'), 'Routen für das Formular');
pruefe(gs.kurznameServer_('EnBW-Ladestation Eschborn') === 'EnBW Eschborn' && gs.kurznameServer_('AMAG Charging Station Bern') === 'AMAG Bern', 'Kurznamen');

// App und Script: gleiche Streckenwerte
const html = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
const fn = html.match(/function streckenwerte\(richtung, von, bis\) \{[\s\S]*?\n    \}/);
pruefe(!!fn, 'streckenwerte() in index.html gefunden');
if (fn) {
  const app = new Function(fn[0] + '; return streckenwerte;')();
  pruefe(JSON.stringify(app('rueck', pWeil, anfang)) === JSON.stringify(gs.streckenwerte_('rueck', pWeil, anfang)), 'App = Script');
}

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
