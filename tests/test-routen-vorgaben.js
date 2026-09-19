// Test von routenVorgabenUebernehmen() aus apps-script/Code.js gegen ein nachgebautes Blatt „Routen".
// Aufruf: node tests/test-routen-vorgaben.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');

// Minimales Blatt: Zeilen als Arrays, 1-basierte Adressierung wie in Apps Script.
function bauBlatt(zeilen) {
  const daten = zeilen.map(z => z.slice());
  const breite = daten[0].length;
  const zelle = (r, c) => ({
    getValue: () => (daten[r - 1] || [])[c - 1] ?? '',
    setNumberFormat() { return this; },
    setValue(v) { while (daten.length < r) daten.push(new Array(breite).fill('')); daten[r - 1][c - 1] = v; return this; },
  });
  return {
    daten,
    getLastRow: () => daten.length,
    getLastColumn: () => breite,
    deleteRow: r => { daten.splice(r - 1, 1); },
    getRange: (r, c, nr, nc) => nr === undefined ? zelle(r, c) : {
      getValues: () => daten.slice(r - 1, r - 1 + nr).map(z => z.slice(c - 1, c - 1 + nc)),
    },
  };
}

const kopf = ['id', 'Name', 'Start', 'Via', 'Ziel', 'Länge km', 'Fahrzeit', 'Stand'];
const blatt = bauBlatt([
  kopf,
  ['neuenrade', 'Morges – Neuenrade', '46.5043239,6.4912739', '', '51.2847342,7.7950369', 716.4, '7 h 02 min', '15.09.2026 08:54'],
  ['ingolstadt', 'Morges – Ingolstadt', '46.5043239,6.4912739', '', '48.7650800,11.4237200', 620.7, '6 h 10 min', '15.09.2026 08:54'],
  ['savona', 'Morges – Savona', '46.5043239,6.4912739', '', '44.3090500,8.4771500', 452.9, '5 h 01 min', '15.09.2026 08:54'],
]);

const meldungen = [];
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: n => n === 'Routen' ? blatt : null }),
  getUi: () => { throw new Error('kein UI im Test'); },
};
const consoleStumm = { log: t => meldungen.push(t) };
const gs = new Function('SpreadsheetApp', 'console', quelle + '; return { routenVorgabenUebernehmen };')(SpreadsheetApp, consoleStumm);

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

gs.routenVorgabenUebernehmen();
console.log(meldungen.join('\n'));
const ids = blatt.daten.slice(1).map(z => z[0]);
pruefe(JSON.stringify(ids) === JSON.stringify(['neuenrade', 'ingolstadt', 'ingolstadt_augsburg', 'savona_simplon', 'savona_bernhard', 'brig']), 'Zeilen danach: ' + ids);
const zeile = id => blatt.daten.find(z => z[0] === id);
pruefe(zeile('neuenrade')[5] === 716.4 && zeile('neuenrade')[7] === '15.09.2026 08:54', 'bestehende Route unberührt');
pruefe(zeile('savona_simplon')[3] === '46.245838,8.02474' && zeile('savona_simplon')[1] === 'Morges – Savona (Simplon)', 'Simplon-Zeile: ' + zeile('savona_simplon'));
pruefe(zeile('savona_bernhard')[3] === '45.85658,7.16605' && zeile('savona_bernhard')[4] === '44.3090500,8.4771500', 'Bernhard-Zeile: ' + zeile('savona_bernhard'));
pruefe(zeile('ingolstadt')[1] === 'Morges – Ingolstadt (München)' && zeile('ingolstadt')[3] === '' && zeile('ingolstadt')[5] === 620.7, 'Ingolstadt nur umbenannt: ' + zeile('ingolstadt'));
pruefe(zeile('ingolstadt_augsburg')[3] === '48.13813,10.83188;48.52578,11.23978' && zeile('ingolstadt_augsburg')[4] === '48.7650800,11.4237200', 'Augsburg-Zeile: ' + zeile('ingolstadt_augsburg'));
pruefe(zeile('savona_simplon')[7] === '' && zeile('savona_bernhard')[5] === '', 'neue Zeilen ohne Länge/Stand → werden berechnet');

// Zweiter Lauf ändert nichts
const vorher = JSON.stringify(blatt.daten);
meldungen.length = 0;
gs.routenVorgabenUebernehmen();
pruefe(JSON.stringify(blatt.daten) === vorher, 'zweiter Lauf ändert nichts');
pruefe(meldungen.join(' ').includes('nichts geändert'), 'Meldung beim zweiten Lauf: ' + meldungen.join(' '));

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
