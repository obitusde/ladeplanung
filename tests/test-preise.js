// Test der Ladepreis-Hilfen aus apps-script/Code.js (preisFrage_, preisAntwortLesen_) und der Datei preise.json.
// Aufruf: node tests/test-preise.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { preisFrage_, preisAntwortLesen_, ortAusText_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const wirft = f => { try { f(); return false; } catch (e) { return true; } };

// preise.json: Aufbau und plausible Werte
const preise = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'preise.json'), 'utf8'));
pruefe(/^\d{4}-\d{2}-\d{2}$/.test(preise.stand), 'Stand als Datum');
for (const a of preise.anbieter) {
  pruefe(a.betreiber && ['CH', 'DE', 'AT', 'IT'].includes(a.land) && ['CHF', 'EUR'].includes(a.waehrung), 'Eintrag ' + JSON.stringify(a).slice(0, 60));
  for (const t of a.tarife) pruefe(t.kwh >= 0.05 && t.kwh <= 2 && (!t.kwh_bis || t.kwh_bis > t.kwh), 'Tarif ' + a.betreiber + ' ' + t.name);
}
const enbw = preise.anbieter.find(a => a.betreiber === 'EnBW');
pruefe(enbw && enbw.tarife.map(t => t.name).join() === 'S,M,L', 'EnBW nur S, M, L');

// Frage an das Modell
const frage = gs.preisFrage_(enbw);
pruefe(/Deutschland/.test(frage) && /S, M und L/.test(frage) && /kein Roaming/.test(frage) && /enbw\.com/.test(frage), 'Frage EnBW');
const frageTesla = gs.preisFrage_({ betreiber: 'Tesla', land: 'CH', waehrung: 'CHF', tarife: [] });
pruefe(/Fremdfahrzeuge/.test(frageTesla) && /ohne Mitgliedschaft/.test(frageTesla), 'Frage Tesla');
pruefe(/Porsche/.test(gs.preisFrage_(preise.anbieter.find(a => a.betreiber === 'AMAG'))), 'Frage AMAG mit Porsche');
pruefe(preise.anbieter.every(a => a.app && /^https:\/\/play\.google\.com\/store\/apps\/details\?id=/.test(a.app.url)), 'App-Link je Anbieter');
pruefe(!preise.anbieter.some(a => a.betreiber === 'Tesla' && a.tarife.length !== 1), 'Tesla nur Fremdfahrzeug');

// Antwort lesen
const a = gs.preisAntwortLesen_('Hier: ```json\n{"tarife":[{"name":"S","kwh":"0.56","grund_monat":0},{"name":"L","kwh":0.39,"grund_monat":11.99,"kwh_bis":0.2}],"hinweis":"x","quelle":"https://enbw.com","sicher":true}\n```');
pruefe(a.tarife.length === 2 && a.tarife[0].kwh === 0.56 && a.tarife[1].grund_monat === 11.99 && a.tarife[1].kwh_bis === undefined && a.sicher, 'Antwort gelesen: ' + JSON.stringify(a));
pruefe(gs.preisAntwortLesen_('{"tarife":[],"sicher":false}').sicher === false, 'unsicher');
pruefe(wirft(() => gs.preisAntwortLesen_('keine Ahnung')), 'ohne JSON → Fehler');
pruefe(wirft(() => gs.preisAntwortLesen_('{"tarife":[{"name":"S","kwh":56}]}')), 'Cent statt Euro → Fehler');

// Ort aus Adresse (Routen-Link)
pruefe(gs.ortAusText_('Dahler Str. 6b, 58809 Neuenrade') === 'Neuenrade', 'Neuenrade');
pruefe(gs.ortAusText_('Markomannenstraße 2a, 85055 Ingolstadt, Deutschland') === 'Ingolstadt', 'Ingolstadt');
pruefe(gs.ortAusText_('Morges, 1110') === 'Morges' && gs.ortAusText_('Brig-Glis') === 'Brig-Glis', 'Morges / Brig-Glis');
pruefe(gs.ortAusText_('Via Maestri d\'ascia, 24, 17019 Savona SV, Italien') === 'Savona', 'Savona ohne Provinzkürzel');

console.log(fehler === 0 ? 'Preise: alle Prüfungen bestanden' : fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
