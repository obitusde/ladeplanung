/**
 * Ladeplanung Cupra Born — Apps Script, an das Sheet „Ladestationen" gebunden.
 *
 * Version 0.4.0 — Etappe 4/5: berechneRouten() mit Kumulierung, Ausdünnung, Rundung.
 * Version 0.3.0 — Etappe 3: aufloeseLinks().
 * Version 0.2.0 — Etappe 2: setup() und Menü.
 *
 * Grundlage: Umsetzungsbrief v5.0, Stufe 1.
 */

const VERSION = '0.4.0';

const BLATT_PUNKTE = 'Ladepunkte';
const BLATT_ROUTEN = 'Routen';
const BLATT_SICHERUNG = 'Alt-Import (Sicherung)';

const SPALTEN_PUNKTE = ['id', 'Maps-Link', 'Name', 'Adresse', 'Lat', 'Lon', 'Betreiber', 'kW', 'Anzahl', 'Richtung', 'Favorit', 'Notiz', 'Status'];
const SPALTEN_ROUTEN = ['id', 'Name', 'Start', 'Via', 'Ziel', 'Länge km', 'Fahrzeit', 'Stand'];

const RICHTUNGEN = ['hin', 'rueck', 'beide'];

// Start aller Stammstrecken: Koordinate aus Christofs geteiltem Routenlink (Brief, Stufe 2).
const START_MORGES = '46.5043239,6.4912739';

// Zeilen für das Blatt „Routen": id, Name, Start, Via, Ziel.
// Via-Punkte werden in Etappe 4 anhand der aufgelösten Ladepunkte gesetzt.
const STAMMSTRECKEN = [
  ['neuenrade', 'Morges – Neuenrade', START_MORGES, '', '51.2847342,7.7950369'],
  ['ingolstadt', 'Morges – Ingolstadt', START_MORGES, '', '48.7650800,11.4237200'],
  ['savona', 'Morges – Savona', START_MORGES, '', '44.3090500,8.4771500'],
];

// ---------------------------------------------------------------------------
// Menü
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ladeplanung')
    .addItem('Links auflösen', 'aufloeseLinks')
    .addItem('Routen berechnen (geänderte)', 'berechneRouten')
    .addItem('Routen neu berechnen (alle)', 'berechneRoutenNeu')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Zugänge')
      .addItem('ORS-Schlüssel hinterlegen', 'orsSchluesselHinterlegen')
      .addItem('GitHub-Token hinterlegen', 'githubTokenHinterlegen'))
    .addItem('Setup (Blätter anlegen)', 'setup')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Zugänge — Geheimnisse per Eingabedialog in die Script Properties, nie ins Sheet.
// ---------------------------------------------------------------------------

function orsSchluesselHinterlegen() { hinterlegeGeheimnis_('ORS_API_KEY', 'OpenRouteService-Schlüssel'); }
function githubTokenHinterlegen() { hinterlegeGeheimnis_('GITHUB_TOKEN', 'GitHub-Token'); }

function hinterlegeGeheimnis_(schluessel, bezeichnung) {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const hinweis = props.getProperty(schluessel) ? 'Es ist bereits ein Wert hinterlegt — ein neuer ersetzt ihn.\n\n' : '';
  const antwort = ui.prompt(bezeichnung + ' hinterlegen',
    hinweis + 'Wert einfügen. Er wird nur in den Script Properties gespeichert, nicht im Sheet und nicht im Repo.',
    ui.ButtonSet.OK_CANCEL);
  if (antwort.getSelectedButton() !== ui.Button.OK) return;

  const wert = antwort.getResponseText().trim();
  if (!wert) { ui.alert('Kein Wert eingegeben — nichts geändert.'); return; }
  props.setProperty(schluessel, wert);
  ui.alert(bezeichnung + ' gespeichert (' + wert.length + ' Zeichen).');
}

// ---------------------------------------------------------------------------
// setup() — legt beide Blätter an, übernimmt das alte Blatt einmalig. Idempotent.
// ---------------------------------------------------------------------------

function setup() {
  const ss = SpreadsheetApp.getActive();
  const meldungen = [];

  const punkte = blattMitKoepfen_(ss, BLATT_PUNKTE, SPALTEN_PUNKTE, meldungen);
  const routen = blattMitKoepfen_(ss, BLATT_ROUTEN, SPALTEN_ROUTEN, meldungen);

  // Ladepunkte: nur befüllen, solange das Blatt noch keine Datenzeilen hat.
  if (punkte.getLastRow() < 2) {
    const anzahl = importiereAltblatt_(ss, punkte);
    if (anzahl > 0) {
      meldungen.push(anzahl + ' Ladepunkte aus dem alten Blatt übernommen, altes Blatt heißt jetzt „' + BLATT_SICHERUNG + '".');
    } else {
      punkte.appendRow(['p001', '', 'Beispiel – Zeile löschen oder überschreiben', '', '', '', 'Ionity', 350, 6, 'beide', '', 'Coop, McDonald\'s', '']);
      meldungen.push('Beispielzeile in „' + BLATT_PUNKTE + '" angelegt.');
    }
  }

  // Routen: die drei Stammstrecken, nur wenn das Blatt noch leer ist.
  if (routen.getLastRow() < 2) {
    routen.getRange(2, 1, STAMMSTRECKEN.length, STAMMSTRECKEN[0].length).setValues(STAMMSTRECKEN);
    meldungen.push('Drei Stammstrecken in „' + BLATT_ROUTEN + '" eingetragen.');
  }

  setzeValidierungen_(punkte);

  if (meldungen.length === 0) meldungen.push('Alles war schon eingerichtet — nichts geändert.');
  SpreadsheetApp.getUi().alert('Setup v' + VERSION, meldungen.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Holt oder erzeugt ein Blatt und setzt die Spaltenköpfe.
 * Bestehende, abweichende Köpfe werden nicht überschrieben, nur gemeldet.
 */
function blattMitKoepfen_(ss, name, koepfe, meldungen) {
  let blatt = ss.getSheetByName(name);
  if (!blatt) {
    blatt = ss.insertSheet(name);
    meldungen.push('Blatt „' + name + '" angelegt.');
  }

  const vorhanden = blatt.getRange(1, 1, 1, koepfe.length).getValues()[0];
  const leer = vorhanden.every(function (w) { return w === ''; });
  const gleich = vorhanden.every(function (w, i) { return w === koepfe[i]; });

  if (leer) {
    blatt.getRange(1, 1, 1, koepfe.length).setValues([koepfe]).setFontWeight('bold');
    blatt.setFrozenRows(1);
  } else if (!gleich) {
    meldungen.push('Achtung: Spaltenköpfe in „' + name + '" weichen ab — nicht verändert.');
  }
  return blatt;
}

/**
 * Sucht ein Blatt mit Maps-Links in Spalte A (das ursprüngliche Blatt ohne Köpfe)
 * und übernimmt dessen Zeilen: A → Maps-Link, B → Notiz, C → Richtung.
 * Leerzeilen fallen weg. Das Blatt bleibt als Sicherung erhalten.
 * Gibt die Zahl der übernommenen Zeilen zurück.
 */
function importiereAltblatt_(ss, punkte) {
  const kandidaten = ss.getSheets().filter(function (b) {
    return [BLATT_PUNKTE, BLATT_ROUTEN, BLATT_SICHERUNG].indexOf(b.getName()) === -1;
  });

  for (let k = 0; k < kandidaten.length; k++) {
    const blatt = kandidaten[k];
    if (blatt.getLastRow() === 0) continue;

    const werte = blatt.getRange(1, 1, blatt.getLastRow(), Math.max(3, blatt.getLastColumn())).getValues();
    const zeilen = [];

    werte.forEach(function (w) {
      const link = String(w[0]).trim();
      if (!istMapsLink_(link)) return;
      const nr = zeilen.length + 1;
      const id = 'p' + ('00' + nr).slice(-3);
      const richtungText = String(w[2]).trim();
      const richtung = richtungAusAltText_(richtungText);
      const status = (richtungText && richtung === 'beide') ? 'Richtung unklar: ' + richtungText : '';
      zeilen.push([id, link, '', '', '', '', '', '', '', richtung, '', String(w[1]).trim(), status]);
    });

    if (zeilen.length === 0) continue;

    punkte.getRange(2, 1, zeilen.length, SPALTEN_PUNKTE.length).setValues(zeilen);
    if (!ss.getSheetByName(BLATT_SICHERUNG)) blatt.setName(BLATT_SICHERUNG);
    return zeilen.length;
  }
  return 0;
}

function istMapsLink_(text) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(text);
}

/**
 * Übersetzt die alte Fahrtrichtungs-Angabe:
 * „Morges-Neuenrade" → hin (Fahrt ab Morges), „Neuenrade-Morges" → rueck, sonst beide.
 */
function richtungAusAltText_(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, '').replace(/–/g, '-');
  if (/^morges-/.test(t)) return 'hin';
  if (/-morges$/.test(t)) return 'rueck';
  return 'beide';
}

// ---------------------------------------------------------------------------
// aufloeseLinks() — ergänzt Name, Adresse, Koordinaten und Betreiber aus dem Maps-Link.
// Gefüllte Felder bleiben unangetastet, die Spalte „Notiz" wird nie gelesen oder geschrieben.
// ---------------------------------------------------------------------------

// Teilstring im Maps-Namen (klein geschrieben) → Betreiber. Erster Treffer gewinnt.
const BETREIBER_MUSTER = [
  ['enbw', 'EnBW'], ['ionity', 'Ionity'], ['tesla', 'Tesla'], ['amag', 'AMAG'], ['porsche', 'Porsche'],
  ['fastned', 'Fastned'], ['allego', 'Allego'], ['aral', 'Aral pulse'], ['shell', 'Shell Recharge'],
  ['gofast', 'GOFAST'], ['swisscharge', 'Swisscharge'], ['electra', 'Electra'], ['atlante', 'Atlante'],
  ['free to x', 'Free To X'], ['ewiva', 'Ewiva'], ['be charge', 'Be Charge'], ['e.on', 'E.ON'],
  ['totalenergies', 'TotalEnergies'], ['lidl', 'Lidl'], ['kaufland', 'Kaufland'],
];

const STATUS_FEHLER_PRAEFIX = 'nicht auflösbar';
const MAX_LAUFZEIT_MS = 5 * 60 * 1000; // Reserve zur Sechs-Minuten-Grenze

function aufloeseLinks() {
  const ui = SpreadsheetApp.getUi();
  const blatt = SpreadsheetApp.getActive().getSheetByName(BLATT_PUNKTE);
  if (!blatt || blatt.getLastRow() < 2) {
    ui.alert('Links auflösen', 'Blatt „' + BLATT_PUNKTE + '" fehlt oder ist leer — zuerst Setup ausführen.', ui.ButtonSet.OK);
    return;
  }

  const sp = spaltenIndex_(blatt);
  const werte = blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues();
  const start = Date.now();
  const bilanz = { ergaenzt: 0, fehler: 0, vollstaendig: 0, abgebrochen: false };

  for (let i = 0; i < werte.length; i++) {
    if (Date.now() - start > MAX_LAUFZEIT_MS) { bilanz.abgebrochen = true; break; }

    const z = werte[i];
    const zeile = i + 2;
    const feld = function (name) { return z[sp[name] - 1]; };
    const setze = function (name, wert) { blatt.getRange(zeile, sp[name]).setValue(wert); };

    const link = String(feld('Maps-Link')).trim();
    if (!link) continue;

    const fehltName = feld('Name') === '';
    const fehltKoord = feld('Lat') === '' || feld('Lon') === '';
    const fehltAdresse = feld('Adresse') === '';
    const fehltBetreiber = feld('Betreiber') === '';
    if (!fehltName && !fehltKoord && !fehltAdresse && !fehltBetreiber) { bilanz.vollstaendig++; continue; }

    try {
      let lat = feld('Lat');
      let lon = feld('Lon');
      let linkName = '';

      if (fehltName || fehltKoord) {
        const info = werteMapsUrlAus_(folgeWeiterleitungen_(link));
        if (info.lat === null) throw new Error('keine Koordinaten im Link gefunden');
        linkName = info.name;
        if (fehltKoord) {
          lat = runde_(info.lat, 6);
          lon = runde_(info.lon, 6);
          setze('Lat', lat);
          setze('Lon', lon);
        }
      }

      let ort = '';
      if (fehltAdresse || fehltName) {
        const geo = adresseZuKoordinate_(Number(lat), Number(lon));
        ort = geo.ort;
        if (fehltAdresse && geo.adresse) setze('Adresse', geo.adresse);
      }

      const name = fehltName ? nameMitOrt_(linkName || 'Ladepunkt', ort) : feld('Name');
      if (fehltName) setze('Name', name);

      if (fehltBetreiber) {
        const betreiber = betreiberAusName_(name);
        if (betreiber) setze('Betreiber', betreiber);
      }

      if (String(feld('Status')).indexOf(STATUS_FEHLER_PRAEFIX) === 0) setze('Status', '');
      bilanz.ergaenzt++;
    } catch (e) {
      setze('Status', STATUS_FEHLER_PRAEFIX + ': ' + e.message);
      bilanz.fehler++;
    }
  }

  const text = [
    bilanz.ergaenzt + ' Zeilen ergänzt',
    bilanz.vollstaendig + ' Zeilen waren schon vollständig',
    bilanz.fehler + ' Zeilen nicht auflösbar (siehe Spalte Status)',
  ];
  if (bilanz.abgebrochen) text.push('\nZeitlimit erreicht — bitte „Links auflösen" noch einmal starten.');
  ui.alert('Links auflösen v' + VERSION, text.join('\n'), ui.ButtonSet.OK);
}

/** Spaltenkopf → Spaltennummer (1-basiert). */
function spaltenIndex_(blatt) {
  const koepfe = blatt.getRange(1, 1, 1, blatt.getLastColumn()).getValues()[0];
  const index = {};
  koepfe.forEach(function (k, i) { if (k !== '') index[k] = i + 1; });
  return index;
}

/**
 * Folgt Weiterleitungen einzeln (followRedirects: false) bis zu einer Maps-URL mit Inhalt.
 * Eine Zustimmungsseite von Google wird über ihren continue-Parameter übersprungen.
 */
function folgeWeiterleitungen_(url) {
  let aktuell = url;
  for (let schritt = 0; schritt < 6; schritt++) {
    if (/consent\.google\./.test(aktuell)) {
      const weiter = aktuell.match(/[?&]continue=([^&]+)/);
      if (!weiter) throw new Error('Google-Zustimmungsseite ohne Weiterleitung');
      aktuell = decodeURIComponent(weiter[1]);
      continue;
    }
    if (/\/maps\/(place|dir|search)\//.test(aktuell) || /!3d-?\d/.test(aktuell)) return aktuell;

    const antwort = UrlFetchApp.fetch(aktuell, { followRedirects: false, muteHttpExceptions: true });
    const code = antwort.getResponseCode();
    if (code < 300 || code >= 400) return aktuell;
    const kopf = antwort.getAllHeaders();
    const ziel = kopf.Location || kopf.location;
    if (!ziel) return aktuell;
    aktuell = Array.isArray(ziel) ? ziel[0] : ziel;
  }
  return aktuell;
}

/**
 * Liest Name und Koordinaten aus einer aufgelösten Maps-URL.
 * Vorrang haben die Paare !3d<lat>!4d<lon> (exakter Ort), danach @lat,lon oder q=lat,lon.
 * Gibt { name, lat, lon } zurück; lat/lon sind null, wenn nichts gefunden wurde.
 */
function werteMapsUrlAus_(url) {
  const u = String(url);
  let name = '';
  const mName = u.match(/\/maps\/place\/([^\/@?]+)/);
  if (mName) {
    try { name = decodeURIComponent(mName[1].replace(/\+/g, ' ')).trim(); } catch (e) { name = ''; }
  }

  const paare = [];
  const muster = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g;
  let treffer;
  while ((treffer = muster.exec(u)) !== null) paare.push(treffer);
  if (paare.length > 0) {
    const letztes = paare[paare.length - 1];
    return { name: name, lat: Number(letztes[1]), lon: Number(letztes[2]) };
  }

  const ersatz = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (ersatz) return { name: name, lat: Number(ersatz[1]), lon: Number(ersatz[2]) };
  return { name: name, lat: null, lon: null };
}

/** Rückwärts-Geokodierung über den eingebauten Maps-Dienst (kein Schlüssel nötig). */
function adresseZuKoordinate_(lat, lon) {
  const antwort = Maps.newGeocoder().setLanguage('de').reverseGeocode(lat, lon);
  if (antwort.status !== 'OK' || !antwort.results || antwort.results.length === 0) return { adresse: '', ort: '' };
  const erstes = antwort.results[0];
  let ort = '';
  (erstes.address_components || []).forEach(function (k) {
    if (!ort && k.types.indexOf('locality') !== -1) ort = k.long_name;
  });
  return { adresse: erstes.formatted_address || '', ort: ort };
}

/** Hängt den Ort an, damit gleichnamige Stationen („EnBW Ladestation") unterscheidbar sind. */
function nameMitOrt_(name, ort) {
  if (!ort || name.toLowerCase().indexOf(ort.toLowerCase()) !== -1) return name;
  return name + ' ' + ort;
}

function betreiberAusName_(name) {
  const n = String(name || '').toLowerCase();
  for (let i = 0; i < BETREIBER_MUSTER.length; i++) {
    if (n.indexOf(BETREIBER_MUSTER[i][0]) !== -1) return BETREIBER_MUSTER[i][1];
  }
  return '';
}

function runde_(zahl, stellen) {
  const f = Math.pow(10, stellen);
  return Math.round(zahl * f) / f;
}

// ---------------------------------------------------------------------------
// berechneRouten() — holt jede Route samt Höhen von OpenRouteService, rechnet
// kumulierte Kilometer und Höhenmeter, dünnt aus und legt die Linie als
// linien/<id>.json im Repo ab, aus dem exportJson() später liest.
// ---------------------------------------------------------------------------

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const ERDRADIUS_KM = 6371.0088;
const AUSDUENNUNG_KM = 0.25;
const AUSDUENNUNG_HM = 10;
const FANGRADIUS_M = 2000; // so weit darf ORS einen Punkt zur nächsten Straße verschieben
const MAX_START_NEUE_ROUTE_MS = 4 * 60 * 1000; // danach keine neue Route mehr beginnen

const GITHUB_REPO = 'obitusde/ladeplanung';
const GITHUB_BRANCH = 'main';
const LINIEN_ORDNER = 'linien';

/** Berechnet nur Routen, deren Start/Via/Ziel sich geändert haben oder die noch fehlen. */
function berechneRouten() { berechneRoutenIntern_(false); }

/** Berechnet alle Routen neu. */
function berechneRoutenNeu() { berechneRoutenIntern_(true); }

function berechneRoutenIntern_(erzwingen) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  const schluessel = props.getProperty('ORS_API_KEY');
  if (!schluessel || !props.getProperty('GITHUB_TOKEN')) {
    ui.alert('Routen berechnen', 'Es fehlen Zugänge: ORS_API_KEY und GITHUB_TOKEN müssen in den Skripteigenschaften stehen.', ui.ButtonSet.OK);
    return;
  }
  const blatt = ss.getSheetByName(BLATT_ROUTEN);
  if (!blatt || blatt.getLastRow() < 2) {
    ui.alert('Routen berechnen', 'Blatt „' + BLATT_ROUTEN + '" fehlt oder ist leer — zuerst Setup ausführen.', ui.ButtonSet.OK);
    return;
  }

  const sp = spaltenIndex_(blatt);
  const werte = blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues();
  const start = Date.now();
  const meldungen = [];
  let abgebrochen = false;

  for (let i = 0; i < werte.length; i++) {
    const z = werte[i];
    const zeile = i + 2;
    const feld = function (name) { return String(z[sp[name] - 1]).trim(); };
    const setze = function (name, wert) { blatt.getRange(zeile, sp[name]).setValue(wert); };

    const id = feld('id');
    if (!id) continue;

    const eingabe = [feld('Start'), feld('Via'), feld('Ziel')].join('|');
    const stand = feld('Stand');
    const aktuell = stand !== '' && stand.indexOf('Fehler') !== 0 && props.getProperty('EINGABE_' + id) === eingabe;
    if (aktuell && !erzwingen) { meldungen.push(id + ': unverändert, übersprungen'); continue; }

    if (Date.now() - start > MAX_START_NEUE_ROUTE_MS) { abgebrochen = true; break; }

    try {
      if (!feld('Start') || !feld('Ziel')) throw new Error('Start oder Ziel fehlt');
      const eintraege = [feld('Start')]
        .concat(feld('Via').split(';'))
        .concat([feld('Ziel')])
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s !== ''; });
      const punkte = eintraege.map(koordinateAusEingabe_);

      const route = holeRoute_(punkte, schluessel);
      const voll = kumuliere_(route.koordinaten);
      const linie = duenneAus_(voll);
      const letzter = linie[linie.length - 1];

      const datei = {
        version: VERSION,
        id: id,
        name: feld('Name'),
        eingabe: eingabe,
        erzeugt: new Date().toISOString(),
        ors_distanz_km: runde_(route.distanz_m / 1000, 2),
        ors_dauer_s: Math.round(route.dauer_s),
        laenge_km: letzter[2],
        hm_hin: letzter[3],
        hm_rueck: letzter[4],
        stuetzpunkte_voll: voll.length,
        linie: linie,
      };
      githubSchreibe_(LINIEN_ORDNER + '/' + id + '.json', JSON.stringify(datei), 'Linie ' + id + ' berechnet (Apps Script v' + VERSION + ')');

      setze('Länge km', runde_(route.distanz_m / 1000, 1));
      setze('Fahrzeit', formatiereDauer_(route.dauer_s));
      setze('Stand', Utilities.formatDate(new Date(), 'Europe/Zurich', 'dd.MM.yyyy HH:mm'));
      props.setProperty('EINGABE_' + id, eingabe);

      meldungen.push(id + ': ' + letzter[2] + ' km, Anstieg ' + letzter[3] + ' m hin / ' + letzter[4] +
        ' m rück, ' + voll.length + ' → ' + linie.length + ' Stützpunkte');
    } catch (e) {
      setze('Stand', 'Fehler: ' + e.message);
      meldungen.push(id + ': Fehler — ' + e.message);
    }
  }

  if (abgebrochen) meldungen.push('\nZeitlimit erreicht — bitte „Routen berechnen" noch einmal starten.');
  ui.alert('Routen berechnen v' + VERSION, meldungen.join('\n'), ui.ButtonSet.OK);
}

/** „lat,lon" oder Maps-Link → [lon, lat] für ORS. */
function koordinateAusEingabe_(text) {
  const m = String(text).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return [Number(m[2]), Number(m[1])];
  if (istMapsLink_(text)) {
    const info = werteMapsUrlAus_(folgeWeiterleitungen_(text));
    if (info.lat === null) throw new Error('Link ohne Koordinaten: ' + text);
    return [info.lon, info.lat];
  }
  throw new Error('weder Koordinate noch Maps-Link: ' + text);
}

function holeRoute_(punkte, schluessel) {
  const antwort = UrlFetchApp.fetch(ORS_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: schluessel, Accept: 'application/geo+json' },
    payload: JSON.stringify({
      coordinates: punkte,
      elevation: true,
      instructions: false,
      radiuses: punkte.map(function () { return FANGRADIUS_M; }),
    }),
    muteHttpExceptions: true,
  });

  const code = antwort.getResponseCode();
  const text = antwort.getContentText();
  if (code !== 200) {
    let meldung = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      if (j.error) meldung = typeof j.error === 'string' ? j.error : (j.error.message || JSON.stringify(j.error));
    } catch (e) { /* Rohtext behalten */ }
    throw new Error('ORS HTTP ' + code + ': ' + meldung);
  }

  const json = JSON.parse(text);
  const f = json.features && json.features[0];
  if (!f || !f.geometry || !f.geometry.coordinates || f.geometry.coordinates.length < 2) throw new Error('ORS lieferte keine Geometrie');
  if (f.geometry.coordinates[0].length < 3) throw new Error('ORS lieferte keine Höhenwerte');
  const summe = (f.properties && f.properties.summary) || {};
  return { koordinaten: f.geometry.coordinates, distanz_m: summe.distance || 0, dauer_s: summe.duration || 0 };
}

/**
 * [lon, lat, höhe] in voller Auflösung → [lat, lon, km, anstieg_hin, anstieg_rueck, höhe].
 * Der Anstieg in Rückrichtung ist das kumulierte Gefälle in Hinrichtung.
 */
function kumuliere_(koordinaten) {
  const erg = [];
  let km = 0, auf = 0, ab = 0;
  for (let i = 0; i < koordinaten.length; i++) {
    const p = koordinaten[i];
    if (i > 0) {
      const v = koordinaten[i - 1];
      km += haversine_(v[1], v[0], p[1], p[0]);
      const d = p[2] - v[2];
      if (d > 0) auf += d; else ab -= d;
    }
    erg.push([p[1], p[0], km, auf, ab, p[2]]);
  }
  return erg;
}

/**
 * Behält einen Stützpunkt, wenn seit dem letzten behaltenen mehr als 250 m zurückgelegt
 * wurden oder sich die Höhe um mehr als 10 m geändert hat; erster und letzter immer.
 * Rundet auf [lat, lon] 5 Stellen, km 2 Stellen, Höhenmeter ganzzahlig.
 */
function duenneAus_(voll) {
  if (voll.length === 0) return [];
  const behalten = [voll[0]];
  let letzter = voll[0];
  for (let i = 1; i < voll.length - 1; i++) {
    const p = voll[i];
    if (p[2] - letzter[2] > AUSDUENNUNG_KM || Math.abs(p[5] - letzter[5]) > AUSDUENNUNG_HM) {
      behalten.push(p);
      letzter = p;
    }
  }
  if (voll.length > 1) behalten.push(voll[voll.length - 1]);
  return behalten.map(function (p) {
    return [runde_(p[0], 5), runde_(p[1], 5), runde_(p[2], 2), Math.round(p[3]), Math.round(p[4])];
  });
}

// ---------------------------------------------------------------------------
// GitHub — Lesen und Schreiben von Dateien im Repo über die Contents-API.
// ---------------------------------------------------------------------------

function githubKopf_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN fehlt in den Skripteigenschaften');
  return { Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
}

function githubUrl_(pfad) {
  return 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + pfad;
}

/** Legt eine Datei an oder ersetzt sie. Der sha der bestehenden Datei wird vorher geholt. */
function githubSchreibe_(pfad, inhalt, nachricht) {
  const kopf = githubKopf_();
  kopf.Accept = 'application/vnd.github+json';

  const alt = UrlFetchApp.fetch(githubUrl_(pfad) + '?ref=' + GITHUB_BRANCH, { headers: kopf, muteHttpExceptions: true });
  let sha = null;
  if (alt.getResponseCode() === 200) {
    sha = JSON.parse(alt.getContentText()).sha;
  } else if (alt.getResponseCode() !== 404) {
    throw new Error('GitHub GET ' + pfad + ' HTTP ' + alt.getResponseCode() + ': ' + alt.getContentText().slice(0, 200));
  }

  const body = { message: nachricht, content: Utilities.base64Encode(inhalt, Utilities.Charset.UTF_8), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const antwort = UrlFetchApp.fetch(githubUrl_(pfad), {
    method: 'put', contentType: 'application/json', headers: kopf, payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  const code = antwort.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub PUT ' + pfad + ' HTTP ' + code + ': ' + antwort.getContentText().slice(0, 200));
  }
}

/** Liest eine Datei als Text; null, wenn sie nicht existiert. */
function githubLies_(pfad) {
  const kopf = githubKopf_();
  kopf.Accept = 'application/vnd.github.raw+json';
  const antwort = UrlFetchApp.fetch(githubUrl_(pfad) + '?ref=' + GITHUB_BRANCH, { headers: kopf, muteHttpExceptions: true });
  if (antwort.getResponseCode() === 404) return null;
  if (antwort.getResponseCode() !== 200) {
    throw new Error('GitHub GET ' + pfad + ' HTTP ' + antwort.getResponseCode() + ': ' + antwort.getContentText().slice(0, 200));
  }
  return antwort.getContentText('UTF-8');
}

// ---------------------------------------------------------------------------
// Projektion — Kernalgorithmus des Streckenkilometer-Modells (Brief, Abschnitt 2).
// Dieselbe Rechnung steckt später im Frontend.
// ---------------------------------------------------------------------------

/**
 * Projiziert (lat, lon) auf die Linie [[lat, lon, km, hm_hin, hm_rueck], …].
 * Lokale äquirektanguläre Projektion um lat0 = Mittel der Routenbreiten.
 * Gibt { q: Querabstand km, km, hm_hin, hm_rueck } zurück, interpoliert im nächsten Segment.
 */
function projiziere_(linie, lat, lon, lat0) {
  if (lat0 === undefined) {
    let summe = 0;
    for (let i = 0; i < linie.length; i++) summe += linie[i][0];
    lat0 = summe / linie.length;
  }
  const fx = 111.320 * Math.cos(lat0 * Math.PI / 180);
  const fy = 110.574;
  const px = lon * fx, py = lat * fy;

  let bester = { q: Infinity, km: 0, hm_hin: 0, hm_rueck: 0 };
  for (let i = 0; i < linie.length - 1; i++) {
    const a = linie[i], b = linie[i + 1];
    const ax = a[1] * fx, ay = a[0] * fy;
    const dx = b[1] * fx - ax, dy = b[0] * fy - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const q = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    if (q < bester.q) {
      bester = {
        q: q,
        km: a[2] + t * (b[2] - a[2]),
        hm_hin: a[3] + t * (b[3] - a[3]),
        hm_rueck: a[4] + t * (b[4] - a[4]),
      };
    }
  }
  return bester;
}

function haversine_(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * ERDRADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatiereDauer_(sekunden) {
  const h = Math.floor(sekunden / 3600);
  const min = Math.round((sekunden - h * 3600) / 60);
  return h + ' h ' + ('0' + min).slice(-2) + ' min';
}

function setzeValidierungen_(punkte) {
  const zeilen = punkte.getMaxRows() - 1;
  const spalteRichtung = SPALTEN_PUNKTE.indexOf('Richtung') + 1;
  const spalteFavorit = SPALTEN_PUNKTE.indexOf('Favorit') + 1;

  punkte.getRange(2, spalteRichtung, zeilen, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(RICHTUNGEN, true).setAllowInvalid(false).build()
  );
  punkte.getRange(2, spalteFavorit, zeilen, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['ja'], true).setAllowInvalid(false).build()
  );
}
