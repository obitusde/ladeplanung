// Test der Auswertung der Bundesdaten (tests/hole-bundesdaten.js) mit kleinen Beispieldaten.
// Aufruf: node tests/test-bundesdaten.js
const { auswerten, standortName } = require('./hole-bundesdaten.js');

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

const evse = (name, lat, lon, kw, ort, strasse) => ({
  ChargingStationNames: typeof name === 'string' ? [{ lang: 'de', value: name }] : name,
  GeoCoordinates: { Google: lat + ' ' + lon },
  ChargingFacilities: [{ power: String(kw) }],
  Address: { City: ort, PostalCode: '1950', Street: strasse || 'Route 1' },
});

const bund = { EVSEData: [
  { OperatorName: 'M-Charge', EVSEDataRecord: [
    evse('Migrol | Sion 1', 46.23111, 7.36222, 320, 'Sion'),
    evse('Migrol | Sion 2', 46.23113, 7.36225, 320, 'Sion'),          // gleicher Standort
    evse('Migros | Sion-Metropole 4', 46.2300, 7.3600, 150, 'Sion'),   // Migros, nicht Migrol
    evse('Migrol | Kleinort 1', 46.5, 7.0, 50, 'Kleinort'),            // unter 100 kW
  ] },
  { OperatorName: 'Tesla', EVSEDataRecord: [
    evse({ lang: 'en', value: '' }, 46.3, 7.8, 150, 'Steg'),              // Name als Objekt statt Liste
    evse([], 46.30005, 7.80005, 250, 'Steg'),
  ] },
  { OperatorName: 'eCarUp', EVSEDataRecord: [evse('Irgendwas', 46.4, 7.0, 150, 'X')] },
] };

const erg = auswerten(bund);
pruefe(erg.length === 2, 'zwei Standorte erwartet, waren ' + erg.length + ': ' + erg.map(p => p.name).join(', '));
const sion = erg.find(p => p.betreiber === 'Migrol');
pruefe(sion && sion.name === 'Migrol Sion' && sion.anzahl === 2 && sion.kw === 320, 'Migrol Sion zusammengefasst: ' + JSON.stringify(sion));
pruefe(sion && sion.adresse === 'Route 1, 1950 Sion, Schweiz', 'Adresse endet auf „Schweiz" (für die Preise): ' + (sion && sion.adresse));
const steg = erg.find(p => p.betreiber === 'Tesla');
pruefe(steg && steg.name === 'Tesla Supercharger Steg' && steg.kw === 250 && steg.anzahl === 2, 'Tesla Steg: ' + JSON.stringify(steg));
pruefe(erg.every(p => /^bfe-\d+\.\d{4}-\d+\.\d{4}$/.test(p.id)), 'ids im Format bfe-lat-lon');
pruefe(standortName('Migrol', 'Migrol | Gossau SG 1', 'Gossau') === 'Migrol Gossau SG', 'Name ohne Laufnummer');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
