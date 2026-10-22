// Test der Auswertung der Bundesdaten (tests/hole-bundesdaten.js) mit kleinen Beispieldaten.
// Aufruf: node tests/test-bundesdaten.js
const { auswerten, auswertenDE, standortName, neuesterCsvLink, nurOffeneTesla, eindeutigeNamen } = require('./hole-bundesdaten.js');

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
  { OperatorName: 'Autosense', EVSEDataRecord: [evse('AMAG Charging Station Cham', 47.18, 8.46, 400, 'Cham')] },
] };

const alleCh = auswerten(bund);
const amag = alleCh.find(p => p.betreiber === 'AMAG');
pruefe(amag && amag.name === 'AMAG Charging Station Cham' && amag.kw === 400, 'AMAG aus den Bundesdaten: ' + JSON.stringify(amag));
const erg = alleCh.filter(p => p.betreiber !== 'AMAG');
pruefe(erg.length === 2, 'zwei Standorte erwartet, waren ' + erg.length + ': ' + erg.map(p => p.name).join(', '));
const sion = erg.find(p => p.betreiber === 'Migrol');
pruefe(sion && sion.name === 'Migrol Sion' && sion.anzahl === 2 && sion.kw === 320, 'Migrol Sion zusammengefasst: ' + JSON.stringify(sion));
pruefe(sion && sion.adresse === 'Route 1, 1950 Sion, Schweiz', 'Adresse endet auf „Schweiz" (für die Preise): ' + (sion && sion.adresse));
const steg = erg.find(p => p.betreiber === 'Tesla');
pruefe(steg && steg.name === 'Tesla Supercharger Steg' && steg.kw === 250 && steg.anzahl === 2, 'Tesla Steg: ' + JSON.stringify(steg));
pruefe(erg.every(p => /^bfe-\d+\.\d{4}-\d+\.\d{4}$/.test(p.id)), 'ids im Format bfe-lat-lon');
pruefe(standortName('Migrol', 'Migrol | Gossau SG 1', 'Gossau') === 'Migrol Gossau SG', 'Name ohne Laufnummer');

// Deutschland: Ladesäulenregister (Aufbau wie die echte Datei vom 01.09.2026, gekürzt)
const kopfDE = 'Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;Anzahl Ladepunkte;Nennleistung Ladeeinrichtung [kW];' +
  'Inbetriebnahmedatum;Straße;Hausnummer;Adresszusatz;Postleitzahl;Ort;Kreis/kreisfreie Stadt;Bundesland;Breitengrad;Längengrad;Standortbezeichnung';
const zeileDE = (id, betreiber, name, status, anzahl, kw, strasse, nr, plz, ort, lat, lon, zusatz) =>
  [id, betreiber, name, status, 'Schnellladeeinrichtung', anzahl, kw, '01.01.2024', strasse, nr, zusatz || '', plz, ort, 'Kreis', 'BW', lat, lon, ''].join(';');
const csv = '﻿Ladesäulenregister Bundesnetzagentur;;;\r\nHinweis: ;;;\r\nLetzte Aktualisierung vom: 01.09.2026;;;\r\n;;;\r\n' +
  'Allgemeine Informationen;;;1. Ladepunkt\r\n' + kopfDE + '\r\n' + [
  zeileDE('1', 'EnBW mobility+ AG und Co.KG ', '', 'In Betrieb', '4', '300', 'Ulmer Str.', '5', '89129', 'Langenau', '48,4950', '10,1180'),
  zeileDE('2', 'EnBW mobility+ AG und Co.KG ', '', 'In Betrieb', '4', '300', 'Ulmer Str.', '5', '89129', 'Langenau', '48,49505', '10,11805'), // gleicher Standort
  zeileDE('3', 'EnBW mobility+ AG und Co.KG ', '', 'In Betrieb', '2', '22', 'Dorfstr.', '1', '89000', 'Klein', '48,1', '10,0'),               // unter 100 kW
  zeileDE('4', 'EnBW Ostwürttemberg DonauRies AG', '', 'In Betrieb', '2', '150', 'A', '1', '73430', 'Aalen', '48,83', '10,09'),         // regionale Tochter
  zeileDE('5', 'Tesla Manufacturing Brandenburg SE', '', 'In Betrieb', '8', '250', 'Tesla Str.', '1', '15537', 'Grünheide', '52,39', '13,79'), // Werk
  zeileDE('6', 'Tesla Germany GmbH', '', 'In Betrieb', '12', '250', 'Am Rasthof', '2', '89188', 'Merklingen', '48,5120', '9,7600', '"an der A8; Ausfahrt 61"'),
  zeileDE('7', 'Tesla Germany GmbH', '', 'Außer Betrieb', '8', '250', 'X', '1', '70000', 'Stuttgart', '48,7', '9,1'),
].join('\r\n') + '\r\n';
const de = auswertenDE(csv);
pruefe(de.length === 2, 'Deutschland: 2 Standorte erwartet, waren ' + de.length + ': ' + de.map(p => p.name).join(', '));
const langenau = de.find(p => p.betreiber === 'EnBW');
pruefe(langenau && langenau.name === 'EnBW Langenau' && langenau.anzahl === 8 && langenau.kw === 300, 'EnBW Langenau zusammengefasst: ' + JSON.stringify(langenau));
pruefe(langenau && langenau.adresse === 'Ulmer Str. 5, 89129 Langenau, Deutschland', 'Adresse DE: ' + (langenau && langenau.adresse));
pruefe(langenau && Math.abs(langenau.lat - 48.495) < 0.001, 'Komma-Koordinaten gelesen');
const merklingen = de.find(p => p.betreiber === 'Tesla');
pruefe(merklingen && merklingen.name === 'Tesla Supercharger Merklingen' && merklingen.anzahl === 12, 'Tesla Merklingen (Semikolon im Feld): ' + JSON.stringify(merklingen));
pruefe(de.every(p => p.id.startsWith('bnetza-')), 'ids im Format bnetza-lat-lon');

const seite = '<a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/x/Ladesaeulenregister_BNetzA_2026-08-01.csv">alt</a>' +
  '<a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/x/Ladesaeulenregister_BNetzA_2026-09-01.csv">neu</a>' +
  '<a href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/x/Ladesaeulenregister_BNetzA_2026-09-30.xlsx">xlsx</a>';
const link = neuesterCsvLink(seite);
pruefe(link && link.stand === '2026-09-01' && link.url.endsWith('_2026-09-01.csv'), 'neuester CSV-Link: ' + JSON.stringify(link));
pruefe(neuesterCsvLink('<html>nichts</html>') === null, 'ohne Link null');

// Tesla nur, wo auch andere Autos laden dürfen (supercharge.info)
const site = (lat, lon, otherEVs, status) => ({ gps: { latitude: lat, longitude: lon }, otherEVs, status: status || 'OPEN' });
const teslaTest = nurOffeneTesla([
  { name: 'Tesla Supercharger Martigny', betreiber: 'Tesla', lat: 46.1000, lon: 7.0800 },
  { name: 'Tesla Supercharger Bern', betreiber: 'Tesla', lat: 46.9500, lon: 7.4400 },
  { name: 'Tesla Supercharger Alt', betreiber: 'Tesla', lat: 48.0000, lon: 9.0000 },
  { name: 'Tesla Supercharger Neu', betreiber: 'Tesla', lat: 47.5000, lon: 8.5000 },        // nicht bei supercharge.info
  { name: 'Migrol Martigny', betreiber: 'Migrol', lat: 46.1000, lon: 7.0800 },
], [site(46.1003, 7.0803, false), site(46.9502, 7.4401, true), site(48.0001, 9.0001, true, 'CLOSED_PERM'), site(47.6, 8.5, false)]);
pruefe(teslaTest.bleiben.map(p => p.name).join('|') === 'Tesla Supercharger Bern|Tesla Supercharger Neu|Migrol Martigny',
  'Tesla-Filter: ' + teslaTest.bleiben.map(p => p.name).join('|'));

// gleiche Namen unterscheiden
const namen = eindeutigeNamen([
  { name: 'EnBW Pfungstadt', adresse: 'Raststätte Pfungstadt Ost 0, 64319 Pfungstadt, Deutschland' },
  { name: 'EnBW Pfungstadt', adresse: 'Autobahnraststätte Pfungstadt West 0, 64319 Pfungstadt, Deutschland' },
  { name: 'EnBW Pfungstadt', adresse: 'Mainstr. 128, 64319 Pfungstadt, Deutschland' },
  { name: 'Migrol Gossau SG', adresse: 'Herisauerstrasse 2, 9200 Gossau SG, Schweiz' },
]).map(p => p.name).join('|');
pruefe(namen === 'EnBW Pfungstadt (Raststätte Ost)|EnBW Pfungstadt (Raststätte West)|EnBW Pfungstadt (Mainstr.)|Migrol Gossau SG', 'eindeutige Namen: ' + namen);

// E.ON Drive und EWE Go (seit 1.4.0), aber nicht E.ON-Fremde wie „reon“ oder HanseWerk
const { betreiberDE } = require('./hole-bundesdaten.js');
const zuordnung = ['E.ON Drive Infrastructure GmbH', 'E.ON Drive Germany GmbH', 'EWE Go GmbH', 'EWE Go HOCHTIEF Ladepartner GmbH & Co. KG',
  'reon Infrastruktur GmbH & Co. KG', 'HanseWerk AG', 'EnBW mobility+ AG und Co.KG'].map(betreiberDE).join('|');
pruefe(zuordnung === 'E.ON|E.ON|EWE Go|EWE Go|||EnBW', 'Betreiber DE: ' + zuordnung);

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
