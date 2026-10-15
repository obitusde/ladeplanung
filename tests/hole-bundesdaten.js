// Ladestationen aus amtlichen Registern → fremde.json
// Version 1.2.0 (15.10.2026) — Tesla nur, wo auch andere Autos laden dürfen (supercharge.info „otherEVs"); Anlass:
//                              Martigny ist nur für Teslas (Christof).
// Version 1.1.0 (14.10.2026) — zusätzlich Deutschland (Ladesäulenregister der Bundesnetzagentur: EnBW mobility+ und
//                              Tesla Germany) und AMAG in der Schweiz.
// Version 1.0.0 (14.10.2026) — Schweiz (BFE, ich-tanke-strom.ch): Migrol und Tesla ab 100 kW, je Standort zusammengefasst.
//
// Aufruf: node tests/hole-bundesdaten.js                                  (lädt alle Quellen aus dem Netz)
//         node tests/hole-bundesdaten.js ch.json[.gz] de.csv [sc.json]    (lokale Dateien)
// Läuft monatlich als GitHub Action (.github/workflows/bundesdaten.yml).
// In der App erscheinen diese Stationen nur bei „Route ab hier", gestrichelt mit „nicht in deiner Liste".
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CH_URL = 'https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/oicp/ch.bfe.ladestellen-elektromobilitaet.json';
const DE_SEITE = 'https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/start.html';
const SC_URL = 'https://supercharge.info/service/supercharge/allSites';
const MIN_KW = 100;
const SC_ZUORDNUNG_M = 500;   // Tesla-Standort und Eintrag bei supercharge.info: höchstens so weit auseinander
const STANDORT_M = 80;   // Ladepunkte eines Betreibers bis 80 m auseinander = ein Standort
const KENNUNG = 'ladeplanung (github.com/obitusde/ladeplanung)';

// ---------------------------------------------------------------------------
// Gemeinsam
// ---------------------------------------------------------------------------

function abstandM(a, b) {
  const fx = 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot((a.lat - b.lat) * 110574, (a.lon - b.lon) * fx);
}

/** Sammelt Ladepunkte zu Standorten (gleicher Betreiber, ≤ 80 m) – mit Raster, damit 10 000 Zeilen schnell gehen. */
function sammler() {
  const raster = new Map();
  const alle = [];
  const zelle = (lat, lon) => Math.round(lat * 100) + ',' + Math.round(lon * 100);
  return {
    alle,
    hinzu(betreiber, lat, lon, kw, anzahl, neu) {
      const zl = Math.round(lat * 100), zo = Math.round(lon * 100);
      let s = null;
      for (let a = -1; a <= 1 && !s; a++) for (let b = -1; b <= 1 && !s; b++) {
        for (const x of raster.get((zl + a) + ',' + (zo + b)) || []) {
          if (x.betreiber === betreiber && abstandM(x, { lat, lon }) <= STANDORT_M) { s = x; break; }
        }
      }
      if (!s) {
        s = Object.assign({ betreiber, lat, lon, kw: 0, anzahl: 0 }, neu());
        const k = zelle(lat, lon);
        if (!raster.has(k)) raster.set(k, []);
        raster.get(k).push(s);
        alle.push(s);
      }
      s.anzahl += anzahl;
      s.kw = Math.max(s.kw, kw);
    },
  };
}

function alsPunkte(standorte, praefix) {
  return standorte
    .filter(s => s.kw >= MIN_KW)
    .map(s => ({
      id: praefix + '-' + s.lat.toFixed(4) + '-' + s.lon.toFixed(4),
      name: s.name, betreiber: s.betreiber, lat: Number(s.lat.toFixed(6)), lon: Number(s.lon.toFixed(6)),
      kw: Math.round(s.kw), anzahl: s.anzahl, adresse: s.adresse,
    }))
    .sort((x, y) => x.betreiber.localeCompare(y.betreiber) || x.name.localeCompare(y.name, 'de'));
}

const sauber = t => String(t || '').replace(/\s+/g, ' ').trim();
const adresse = (strasse, plz, ort, land) => [sauber(strasse), sauber([plz, ort].filter(Boolean).join(' ')), land].filter(Boolean).join(', ');

// ---------------------------------------------------------------------------
// Schweiz: BFE (OICP-JSON)
// ---------------------------------------------------------------------------

/** Betreiber für die App oder null: Migrol (beim Bund unter „M-Charge"), AMAG (Name), Tesla (Betreiber). */
function betreiberVon(operatorName, name) {
  if (/migrol/i.test(name)) return 'Migrol';
  if (/\bamag\b/i.test(name)) return 'AMAG';
  if (/^tesla$/i.test(String(operatorName || '').trim())) return 'Tesla';
  return null;
}

/** „Migrol | Gossau SG 1" → „Migrol Gossau SG"; Tesla ohne Namen → „Tesla Supercharger <Ort>". */
function standortName(betreiber, name, ort) {
  if (betreiber === 'Tesla') return 'Tesla Supercharger ' + sauber(ort);
  return String(name).replace(/\s*\|\s*/g, ' ').replace(/\s+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
}

function auswerten(bund) {
  const s = sammler();
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
      s.hinzu(betreiber, lat, lon, kw, 1, () => ({ name: standortName(betreiber, name, a.City), adresse: adresse(a.Street, a.PostalCode, a.City, 'Schweiz') }));
    }
  }
  return alsPunkte(s.alle, 'bfe');
}

// ---------------------------------------------------------------------------
// Deutschland: Ladesäulenregister der Bundesnetzagentur (CSV, Semikolon, Kopfzeilen vor der Tabelle)
// Nur EnBW mobility+ und Tesla Germany (Christof, 14.10.2026): ohne Tesla-Werk Grünheide und regionale EnBW-Töchter.
// ---------------------------------------------------------------------------

function betreiberDE(name) {
  const n = sauber(name);
  if (/^EnBW mobility\+/i.test(n)) return 'EnBW';
  if (/^Tesla Germany GmbH$/i.test(n)) return 'Tesla';
  return null;
}

/** Neuester CSV-Link auf der Seite der Bundesnetzagentur (der Dateiname enthält das Datum). */
function neuesterCsvLink(html) {
  const treffer = [...String(html).matchAll(/https:\/\/data\.bundesnetzagentur\.de\/[^"'\s]*Ladesaeulenregister_BNetzA_(\d{4}-\d{2}-\d{2})\.csv/g)];
  if (!treffer.length) return null;
  treffer.sort((a, b) => b[1].localeCompare(a[1]));
  return { url: treffer[0][0], stand: treffer[0][1] };
}

/** CSV mit Semikolon; Felder in Anführungszeichen dürfen ; und Zeilenumbrüche enthalten. */
function zerlegeCsv(text) {
  const zeilen = [];
  let feld = '', zeile = [], inZitat = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inZitat) {
      if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inZitat = false; }
      else feld += c;
    } else if (c === '"') inZitat = true;
    else if (c === ';') { zeile.push(feld); feld = ''; }
    else if (c === '\n') { zeile.push(feld.replace(/\r$/, '')); zeilen.push(zeile); zeile = []; feld = ''; }
    else feld += c;
  }
  if (feld !== '' || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  return zeilen;
}

const zahlDE = s => { const t = String(s || '').trim(); return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); };

function auswertenDE(text) {
  const zeilen = zerlegeCsv(String(text).replace(/^﻿/, ''));
  const k = zeilen.findIndex(z => z[0] === 'Ladeeinrichtungs-ID');
  if (k < 0) throw new Error('Kopfzeile „Ladeeinrichtungs-ID" nicht gefunden – Format geändert?');
  const kopf = zeilen[k].map(sauber);
  const sp = n => { const i = kopf.indexOf(n); if (i < 0) throw new Error('Spalte „' + n + '" fehlt'); return i; };
  const i = {
    betreiber: sp('Betreiber'), name: sp('Anzeigename (Karte)'), status: sp('Status'), anzahl: sp('Anzahl Ladepunkte'),
    kw: sp('Nennleistung Ladeeinrichtung [kW]'), strasse: sp('Straße'), nr: sp('Hausnummer'), plz: sp('Postleitzahl'),
    ort: sp('Ort'), lat: sp('Breitengrad'), lon: sp('Längengrad'),
  };
  const s = sammler();
  for (const f of zeilen.slice(k + 1)) {
    if (f.length < kopf.length - 5) continue;
    const betreiber = betreiberDE(f[i.betreiber]);
    if (!betreiber || !/in betrieb/i.test(f[i.status])) continue;
    const lat = zahlDE(f[i.lat]), lon = zahlDE(f[i.lon]);
    if (!(lat > 47 && lat < 55.2 && lon > 5.8 && lon < 15.1)) continue;
    const ort = sauber(f[i.ort]);
    s.hinzu(betreiber, lat, lon, zahlDE(f[i.kw]) || 0, zahlDE(f[i.anzahl]) || 1, () => ({
      name: sauber(f[i.name]) || (betreiber === 'Tesla' ? 'Tesla Supercharger ' : 'EnBW ') + ort,
      adresse: adresse(sauber(f[i.strasse]) + (f[i.nr] ? ' ' + sauber(f[i.nr]) : ''), f[i.plz], ort, 'Deutschland'),
    }));
  }
  return alsPunkte(s.alle, 'bnetza');
}

// ---------------------------------------------------------------------------
// Tesla: nur Supercharger, die für andere Autos offen sind (supercharge.info, Feld otherEVs)
// ---------------------------------------------------------------------------

/** Entfernt Tesla-Standorte, die laut supercharge.info nur für Teslas sind oder dauerhaft geschlossen; ohne Eintrag bleiben sie. */
function nurOffeneTesla(punkte, sites) {
  const raster = new Map();
  for (const s of sites) {
    if (!s.gps) continue;
    const k = Math.round(s.gps.latitude * 100) + ',' + Math.round(s.gps.longitude * 100);
    if (!raster.has(k)) raster.set(k, []);
    raster.get(k).push(s);
  }
  const entfernt = [];
  const bleiben = punkte.filter(p => {
    if (p.betreiber !== 'Tesla') return true;
    let best = null, bd = Infinity;
    const zl = Math.round(p.lat * 100), zo = Math.round(p.lon * 100);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const s of raster.get((zl + a) + ',' + (zo + b)) || []) {
        const d = abstandM(p, { lat: s.gps.latitude, lon: s.gps.longitude });
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (!best || bd > SC_ZUORDNUNG_M) return true;
    if (best.otherEVs === false || best.status === 'CLOSED_PERM') { entfernt.push(p.name + (best.otherEVs === false ? ' (nur Tesla)' : ' (geschlossen)')); return false; }
    return true;
  });
  return { bleiben, entfernt };
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

function alsText(puffer) {
  return (puffer[0] === 0x1f && puffer[1] === 0x8b ? zlib.gunzipSync(puffer) : puffer).toString('utf8');
}

async function lade(url) {
  const antwort = await fetch(url, { headers: { 'User-Agent': KENNUNG } });
  if (!antwort.ok) throw new Error(url + ': HTTP ' + antwort.status);
  return Buffer.from(await antwort.arrayBuffer());
}

async function main() {
  const [chDatei, deDatei] = process.argv.slice(2);
  const ch = auswerten(JSON.parse(alsText(chDatei ? fs.readFileSync(chDatei) : await lade(CH_URL))));
  if (ch.length < 20) throw new Error('Schweiz: nur ' + ch.length + ' Standorte – Datenformat geändert? fremde.json bleibt unverändert');

  let deStand = '', deText;
  if (deDatei) deText = fs.readFileSync(deDatei, 'utf8');
  else {
    const link = neuesterCsvLink((await lade(DE_SEITE)).toString('utf8'));
    if (!link) throw new Error('Deutschland: kein CSV-Link auf der Seite der Bundesnetzagentur – Seite geändert?');
    deStand = link.stand;
    deText = (await lade(link.url)).toString('utf8');
  }
  const de = auswertenDE(deText);
  if (de.length < 500) throw new Error('Deutschland: nur ' + de.length + ' Standorte – Datenformat geändert? fremde.json bleibt unverändert');

  const scDatei = process.argv[4];
  const sites = JSON.parse(alsText(scDatei ? fs.readFileSync(scDatei) : await lade(SC_URL)));
  if (!Array.isArray(sites) || sites.length < 1000) throw new Error('supercharge.info: unerwartete Antwort – fremde.json bleibt unverändert');
  const tesla = nurOffeneTesla(ch.concat(de), sites);
  const punkte = tesla.bleiben;
  if (tesla.entfernt.length) console.log('Tesla ohne Fremdfahrzeuge/geschlossen, weggelassen: ' + tesla.entfernt.join(', '));
  const ziel = path.join(__dirname, '..', 'fremde.json');
  let alt = null;
  try { alt = JSON.parse(fs.readFileSync(ziel, 'utf8')); } catch (e) { /* erste Fassung */ }
  const gleich = alt && JSON.stringify(alt.punkte) === JSON.stringify(punkte);
  const stand = gleich ? alt.stand : new Date().toISOString().slice(0, 10);
  const quellen = { CH: 'BFE, ich-tanke-strom.ch', DE: 'Bundesnetzagentur, Ladesäulenregister' + (deStand ? ' vom ' + deStand : ''),
    Tesla: 'supercharge.info (nur offen für andere Autos)' };
  // Ein Punkt je Zeile: lesbar im Diff, aber deutlich kleiner als eingerückt (≈ 2000 Standorte)
  const text = '{"version":2,"stand":' + JSON.stringify(stand) + ',"min_kw":' + MIN_KW + ',"quellen":' + JSON.stringify(quellen) +
    ',"punkte":[\n' + punkte.map(p => JSON.stringify(p)).join(',\n') + '\n]}\n';
  fs.writeFileSync(ziel, text);
  const z = {};
  punkte.forEach(p => { const k = (p.id.startsWith('bfe') ? 'CH ' : 'DE ') + p.betreiber; z[k] = (z[k] || 0) + 1; });
  console.log('fremde.json: ' + punkte.length + ' Standorte ' + JSON.stringify(z) + (gleich ? ' (unverändert)' : ' (neu, Stand ' + stand + ')'));
}

module.exports = { auswerten, auswertenDE, standortName, betreiberVon, betreiberDE, neuesterCsvLink, zerlegeCsv, nurOffeneTesla };
if (require.main === module) main().catch(e => { console.error('Fehler: ' + e.message); process.exit(1); });
