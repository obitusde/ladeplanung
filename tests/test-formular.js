// Test der Formular-Hilfsfunktionen aus apps-script/Code.js (ohne Apps Script).
// Aufruf: node tests/test-formular.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { pruefeFormular_, normalisiereFormular_, naechsteId_, findeDublette_, punktAusExport_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };

// Prüfung
pruefe(gs.pruefeFormular_({ link: 'https://maps.app.goo.gl/abc' }, true) === '', 'gültiger Kurzlink');
pruefe(gs.pruefeFormular_({ link: 'Haiger' }, true) !== '', 'Ortsname statt Link abgelehnt');
pruefe(gs.pruefeFormular_({ link: '' }, true) !== '', 'leerer Link abgelehnt');
pruefe(gs.pruefeFormular_({ id: 'p023', kW: '150', Anzahl: '4', Richtung: 'rueck' }, false) === '', 'gültige Bearbeitung');
pruefe(gs.pruefeFormular_({ id: 'x1' }, false) !== '', 'ungültige id');
pruefe(gs.pruefeFormular_({ id: 'p001', kW: 'viel' }, false) !== '', 'kW keine Zahl');
pruefe(gs.pruefeFormular_({ id: 'p001', kW: '5000' }, false) !== '', 'kW zu groß');
pruefe(gs.pruefeFormular_({ id: 'p001', Anzahl: '2.5' }, false) !== '', 'Anzahl nicht ganzzahlig');
pruefe(gs.pruefeFormular_({ id: 'p001', Richtung: 'links' }, false) !== '', 'unbekannte Richtung');
pruefe(gs.pruefeFormular_(null, false) !== '', 'keine Daten');

// Normalisierung
const n = gs.normalisiereFormular_({ Name: '  EnBW Lorsch ', Betreiber: 'EnBW', kW: '300', Anzahl: '', Richtung: 'beide', Favorit: true, Notiz: '=HYPERLINK("x")' });
pruefe(n.Name === 'EnBW Lorsch' && n.kW === 300 && n.Anzahl === '' && n.Favorit === 'ja', 'Werte: ' + JSON.stringify(n));
pruefe(n.Notiz === "'=HYPERLINK(\"x\")", 'Formel wird als Text markiert: ' + n.Notiz);
pruefe(gs.normalisiereFormular_({ Richtung: 'quer', Favorit: false }).Richtung === 'beide', 'unbekannte Richtung → beide');
pruefe(gs.normalisiereFormular_({ Notiz: 'x'.repeat(900) }).Notiz.length === 500, 'Notiz auf 500 Zeichen begrenzt');

// ids
pruefe(gs.naechsteId_(['p001', 'p047', 'p010', '']) === 'p048', 'nächste id nach p047');
pruefe(gs.naechsteId_([]) === 'p001', 'erste id');
pruefe(gs.naechsteId_(['p999']) === 'p1000', 'vierstellig: ' + gs.naechsteId_(['p999']));

// Dubletten
const bestehende = [
  { id: 'p010', name: 'EnBW Haiger', lat: 50.763184, lon: 8.15571 },
  { id: 'p011', name: 'EnBW Appenweier', lat: 48.56299, lon: 7.955814 },
  { id: 'p099', name: 'ohne Koordinaten', lat: '', lon: '' },
];
const d = gs.findeDublette_(bestehende, 50.76320, 8.15580);
pruefe(d && d.id === 'p010' && d.abstand_m < 25, 'Dublette Haiger erkannt: ' + JSON.stringify(d));
pruefe(gs.findeDublette_(bestehende, 48.562915, 7.959093) === null, 'Gegenseite Appenweier (~240 m) keine Dublette');

// Rückmeldung aus dem Export
const json = {
  routen: [{ id: 'neuenrade', name: 'Morges – Neuenrade' }],
  punkte: [{ id: 'p023', name: 'EnBW Ladestation Lorsch', adresse: 'Lorsch', betreiber: 'EnBW', zuordnung: [{ route: 'neuenrade', km: 468.34, quer_km: 4.2, strasse: 'A 5', raststaette: false }] }],
};
const r = gs.punktAusExport_(json, 'p023');
pruefe(r.zuordnung[0].route === 'Morges – Neuenrade' && r.zuordnung[0].km === 468 && r.zuordnung[0].strasse === 'A 5', 'Rückmeldung: ' + JSON.stringify(r));
pruefe(gs.punktAusExport_(json, 'p999') === null && gs.punktAusExport_(null, 'p023') === null, 'unbekannt/ohne Export → null');

console.log(fehler === 0 ? 'Alle Prüfungen bestanden.' : fehler + ' Prüfungen fehlgeschlagen.');
process.exit(fehler === 0 ? 0 : 1);
