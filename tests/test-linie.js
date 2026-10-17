// Prüft, dass die App (index.html, Block LINIE-START … LINIE-ENDE) Routen genau so aufbereitet wie das Script
// (kumuliere_ / duenneAus_ in apps-script/Code.js): gleiche Glättung, gleiche Höhenmeter, gleiche Ausdünnung.
// Aufruf: node tests/test-linie.js
const fs = require('fs');
const path = require('path');

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

const wurzel = path.join(__dirname, '..');
const gs = new Function(fs.readFileSync(path.join(wurzel, 'apps-script', 'Code.js'), 'utf8') + '; return { kumuliere_, duenneAus_, haversine_ };')();
const html = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
const block = html.match(/\/\/ LINIE-START[^\n]*\n([\s\S]*?)\/\/ LINIE-ENDE/);
pruefe(!!block, 'Linien-Block in index.html gefunden');
const app = new Function('haversine', block[1] + '; return { kumuliere, duenneAus };')(gs.haversine_);

// Synthetische Strecke: 120 km mit Kurven, Pass (+900 m) und Messrauschen (±40 m), Punkte unregelmäßig dicht
let zufall = 42;
const rnd = () => { zufall = (zufall * 1103515245 + 12345) % 2147483648; return zufall / 2147483648; };
const koord = [];
let lat = 46.2, lon = 7.0, s = 0;
for (let i = 0; i < 6000; i++) {
  const schritt = 0.005 + rnd() * 0.04;   // 5–45 m
  s += schritt;
  lat += schritt / 111 * Math.cos(s / 15);
  lon += schritt / 77 * Math.sin(s / 15 + 0.5);
  const hoehe = 500 + 900 * Math.exp(-Math.pow((s - 60) / 15, 2)) + (rnd() - 0.5) * 80;
  koord.push([lon, lat, hoehe]);
}

const a = app.duenneAus(app.kumuliere(koord));
const g = gs.duenneAus_(gs.kumuliere_(koord));
pruefe(a.length === g.length, 'gleich viele Stützpunkte (App ' + a.length + ', Script ' + g.length + ')');
pruefe(JSON.stringify(a) === JSON.stringify(g), 'Linie identisch');
const ende = a[a.length - 1];
pruefe(ende[3] > 800 && ende[3] < 1100, 'Anstieg geglättet plausibel (~900 m), war ' + ende[3]);
// Fahrt auswerten (auswertung.html) rechnet mit einer Kopie desselben Blocks
const ohneEinzug = t => t.split('\n').map(z => z.trim()).join('\n').trim();
const ausw = fs.readFileSync(path.join(wurzel, 'auswertung.html'), 'utf8').match(/\/\/ LINIE-START[^\n]*\n([\s\S]*?)\/\/ LINIE-ENDE/);
pruefe(!!ausw && ohneEinzug(ausw[1]) === ohneEinzug(block[1]), 'LINIE-Block in auswertung.html = index.html');
console.log('Linie: ' + a.length + ' Stützpunkte, ' + ende[2] + ' km, +' + ende[3] + ' / −' + ende[4] + ' m');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
