/**
 * Ladeplanung Cupra Born — Apps Script, an das Sheet „Ladestationen" gebunden.
 *
 * Version 0.9.0 — Zuordnung bis 5 km mit Querabstand, Straße und Raststätten-Kennung; Höhenfilter 10 m.
 * Version 0.8.0 — Savona als zwei Varianten (Simplon, Gr. St. Bernhard), Mont Blanc gestrichen; routenVorgabenUebernehmen().
 * Version 0.7.0 — Alle Schritte auch direkt im Editor ausführbar (schritt1_… bis schritt5_…).
 * Version 0.6.0 — bereinigePunkte(): Porsche Destination entfernen, Dubletten zusammenführen.
 * Version 0.5.0 — Etappe 6: exportJson() mit Zuordnung und GitHub-Upload.
 * Version 0.4.0 — Etappe 4/5: berechneRouten() mit Kumulierung, Ausdünnung, Rundung.
 * Version 0.3.0 — Etappe 3: aufloeseLinks().
 * Version 0.2.0 — Etappe 2: setup() und Menü.
 *
 * Grundlage: Umsetzungsbrief v5.0, Stufe 1.
 */

const VERSION = '0.9.0';

const BLATT_PUNKTE = 'Ladepunkte';
const BLATT_ROUTEN = 'Routen';
const BLATT_SICHERUNG = 'Alt-Import (Sicherung)';

const SPALTEN_PUNKTE = ['id', 'Maps-Link', 'Name', 'Adresse', 'Lat', 'Lon', 'Betreiber', 'kW', 'Anzahl', 'Richtung', 'Favorit', 'Notiz', 'Status'];
const SPALTEN_ROUTEN = ['id', 'Name', 'Start', 'Via', 'Ziel', 'Länge km', 'Fahrzeit', 'Stand'];

const RICHTUNGEN = ['hin', 'rueck', 'beide'];

// Start aller Stammstrecken: Koordinate aus Christofs geteiltem Routenlink (Brief, Stufe 2).
const START_MORGES = '46.5043239,6.4912739';

// Via-Punkte, geprüft am 15.09.2026 gegen das Straßennetz (OSRM nearest/route):
// Simplon aus Christofs Maps-Link, 8 m neben der Simplonstrasse.
const VIA_SIMPLON = '46.245838,8.02474';
// Mitten im Straßentunnel Grosser St. Bernhard, weit genug von der Passstraße entfernt,
// damit der Router weder den Pass noch den Mont-Blanc-Tunnel wählt.
const VIA_GR_ST_BERNHARD = '45.85658,7.16605';
const ZIEL_SAVONA = '44.3090500,8.4771500';

// Zeilen für das Blatt „Routen": id, Name, Start, Via, Ziel.
// Zwei Savona-Varianten auf Christofs Wunsch (15.09.2026) — bewusste Abweichung vom Brief
// („eine Route pro Strecke"); die Mont-Blanc-Route ist gestrichen.
const STAMMSTRECKEN = [
  ['neuenrade', 'Morges – Neuenrade', START_MORGES, '', '51.2847342,7.7950369'],
  ['ingolstadt', 'Morges – Ingolstadt', START_MORGES, '', '48.7650800,11.4237200'],
  ['savona_simplon', 'Morges – Savona (Simplon)', START_MORGES, VIA_SIMPLON, ZIEL_SAVONA],
  ['savona_bernhard', 'Morges – Savona (Gr. St. Bernhard)', START_MORGES, VIA_GR_ST_BERNHARD, ZIEL_SAVONA],
];
const ROUTEN_ENTFERNT = ['savona']; // Mont-Blanc-Variante

// ---------------------------------------------------------------------------
// Menü
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ladeplanung')
    .addItem('Links auflösen', 'aufloeseLinks')
    .addItem('Routen berechnen (geänderte)', 'berechneRouten')
    .addItem('Routen neu berechnen (alle)', 'berechneRoutenNeu')
    .addItem('Export nach GitHub', 'exportJson')
    .addSeparator()
    .addItem('Punkte bereinigen (Dubletten, Entfernte)', 'bereinigePunkte')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Zugänge')
      .addItem('ORS-Schlüssel hinterlegen', 'orsSchluesselHinterlegen')
      .addItem('GitHub-Token hinterlegen', 'githubTokenHinterlegen'))
    .addItem('Setup (Blätter anlegen)', 'setup')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Direkt im Apps-Script-Editor ausführbar: Funktion oben in der Liste wählen, „Ausführen".
// Die Ergebnisse stehen dann im Ausführungsprotokoll unten statt in einem Dialog.
// ---------------------------------------------------------------------------

function schritt0_RoutenVorgabenUebernehmen() { routenVorgabenUebernehmen(); }
function schritt1_PunkteBereinigenVorschau() { bereinigeIntern_('vorschau'); }
function schritt2_PunkteBereinigen() { bereinigeIntern_('ausfuehren'); }
function schritt3_LinksAufloesen() { aufloeseLinks(); }
function schritt4_RoutenBerechnen() { berechneRouten(); }
function schritt5_Export() { exportJson(); }

/**
 * Meldungen: im Sheet als Dialog, im Editor nur im Ausführungsprotokoll.
 * SpreadsheetApp.getUi() wirft außerhalb des Sheets einen Fehler — daher dieser Umweg.
 */
function meldungsUi_() {
  let echt = null;
  try { echt = SpreadsheetApp.getUi(); } catch (e) { echt = null; }
  return {
    imSheet: echt !== null,
    ButtonSet: echt ? echt.ButtonSet : { OK: 'OK', YES_NO: 'YES_NO' },
    Button: echt ? echt.Button : { YES: 'YES' },
    alert: function (titel, text, knoepfe) {
      console.log(titel + (text ? '\n' + text : ''));
      return echt ? echt.alert(titel, text, knoepfe) : null;
    },
  };
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
  const ui = meldungsUi_();
  ui.alert('Setup v' + VERSION, meldungen.join('\n'), ui.ButtonSet.OK);
}

/**
 * Gleicht das Blatt „Routen" mit STAMMSTRECKEN ab: fehlende Zeilen anhängen, abweichende
 * Name/Start/Via/Ziel überschreiben, Routen aus ROUTEN_ENTFERNT löschen. Idempotent.
 * Länge, Fahrzeit und Stand bleiben unberührt — berechneRouten() erkennt die geänderte Eingabe.
 */
function routenVorgabenUebernehmen() {
  const ui = meldungsUi_();
  const blatt = SpreadsheetApp.getActive().getSheetByName(BLATT_ROUTEN);
  if (!blatt) { ui.alert('Routen-Vorgaben', 'Blatt „' + BLATT_ROUTEN + '" fehlt — zuerst Setup ausführen.', ui.ButtonSet.OK); return; }
  const sp = spaltenIndex_(blatt);
  const meldungen = [];

  for (let z = blatt.getLastRow(); z >= 2; z--) {
    const id = String(blatt.getRange(z, sp.id).getValue()).trim();
    if (ROUTEN_ENTFERNT.indexOf(id) !== -1) { blatt.deleteRow(z); meldungen.push('entfernt: ' + id); }
  }

  const werte = blatt.getLastRow() >= 2 ? blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues() : [];
  STAMMSTRECKEN.forEach(function (s) {
    const soll = { id: s[0], Name: s[1], Start: s[2], Via: s[3], Ziel: s[4] };
    let index = -1;
    werte.forEach(function (z, i) { if (String(z[sp.id - 1]).trim() === s[0]) index = i; });

    if (index === -1) {
      const zeile = blatt.getLastRow() + 1;
      Object.keys(soll).forEach(function (k) { schreibeText_(blatt, zeile, sp[k], soll[k]); });
      meldungen.push('neu: ' + s[0]);
      return;
    }
    const geaendert = Object.keys(soll).filter(function (k) { return String(werte[index][sp[k] - 1]).trim() !== soll[k]; });
    geaendert.forEach(function (k) { schreibeText_(blatt, index + 2, sp[k], soll[k]); });
    if (geaendert.length > 0) meldungen.push(s[0] + ': ' + geaendert.join(', ') + ' aktualisiert');
  });

  if (meldungen.length === 0) meldungen.push('Alles entsprach schon den Vorgaben — nichts geändert.');
  ui.alert('Routen-Vorgaben v' + VERSION, meldungen.join('\n'), ui.ButtonSet.OK);
}

/** Schreibt als reinen Text, damit „46.2,8.0" im deutschen Gebietsschema nicht als Zahl gelesen wird. */
function schreibeText_(blatt, zeile, spalte, wert) {
  blatt.getRange(zeile, spalte).setNumberFormat('@').setValue(wert);
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
  const ui = meldungsUi_();
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
// bereinigePunkte() — auf Christofs Wunsch (15.09.2026): ausdrücklich genannte
// Stationen entfernen, Dubletten (≤ 25 m) zusammenführen. Zeigt vorher, was passiert,
// und handelt erst nach Bestätigung. Ein zweiter Lauf findet nichts mehr.
// Einzige Ausnahme von der Notiz-Regel: bei Dubletten werden die Notizen vereinigt.
// ---------------------------------------------------------------------------

// Sicherung über den Namen, damit nie eine falsche Zeile mit gleicher id gelöscht wird.
const ENTFERNEN = [{ id: 'p003', nameEnthaelt: 'Porsche Destination' }];
const DUBLETTE_MAX_M = 25;

/** Menüpunkt: zeigt den Plan und fragt nach. */
function bereinigePunkte() { bereinigeIntern_('menue'); }

/** modus: 'menue' (mit Rückfrage), 'vorschau' (nur anzeigen), 'ausfuehren' (ohne Rückfrage, für den Editor). */
function bereinigeIntern_(modus) {
  const ui = meldungsUi_();
  const blatt = SpreadsheetApp.getActive().getSheetByName(BLATT_PUNKTE);
  if (!blatt || blatt.getLastRow() < 2) {
    ui.alert('Punkte bereinigen', 'Blatt „' + BLATT_PUNKTE + '" fehlt oder ist leer.', ui.ButtonSet.OK);
    return;
  }
  const sp = spaltenIndex_(blatt);
  const zeilen = blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues().map(function (z, i) {
    const feld = function (name) { return z[sp[name] - 1]; };
    return {
      zeile: i + 2, id: String(feld('id')).trim(), name: String(feld('Name')), lat: feld('Lat'), lon: feld('Lon'),
      notiz: String(feld('Notiz')), favorit: String(feld('Favorit')), richtung: String(feld('Richtung')),
      betreiber: feld('Betreiber'), kw: feld('kW'), anzahl: feld('Anzahl'),
    };
  });

  const plan = planeBereinigung_(zeilen);
  if (plan.loeschen.length === 0) {
    ui.alert('Punkte bereinigen v' + VERSION, 'Nichts zu tun — keine Dubletten, nichts zu entfernen.', ui.ButtonSet.OK);
    return;
  }
  if (modus === 'vorschau') {
    ui.alert('Punkte bereinigen v' + VERSION + ' — Vorschau, nichts geändert', plan.beschreibung.join('\n'), ui.ButtonSet.OK);
    return;
  }
  if (modus === 'menue') {
    const antwort = ui.alert('Punkte bereinigen v' + VERSION, plan.beschreibung.join('\n') + '\n\nAusführen?', ui.ButtonSet.YES_NO);
    if (antwort !== ui.Button.YES) return;
  } else {
    console.log('Ausführung ohne Rückfrage:\n' + plan.beschreibung.join('\n'));
  }

  // Erst Felder der verbleibenden Zeilen ändern, dann von unten nach oben löschen.
  plan.aenderungen.forEach(function (a) {
    Object.keys(a.felder).forEach(function (f) { blatt.getRange(a.zeile, sp[f]).setValue(a.felder[f]); });
  });
  plan.loeschen.slice().sort(function (x, y) { return y - x; }).forEach(function (z) { blatt.deleteRow(z); });

  ui.alert('Punkte bereinigen v' + VERSION, plan.loeschen.length + ' Zeilen gelöscht, ' + plan.aenderungen.length + ' Zeilen ergänzt.', ui.ButtonSet.OK);
}

/**
 * Plant die Bereinigung, ohne etwas zu schreiben (testbar).
 * zeilen: [{ zeile, id, name, lat, lon, notiz, favorit, richtung, betreiber, kw, anzahl }]
 * Gibt { loeschen: [Zeilennummern], aenderungen: [{ zeile, felder }], beschreibung: [Text] } zurück.
 */
function planeBereinigung_(zeilen) {
  const loeschen = [], aenderungen = [], beschreibung = [];
  const weg = {};

  zeilen.forEach(function (z) {
    ENTFERNEN.forEach(function (e) {
      if (z.id === e.id && z.name.indexOf(e.nameEnthaelt) !== -1 && !weg[z.zeile]) {
        weg[z.zeile] = true;
        loeschen.push(z.zeile);
        beschreibung.push('Löschen: ' + z.id + ' ' + z.name);
      }
    });
  });

  for (let i = 0; i < zeilen.length; i++) {
    const a = zeilen[i];
    if (weg[a.zeile] || a.lat === '' || a.lon === '') continue;
    const neu = { Notiz: a.notiz, Favorit: a.favorit, Richtung: a.richtung, Betreiber: a.betreiber, kW: a.kw, Anzahl: a.anzahl };

    for (let j = i + 1; j < zeilen.length; j++) {
      const b = zeilen[j];
      if (weg[b.zeile] || b.lat === '' || b.lon === '') continue;
      if (haversine_(Number(a.lat), Number(a.lon), Number(b.lat), Number(b.lon)) * 1000 > DUBLETTE_MAX_M) continue;

      weg[b.zeile] = true;
      loeschen.push(b.zeile);
      neu.Notiz = vereinigeNotizen_(neu.Notiz, b.notiz);
      if (b.favorit === 'ja') neu.Favorit = 'ja';
      if (neu.Richtung !== b.richtung) neu.Richtung = 'beide';
      if (neu.Betreiber === '') neu.Betreiber = b.betreiber;
      if (neu.kW === '') neu.kW = b.kw;
      if (neu.Anzahl === '') neu.Anzahl = b.anzahl;
      beschreibung.push('Zusammenführen: ' + b.id + ' → ' + a.id + ' (' + a.name + ')');
    }

    const felder = {};
    const alt = { Notiz: a.notiz, Favorit: a.favorit, Richtung: a.richtung, Betreiber: a.betreiber, kW: a.kw, Anzahl: a.anzahl };
    Object.keys(neu).forEach(function (k) { if (neu[k] !== alt[k]) felder[k] = neu[k]; });
    if (Object.keys(felder).length > 0) aenderungen.push({ zeile: a.zeile, id: a.id, felder: felder });
  }

  return { loeschen: loeschen, aenderungen: aenderungen, beschreibung: beschreibung };
}

/** Vereinigt kommagetrennte Notizen ohne Wiederholung, Reihenfolge bleibt erhalten. */
function vereinigeNotizen_(a, b) {
  const teile = [], gesehen = {};
  [a, b].forEach(function (t) {
    String(t || '').split(',').forEach(function (s) {
      const x = s.trim();
      if (x && !gesehen[x.toLowerCase()]) { gesehen[x.toLowerCase()] = true; teile.push(x); }
    });
  });
  return teile.join(', ');
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
  const ui = meldungsUi_();
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
    // Das Linienformat gehört zum Fingerabdruck: ändert sich die Rechnung, wird automatisch neu berechnet.
    const aktuell = stand !== '' && stand.indexOf('Fehler') !== 0 && props.getProperty('EINGABE_' + id) === eingabe + '#f' + LINIEN_FORMAT;
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
        format: LINIEN_FORMAT,
        strassen: strassenAbschnitte_(route.schritte, voll),
        linie: linie,
      };
      githubSchreibe_(LINIEN_ORDNER + '/' + id + '.json', JSON.stringify(datei), 'Linie ' + id + ' berechnet (Apps Script v' + VERSION + ')');

      setze('Länge km', runde_(route.distanz_m / 1000, 1));
      setze('Fahrzeit', formatiereDauer_(route.dauer_s));
      setze('Stand', Utilities.formatDate(new Date(), 'Europe/Zurich', 'dd.MM.yyyy HH:mm'));
      props.setProperty('EINGABE_' + id, eingabe + '#f' + LINIEN_FORMAT);

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
      instructions: true, // nur für die Straßennamen je Abschnitt
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
  const schritte = [];
  ((f.properties && f.properties.segments) || []).forEach(function (segment) {
    (segment.steps || []).forEach(function (s) {
      schritte.push({ von: s.way_points ? s.way_points[0] : 0, name: s.name || '' });
    });
  });
  return { koordinaten: f.geometry.coordinates, distanz_m: summe.distance || 0, dauer_s: summe.duration || 0, schritte: schritte };
}

/**
 * Straßennamen je Abschnitt aus den ORS-Schritten: [[km_ab, name], …], gleiche Namen zusammengefasst.
 * Unbenannte Abschnitte (ORS schreibt „-") bleiben als leerer Name erhalten.
 */
function strassenAbschnitte_(schritte, voll) {
  const erg = [];
  (schritte || []).forEach(function (s) {
    const i = Math.max(0, Math.min(voll.length - 1, s.von));
    const name = s.name && s.name !== '-' ? String(s.name).trim() : '';
    if (erg.length > 0 && erg[erg.length - 1][1] === name) return;
    erg.push([runde_(voll[i][2], 2), name]);
  });
  return erg;
}

/** Straße bei Streckenkilometer km; liegt km auf einem unbenannten Stück, der nächste benannte Abschnitt bis 3 km. */
function strasseBeiKm_(strassen, km) {
  if (!strassen || strassen.length === 0) return '';
  let i = 0;
  while (i + 1 < strassen.length && strassen[i + 1][0] <= km) i++;
  if (strassen[i][1]) return strassen[i][1];

  let davor = i - 1, danach = i + 1;
  while (davor >= 0 && !strassen[davor][1]) davor--;
  while (danach < strassen.length && !strassen[danach][1]) danach++;
  const abstandDavor = davor >= 0 ? km - strassen[davor + 1][0] : Infinity;
  const abstandDanach = danach < strassen.length ? strassen[danach][0] - km : Infinity;
  if (Math.min(abstandDavor, abstandDanach) > 3) return '';
  return abstandDavor <= abstandDanach ? strassen[davor][1] : strassen[danach][1];
}

// Höhenfilter: Anstieg/Gefälle zählt erst, wenn sich die Höhe seit dem letzten gezählten Punkt
// um mindestens 10 m geändert hat. Ohne Filter summiert das Rauschen der Höhendaten sich auf
// das Zwei- bis Dreifache (Rheinebene +965 statt +53 m). Ergebnis bleibt ein Näherungswert.
const HOEHEN_SCHWELLE_M = 10;
// Bei jeder Änderung an Rechnung oder Linienformat erhöhen — erzwingt Neuberechnung der Routen.
const LINIEN_FORMAT = 2;

/**
 * [lon, lat, höhe] in voller Auflösung → [lat, lon, km, anstieg_hin, anstieg_rueck, höhe].
 * Der Anstieg in Rückrichtung ist das kumulierte Gefälle in Hinrichtung.
 */
function kumuliere_(koordinaten) {
  const erg = [];
  let km = 0, auf = 0, ab = 0;
  let bezug = koordinaten.length > 0 ? koordinaten[0][2] : 0;
  for (let i = 0; i < koordinaten.length; i++) {
    const p = koordinaten[i];
    if (i > 0) {
      const v = koordinaten[i - 1];
      km += haversine_(v[1], v[0], p[1], p[0]);
      const d = p[2] - bezug;
      if (d >= HOEHEN_SCHWELLE_M) { auf += d; bezug = p[2]; }
      else if (-d >= HOEHEN_SCHWELLE_M) { ab -= d; bezug = p[2]; }
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
// exportJson() — ordnet Punkte den Routen zu (Querabstand ≤ 5 km), baut
// routes.json und lädt sie ins Repo. Reine Rechenarbeit, kein Routing-Aufruf.
// ---------------------------------------------------------------------------

// 5 km statt der 2 km aus dem Brief (Christof, 15.09.2026): Stationen an Ausfahrten und an
// parallelen Autobahnen gehören dazu; der Querabstand wird mit exportiert und angezeigt.
const ZUORDNUNG_MAX_KM = 5;
const STATUS_OHNE_ROUTE = 'keiner Route zugeordnet (> ' + ZUORDNUNG_MAX_KM + ' km)';
const RASTSTAETTE_MAX_KM = 0.5;
const RASTSTAETTE_MUSTER = /rastst[äa]tte|rasthof|rastanlage|rastplatz|autobahn|autogrill|aire de service|area di servizio/i;

function exportJson() {
  const ui = meldungsUi_();
  const ss = SpreadsheetApp.getActive();
  const routenBlatt = ss.getSheetByName(BLATT_ROUTEN);
  const punkteBlatt = ss.getSheetByName(BLATT_PUNKTE);
  if (!routenBlatt || !punkteBlatt) {
    ui.alert('Export', 'Blätter fehlen — zuerst Setup ausführen.', ui.ButtonSet.OK);
    return;
  }
  const meldungen = [];

  try {
    // Routen: Linien aus dem Repo, Name aus dem Sheet.
    const spR = spaltenIndex_(routenBlatt);
    const routen = [];
    if (routenBlatt.getLastRow() >= 2) {
      routenBlatt.getRange(2, 1, routenBlatt.getLastRow() - 1, routenBlatt.getLastColumn()).getValues().forEach(function (z) {
        const id = String(z[spR.id - 1]).trim();
        if (!id) return;
        const text = githubLies_(LINIEN_ORDNER + '/' + id + '.json');
        if (text === null) { meldungen.push(id + ': noch nicht berechnet — übersprungen'); return; }
        const datei = JSON.parse(text);
        const eingabe = [spR.Start, spR.Via, spR.Ziel].map(function (s) { return String(z[s - 1]).trim(); }).join('|');
        if (datei.eingabe !== eingabe) meldungen.push(id + ': Start/Via/Ziel geändert, Linie veraltet — bitte Routen berechnen');
        if (datei.format !== LINIEN_FORMAT) meldungen.push(id + ': Linie im alten Format — bitte Routen berechnen');
        routen.push({ id: id, name: String(z[spR.Name - 1]).trim() || datei.name, linie: datei.linie, strassen: datei.strassen || [] });
      });
    }
    if (routen.length === 0) throw new Error('keine berechnete Route vorhanden');

    // Punkte: alle Zeilen mit Koordinaten.
    const spP = spaltenIndex_(punkteBlatt);
    const punkte = [];
    const statusZeilen = [];
    if (punkteBlatt.getLastRow() >= 2) {
      punkteBlatt.getRange(2, 1, punkteBlatt.getLastRow() - 1, punkteBlatt.getLastColumn()).getValues().forEach(function (z, i) {
        const feld = function (name) { return z[spP[name] - 1]; };
        if (String(feld('id')).trim() === '' || feld('Lat') === '' || feld('Lon') === '') return;
        punkte.push({
          id: String(feld('id')).trim(),
          name: String(feld('Name')).trim(),
          adresse: String(feld('Adresse')).trim(),
          lat: Number(feld('Lat')),
          lon: Number(feld('Lon')),
          betreiber: String(feld('Betreiber')).trim(),
          kw: zahlOderNull_(feld('kW')),
          anzahl: zahlOderNull_(feld('Anzahl')),
          richtung: RICHTUNGEN.indexOf(String(feld('Richtung')).trim()) !== -1 ? String(feld('Richtung')).trim() : 'beide',
          favorit: String(feld('Favorit')).trim().toLowerCase() === 'ja',
          notiz: String(feld('Notiz')).trim(),
        });
        statusZeilen.push({ zeile: i + 2, status: String(feld('Status')) });
      });
    }

    const json = baueExport_(routen, punkte, new Date().toISOString());
    githubSchreibe_('routes.json', JSON.stringify(json), 'routes.json exportiert (Apps Script v' + VERSION + ')');

    // Status-Spalte: nicht zugeordnete Punkte kennzeichnen, erledigte Kennzeichnung entfernen.
    const ohne = [];
    json.punkte.forEach(function (p, k) {
      const s = statusZeilen[k];
      if (p.zuordnung.length === 0) {
        ohne.push(p.id);
        if (s.status === '') punkteBlatt.getRange(s.zeile, spP.Status).setValue(STATUS_OHNE_ROUTE);
      } else if (s.status === STATUS_OHNE_ROUTE) {
        punkteBlatt.getRange(s.zeile, spP.Status).setValue('');
      }
    });

    json.routen.forEach(function (r) {
      const n = json.punkte.filter(function (p) { return p.zuordnung.some(function (zu) { return zu.route === r.id; }); }).length;
      meldungen.push(r.id + ': ' + n + ' Punkte, ' + r.laenge_km + ' km, Anstieg ' + r.hm_hin + ' m hin / ' + r.hm_rueck + ' m rück');
    });
    meldungen.push(json.punkte.length + ' Punkte exportiert' + (ohne.length ? ', ohne Route: ' + ohne.join(', ') : ''));
  } catch (e) {
    meldungen.push('Fehler: ' + e.message);
  }

  ui.alert('Export v' + VERSION, meldungen.join('\n'), ui.ButtonSet.OK);
}

/**
 * Baut das routes.json-Objekt. Rein rechnerisch (testbar ohne Apps Script).
 * routen: [{ id, name, linie }], punkte: [{ id, name, …, lat, lon }] ohne zuordnung.
 */
function baueExport_(routen, punkte, zeitstempel) {
  const vorbereitet = routen.map(function (r) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity, summe = 0;
    r.linie.forEach(function (p) {
      summe += p[0];
      if (p[0] < minLat) minLat = p[0];
      if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLon) minLon = p[1];
      if (p[1] > maxLon) maxLon = p[1];
    });
    const lat0 = summe / r.linie.length;
    const randLat = ZUORDNUNG_MAX_KM / 110.574;
    const randLon = ZUORDNUNG_MAX_KM / (111.320 * Math.cos(lat0 * Math.PI / 180));
    return {
      r: r, lat0: lat0,
      box: [minLat - randLat, maxLat + randLat, minLon - randLon, maxLon + randLon],
    };
  });

  const punkteMitZuordnung = punkte.map(function (p) {
    const zuordnung = [];
    vorbereitet.forEach(function (v) {
      if (p.lat < v.box[0] || p.lat > v.box[1] || p.lon < v.box[2] || p.lon > v.box[3]) return;
      const pr = projiziere_(v.r.linie, p.lat, p.lon, v.lat0);
      if (pr.q <= ZUORDNUNG_MAX_KM) {
        zuordnung.push({
          route: v.r.id, km: runde_(pr.km, 2), hm_hin: Math.round(pr.hm_hin), hm_rueck: Math.round(pr.hm_rueck),
          quer_km: runde_(pr.q, 1),
          strasse: strasseBeiKm_(v.r.strassen, pr.km),
          raststaette: pr.q <= RASTSTAETTE_MAX_KM && istRaststaette_(p),
        });
      }
    });
    const kopie = {};
    Object.keys(p).forEach(function (k) { kopie[k] = p[k]; });
    kopie.lat = runde_(p.lat, 5);
    kopie.lon = runde_(p.lon, 5);
    kopie.zuordnung = zuordnung;
    return kopie;
  });

  return {
    version: '1.1', // 1.1: zuordnung um quer_km, strasse, raststaette ergänzt
    erzeugt: zeitstempel,
    routen: routen.map(function (r) {
      const letzter = r.linie[r.linie.length - 1];
      return { id: r.id, name: r.name, laenge_km: letzter[2], hm_hin: letzter[3], hm_rueck: letzter[4], linie: r.linie };
    }),
    punkte: punkteMitZuordnung,
  };
}

/**
 * Raststätte, wenn der Punkt nur in eine Fahrtrichtung erreichbar ist oder Name, Adresse
 * oder Notiz darauf hinweisen. Wird nur gesetzt, wenn er direkt an der Linie liegt.
 */
function istRaststaette_(p) {
  if (p.richtung === 'hin' || p.richtung === 'rueck') return true;
  return RASTSTAETTE_MUSTER.test([p.name, p.adresse, p.notiz].join(' '));
}

function zahlOderNull_(wert) {
  if (wert === '' || wert === null) return null;
  const n = Number(wert);
  return isNaN(n) ? null : n;
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
