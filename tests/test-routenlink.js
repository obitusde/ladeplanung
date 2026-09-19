// Test: Routen aus geteilten Google-Maps-Links (routenpunkteAusUrl_, routenZeileAusPunkten_, routenId_ in apps-script/Code.js).
// Echter Link von Christof (19.09.2026, Morges → Brig-Glis), aufgelöst; die übrigen Fälle sind daraus abgeleitet.
// Aufruf: node tests/test-routenlink.js
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.js'), 'utf8');
const gs = new Function(quelle + '; return { routenpunkteAusUrl_, routenZeileAusPunkten_, routenId_ };')();

let fehler = 0;
const pruefe = (bedingung, text) => { if (!bedingung) { fehler++; console.log('FEHLER ' + text); } };
const wirft = (f, muster) => { try { f(); return false; } catch (e) { return muster.test(e.message); } };

const echt = 'https://www.google.ch/maps/dir/Morges,+1110/Brig-Glis/@46.2999427,7.9716446,14.37z/data=!4m14!4m13!1m5!1m1!1s0x478c3716a68e3d4d:0x10ab18ce1d966327!2m2!1d6.4961301!2d46.5088127!1m5!1m1!1s0x478f692da2ef32ad:0x7ff09dcf2d7ebf74!2m2!1d7.9878208!2d46.3158992!3e0?entry=tts&g_ep=EgoyMDI2MDkxNi4wKgBIAVAD';
const p = gs.routenpunkteAusUrl_(echt);
pruefe(p.length === 2 && p[0].name === 'Morges' && p[1].name === 'Brig-Glis', 'Namen: ' + JSON.stringify(p));
pruefe(p[0].lat === 46.5088127 && p[0].lon === 6.4961301 && p[1].lat === 46.3158992 && p[1].lon === 7.9878208, 'Koordinaten aus data');

const z = gs.routenZeileAusPunkten_(p);
pruefe(z.Name === 'Morges – Brig-Glis' && z.Ort === 'Brig-Glis', 'Name: ' + z.Name);
pruefe(z.Start === '46.5043239,6.4912739', 'Start in Morges → Christofs Startpunkt: ' + z.Start);
pruefe(z.Via === '' && z.Ziel === '46.315899,7.987821', 'Via leer, Ziel: ' + z.Ziel);

// Mit Zwischenziel (Name) und einem Wegpunkt als Koordinate
const via = 'https://www.google.com/maps/dir/Morges,+1110/Landsberg+am+Lech/48.4072,10.95071/Ingolstadt/data=!4m20!1m5!1m1!1s0x1:0x2!2m2!1d6.4961301!2d46.5088127!1m5!1m1!1s0x3:0x4!2m2!1d10.8795!2d48.048!1m0!1m5!1m1!1s0x5:0x6!2m2!1d11.4237!2d48.7651!3e0';
const pv = gs.routenpunkteAusUrl_(via);
pruefe(pv.length === 4 && pv[1].name === 'Landsberg am Lech' && pv[1].lat === 48.048 && pv[2].lat === 48.4072 && pv[2].name === '' && pv[3].lon === 11.4237, 'Via-Zuordnung: ' + JSON.stringify(pv));
const zv = gs.routenZeileAusPunkten_(pv);
pruefe(zv.Via === '48.048,10.8795;48.4072,10.95071' && zv.Name === 'Morges – Ingolstadt (Landsberg am Lech)', 'Via-Zeile: ' + JSON.stringify(zv));

// Start woanders bleibt
pruefe(gs.routenZeileAusPunkten_([{ name: 'Bern', lat: 46.95, lon: 7.44 }, { name: 'Brig', lat: 46.31, lon: 7.98 }]).Start === '46.95,7.44', 'Start außerhalb Morges bleibt');

// Nur Namen (neueres Format ohne Koordinaten) → lat null, Geocoder im Script
const ohne = gs.routenpunkteAusUrl_('https://www.google.com/maps/dir/Morges/Brig/');
pruefe(ohne.length === 2 && ohne[0].lat === null && ohne[1].name === 'Brig', 'ohne Koordinaten: Namen bleiben für den Geocoder');

// Sichtbar scheitern
pruefe(wirft(() => gs.routenpunkteAusUrl_('https://www.google.com/maps/place/Brig/@46.3,7.9,12z'), /kein Routenlink/), 'Ortslink statt Route');
pruefe(wirft(() => gs.routenpunkteAusUrl_('https://www.google.com/maps/dir/Morges/data=!4m2'), /mindestens Start und Ziel/), 'nur ein Punkt');
pruefe(wirft(() => gs.routenpunkteAusUrl_('https://www.google.com/maps/dir//Brig/data=!3e0'), /leer/), '„Mein Standort" leer');
pruefe(wirft(() => gs.routenpunkteAusUrl_('https://www.google.com/maps/dir/Morges/Brig/data=!1d1!2d2!1d3!2d4!1d5!2d6!3e0'), /Finger verschoben/), 'mehr Koordinaten als Wegpunkte');

// Kennungen
pruefe(gs.routenId_('Brig-Glis', []) === 'brig_glis' && gs.routenId_('Zürich', []) === 'zuerich' && gs.routenId_('Genève', []) === 'geneve', 'ids');
pruefe(gs.routenId_('Brig', ['brig', 'brig_2']) === 'brig_3', 'doppelte id bekommt Nummer');

console.log(fehler === 0 ? 'Routenlink: alle Prüfungen bestanden' : fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
