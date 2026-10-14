// Ladestationen aus den Bundesdaten (BFE, ich-tanke-strom.ch) → fremde.json
// Version 1.0.0 (14.10.2026) — Migrol und Tesla in der Schweiz ab 100 kW, je Standort zusammengefasst.
//
// Aufruf: node tests/hole-bundesdaten.js            (lädt die aktuelle Datei vom Bund)
//         node tests/hole-bundesdaten.js datei.json  (lokale Datei, auch gzip)
// Läuft monatlich als GitHub Action (.github/workflows/bundesdaten.yml).
// In der App erscheinen diese Stationen nur bei „Route ab hier", gestrichelt mit „nicht in deiner Liste".
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const QUELLE_URL = 'https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/oicp/ch.bfe.ladestellen-elektromobilitaet.json';
const MIN_KW = 100;
const STANDORT_M = 80;   // Ladepunkte eines Betreibers bis 80 m auseinander = ein Standort

/** Betreiber für die App oder null: nur Migrol (Name, läuft beim Bund unter „M-Charge") und Tesla. */
function betreiberVon(operatorName, name) {
  if (/migrol/i.test(name)) return 'Migrol';
  if (/^tesla$/i.test(String(operatorName || '').trim())) return 'Tesla';
  return null;
}

function abstandM(a, b) {
  const fx = 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot((a.lat - b.lat) * 110574, (a.lon - b.lon) * fx);
}

/** „Migrol | Gossau SG 1" → „Migrol Gossau SG"; Tesla ohne Namen → „Tesla Supercharger <Ort>". */
function standortName(betreiber, name, ort) {
  if (betreiber === 'Tesla') return 'Tesla Supercharger ' + (ort || '').trim();
  return String(name).replace(/\s*\|\s*/g, ' ').replace(/\s+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
}

/** Bundesdaten (OICP-JSON) → Liste der Standorte. Rein rechnerisch. */
function auswerten(bund) {
  const standorte = [];
  for (const block of bund.EVSEData || []) {
    for (const r of [].concat(block.EVSEDataRecord || [])) {
      const namen = [].concat(r.ChargingStationNames || []);
      const name = String((namen.find(n => n && n.lang === 'de') || namen[0] || {}).value || '').trim();
      const betreiber = betreiberVon(block.OperatorName, name);
      if (!betreiber) continue;
      const [lat, lon] = String(r.GeoCoordinates && r.GeoCoordinates.Google || '').trim().split(/\s+/).map(Number);
      if (!(lat > 45 && lat < 48.5 && lon > 5.5 && lon < 11)) continue;
      const kw = Math.max(0, ...[].concat(r.ChargingFacilities || []).map(f => Number(f && f.power) || 0));
      const a = r.Address || {};
      let s = standorte.find(x => x.betreiber === betreiber && abstandM(x, { lat, lon }) <= STANDORT_M);
      if (!s) {
        s = { betreiber, lat, lon, kw: 0, anzahl: 0, name: standortName(betreiber, name, a.City),
          adresse: [String(a.Street || ''), [a.PostalCode, a.City].filter(Boolean).join(' '), 'Schweiz']
            .map(t => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ') };
        standorte.push(s);
      }
      s.anzahl++;
      s.kw = Math.max(s.kw, kw);
    }
  }
  return standorte
    .filter(s => s.kw >= MIN_KW)
    .map(s => ({
      id: 'bfe-' + s.lat.toFixed(4) + '-' + s.lon.toFixed(4),
      name: s.name, betreiber: s.betreiber, lat: Number(s.lat.toFixed(6)), lon: Number(s.lon.toFixed(6)),
      kw: Math.round(s.kw), anzahl: s.anzahl, adresse: s.adresse,
    }))
    .sort((x, y) => x.betreiber.localeCompare(y.betreiber) || x.name.localeCompare(y.name, 'de'));
}

function alsJson(puffer) {
  const roh = puffer[0] === 0x1f && puffer[1] === 0x8b ? zlib.gunzipSync(puffer) : puffer;
  return JSON.parse(roh.toString('utf8'));
}

async function main() {
  const datei = process.argv[2];
  let puffer;
  if (datei) puffer = fs.readFileSync(datei);
  else {
    const antwort = await fetch(QUELLE_URL, { headers: { 'User-Agent': 'ladeplanung (github.com/obitusde/ladeplanung)' } });
    if (!antwort.ok) throw new Error('Bundesdaten HTTP ' + antwort.status);
    puffer = Buffer.from(await antwort.arrayBuffer());
  }
  const punkte = auswerten(alsJson(puffer));
  if (punkte.length < 20) throw new Error('nur ' + punkte.length + ' Standorte gefunden – Datenformat geändert? fremde.json bleibt unverändert');
  const ziel = path.join(__dirname, '..', 'fremde.json');
  const neu = { version: 1, quelle: 'BFE, ich-tanke-strom.ch', min_kw: MIN_KW, punkte };
  // „stand" nur ändern, wenn sich die Stationen geändert haben – sonst kein Commit
  let alt = null;
  try { alt = JSON.parse(fs.readFileSync(ziel, 'utf8')); } catch (e) { /* erste Fassung */ }
  const gleich = alt && JSON.stringify(alt.punkte) === JSON.stringify(punkte);
  neu.stand = gleich ? alt.stand : new Date().toISOString().slice(0, 10);
  fs.writeFileSync(ziel, JSON.stringify({ version: neu.version, stand: neu.stand, quelle: neu.quelle, min_kw: neu.min_kw, punkte }, null, 1) + '\n');
  const z = {};
  punkte.forEach(p => { z[p.betreiber] = (z[p.betreiber] || 0) + 1; });
  console.log('fremde.json: ' + punkte.length + ' Standorte ' + JSON.stringify(z) + (gleich ? ' (unverändert)' : ' (neu, Stand ' + neu.stand + ')'));
}

module.exports = { auswerten, standortName, betreiberVon };
if (require.main === module) main().catch(e => { console.error('Fehler: ' + e.message); process.exit(1); });
