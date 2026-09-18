// Test von ordneSpalten_() aus apps-script/Code.js: altes Blatt Ladepunkte → neue Spaltenreihenfolge, Inhalte wandern mit.
// Aufruf: node tests/test-spalten.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const SpreadsheetApp = { flush() {} };
const gs = new Function('SpreadsheetApp', quelle + '; return { ordneSpalten_, SPALTEN_PUNKTE, punkteZeile_ };')(SpreadsheetApp);

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

// Blatt als Spaltenliste; moveColumns wie in Apps Script: Ziel-Index vor dem Verschieben, Rest rückt nach rechts
function bauBlatt(koepfe, zeilen) {
  let spalten = koepfe.map((k, i) => [k].concat(zeilen.map(z => z[i])));
  return {
    get spalten() { return spalten; },
    getLastColumn: () => spalten.length,
    getMaxRows: () => zeilen.length + 1,
    getRange: (r, c, nr, nc) => ({
      getValues: () => [spalten.slice(c - 1, c - 1 + nc).map(s => s[r - 1])],
      spalte: c,
    }),
    moveColumns(bereich, ziel) {
      const von = bereich.spalte - 1;
      const [s] = spalten.splice(von, 1);
      spalten.splice(ziel - 1 > von ? ziel - 2 : ziel - 1, 0, s);
    },
  };
}

const alt = ['id', 'Maps-Link', 'Name', 'Adresse', 'Lat', 'Lon', 'Betreiber', 'kW', 'Anzahl', 'Richtung', 'Favorit', 'Notiz', 'Status', 'Straße', 'Eigene'];
const zeile = alt.map(k => 'p001:' + k);
const blatt = bauBlatt(alt, [zeile]);
pruefe(gs.ordneSpalten_(blatt) === true, 'verschoben');
const koepfe = blatt.spalten.map(s => s[0]);
pruefe(JSON.stringify(koepfe) === JSON.stringify(gs.SPALTEN_PUNKTE.concat(['Eigene'])), 'neue Reihenfolge, eigene Spalte hinten: ' + koepfe);
pruefe(blatt.spalten.every(s => s[1] === 'p001:' + s[0]), 'Inhalte bei ihrem Kopf geblieben');
pruefe(gs.ordneSpalten_(blatt) === false, 'zweiter Lauf ändert nichts');
pruefe(gs.punkteZeile_({ id: 'p1', Notiz: 'x' }).length === gs.SPALTEN_PUNKTE.length, 'punkteZeile_ volle Breite');

console.log(fehler === 0 ? 'Spalten: alle Prüfungen bestanden' : fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
