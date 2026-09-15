// Test von planeBereinigung_ aus apps-script/Code.js an den echten Zeilen (Stand 15.09.2026).
// Aufruf: node tests/test-bereinigung.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { planeBereinigung_, vereinigeNotizen_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

// [id, Name, Lat, Lon, Richtung, Notiz] — Auszug aus dem Sheet nach „Links auflösen"
const roh = [
  ['p001', 'AMAG-Ladestation Lausanne', 46.522609, 6.613351, 'beide', ''],
  ['p003', 'Porsche Destination Charging Schlieren', 47.402215, 8.440265, 'beide', ''],
  ['p006', 'AMAG Charging Station Bern', 46.965777, 7.466362, 'beide', 'Migrolino'],
  ['p007', 'Amag-Ladestation Zuchwil', 47.202339, 7.571424, 'beide', 'McDo'],
  ['p009', 'Porsche Sales & Marketplace Charging Station Winterthur', 47.477, 8.70397, 'beide', 'Nichts'],
  ['p010', 'EnBW Ladestation Haiger', 50.763184, 8.15571, 'beide', 'Tankstelle, Pommesbude'],
  ['p011', 'EnBW Ladestation Appenweier', 48.56299, 7.955814, 'rueck', 'Raststätte'],
  ['p012', 'EnBW Ladestation Mahlberg', 48.309714, 7.788803, 'rueck', 'Raststätte'],
  ['p013', 'EnBW Ladestation Karlsruhe', 49.003795, 8.447353, 'beide', 'McDo, Grill'],
  ['p014', 'EnBW Ladestation Karlsruhe', 49.003409, 8.456206, 'beide', 'Nichts'],
  ['p020', 'AMAG Charging Station Bern', 46.965777, 7.466362, 'beide', 'Migrolino'],
  ['p021', 'Amag-Ladestation Zuchwil', 47.202339, 7.571424, 'beide', 'McDo'],
  ['p025', 'EnBW Ladestation Riegel am Kaiserstuhl', 48.156968, 7.745885, 'beide', 'Netto, Aral'],
  ['p026', 'EnBW Ladestation Ringsheim', 48.25028, 7.76599, 'beide', 'Esso, Subway, Hotel'],
  ['p032', 'EnBW Ladestation Haiger', 50.763184, 8.15571, 'beide', 'Shell'],
  ['p034', 'EnBW Ladestation Ringsheim', 48.25028, 7.76599, 'beide', 'Hotel, Subway'],
  ['p035', 'EnBW Ladestation Riegel am Kaiserstuhl', 48.156968, 7.745885, 'beide', 'Netto'],
  ['p036', 'EnBW Ladestation Appenweier', 48.562915, 7.959093, 'hin', 'Raststätte'],
  ['p040', 'EnBW-Ladestation Mahlberg', 48.309054, 7.791571, 'hin', 'Raststätte'],
];
const zeilen = roh.map((r, i) => ({
  zeile: i + 2, id: r[0], name: r[1], lat: r[2], lon: r[3], richtung: r[4], notiz: r[5],
  favorit: '', betreiber: 'EnBW', kw: '', anzahl: '',
}));
const idVonZeile = z => zeilen.find(x => x.zeile === z).id;

const plan = gs.planeBereinigung_(zeilen);
const geloescht = plan.loeschen.map(idVonZeile).sort();
console.log(plan.beschreibung.join('\n'));

pruefe(JSON.stringify(geloescht) === JSON.stringify(['p003', 'p020', 'p021', 'p032', 'p034', 'p035']), 'gelöschte ids: ' + geloescht);
pruefe(!geloescht.includes('p009'), 'Porsche Winterthur (kein Destination) bleibt');
pruefe(!geloescht.includes('p036') && !geloescht.includes('p040') && !geloescht.includes('p014'), 'Gegenseiten-Raststätten und Karlsruhe bleiben getrennt');

const aenderung = id => (plan.aenderungen.find(a => a.id === id) || {}).felder;
pruefe(aenderung('p010') && aenderung('p010').Notiz === 'Tankstelle, Pommesbude, Shell', 'Haiger Notiz: ' + JSON.stringify(aenderung('p010')));
pruefe(aenderung('p025') === undefined, 'Riegel: „Netto" steckt schon in „Netto, Aral" — keine Änderung');
pruefe(aenderung('p026') === undefined, 'Ringsheim: alle Teile schon enthalten — keine Änderung');
pruefe(aenderung('p006') === undefined && aenderung('p007') === undefined, 'Bern/Zuchwil identisch — keine Änderung');
pruefe(plan.aenderungen.length === 1, 'genau eine geänderte Zeile, sind: ' + plan.aenderungen.map(a => a.id));

// Zweiter Lauf auf dem bereinigten Stand findet nichts
const rest = zeilen.filter(z => !plan.loeschen.includes(z.zeile)).map(z => z.id === 'p010' ? { ...z, notiz: 'Tankstelle, Pommesbude, Shell' } : z);
const plan2 = gs.planeBereinigung_(rest);
pruefe(plan2.loeschen.length === 0 && plan2.aenderungen.length === 0, 'zweiter Lauf ändert nichts');

// Richtung und Favorit beim Zusammenführen
const gemischt = gs.planeBereinigung_([
  { zeile: 2, id: 'a', name: 'X', lat: 47, lon: 8, notiz: '', favorit: '', richtung: 'hin', betreiber: '', kw: '', anzahl: '' },
  { zeile: 3, id: 'b', name: 'X', lat: 47.0001, lon: 8, notiz: 'Coop', favorit: 'ja', richtung: 'rueck', betreiber: 'Ionity', kw: 350, anzahl: 6 },
]);
const f = gemischt.aenderungen[0].felder;
pruefe(f.Richtung === 'beide' && f.Favorit === 'ja' && f.Notiz === 'Coop' && f.kW === 350 && f.Betreiber === 'Ionity', 'Felder übernommen: ' + JSON.stringify(f));

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
