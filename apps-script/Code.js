/**
 * Ladeplanung Cupra Born — Apps Script, an das Sheet „Ladestationen" gebunden.
 *
 * Version 0.18.0 — Routen-Link: ganze Adresse geokodieren (vorher nur die Straße → falscher Ort), Name und id aus den
 *                  Orten („Neuenrade – Ingolstadt"); falsche Route nach Wien entfernt. Ladepreise: preise.json,
 *                  Seite „Preise" (?seite=preise) mit Aktualisieren über OpenRouter (Websuche) und Bestätigen.
 * Version 0.17.1 — Brig nicht mehr fest eingetragen (kommt per Link, sonst doppelt).
 * Version 0.17.0 — Routen per geteiltem Google-Maps-Link: Spalte „Maps-Link" im Blatt Routen, Feld in der Wartung;
 *                  Start/Via/Ziel, Name und id füllt das Script (Stufe 2 teilweise).
 * Version 0.16.3 — Route Morges – Brig (A9 durchs Wallis); „Routen berechnen" meldet Zeilen ohne id, Start oder Ziel.
 * Version 0.16.2 — Straßennamen ohne Leerzeichen („A 96" → „A96"), in „Straße" auch „/" als Trenner.
 * Version 0.16.1 — Spalten im Blatt Ladepunkte nach Handarbeit geordnet (id, Link, Name, Straße, Notiz, kW, Anzahl,
 *                  Richtung, Favorit, dann Betreiber, Adresse, Lat, Lon, Status); ordnet sich beim Veröffentlichen selbst.
 *                  Blatt „Gelöscht" nach Spaltennamen befüllt.
 * Version 0.16.0 — Ingolstadt als zwei Routen (über München / über Augsburg); Spalte „Straße" je Ladepunkt (von Hand,
 *                  Vorrang im Titel; mehrere mit Komma → die, auf der die Route fährt); Linienformat 4 mit höchstem Punkt;
 *                  Export 1.2 mit Fahrzeit; „Routen berechnen" übernimmt vorher die Routen-Vorgaben.
 * Version 0.15.1 — Test: Veröffentlichen vom Handy (keine inhaltliche Änderung).
 * Version 0.15.0 — Maps-Links im neueren Teilen-Format ohne Koordinaten: Adresse aus dem Link wird geokodiert
 *                  (mindestens straßengenau), Status „Koordinaten aus Adresse".
 * Version 0.14.1 — Fahrzeit bei Vergleichswerten Pflicht, ohne Fahrzeit zählen sie nicht; veralteter Status „keiner Route
 *                  zugeordnet (> 2 km)" wird entfernt; Betreiber EWE Go, leerer Betreiber im Export aus dem Namen.
 *                  Robuste Kalibrierung: Ausreißer (> 35 % neben dem Median) nicht verwenden, erst Gesamtfaktor, dann
 *                  vorsichtige Einzelfaktoren, Heizung nur bei ≥ 10 °C Temperaturspanne; Spalte „Kalibrierung" je Zeile.
 * Version 0.14.0 — Vergleichswerte aus ABRP / My CUPRA (Formular „Vergleich"), Spalte „Quelle", Gewichte und Abweichung je Quelle;
 *                  Fahrten-Blatt wird vor dem Schreiben auf genug Spalten erweitert.
 * Version 0.13.0 — Verbrauchsmodell: Fahrten speichern (Formular „Kalibrieren"), Temperatur von Open-Meteo, Kalibrierung, modell.json.
 * Version 0.12.1 — Export enthält den Maps-Link je Punkt.
 * Version 0.12.0 — Löschen (ins Blatt „Gelöscht"), Nähe-Warnung bis 300 m, Seite „Wartung & Status".
 * Version 0.11.0 — Web-App-Formular zum Bearbeiten und Hinzufügen von Ladepunkten (nur eigenes Google-Konto).
 * Version 0.10.0 — Höhenprofil über 2 km geglättet (gleitender Median) vor dem 10-m-Filter; Straßennamen gekürzt.
 * Version 0.9.1 — Zuordnungskorridor 10 km.
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

const VERSION = '0.18.0';

// Das Sheet „Ladestationen". In der Web-App gibt es kein aktives Sheet, daher Rückfall auf die ID.
const SHEET_ID = '1t7mFq1DEODDg_8TQ3rWCGfjkNyJXm0jL5kZSI2AWeaE';

function tabelle_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
}

const BLATT_PUNKTE = 'Ladepunkte';
const BLATT_ROUTEN = 'Routen';
const BLATT_SICHERUNG = 'Alt-Import (Sicherung)';
const BLATT_GELOESCHT = 'Gelöscht'; // gelöschte Stationen werden hierher verschoben, nicht endgültig entfernt

// Beim Hinzufügen: ≤ 25 m gilt als dieselbe Station, bis 300 m wird nachgefragt (z. B. Raststätten-Gegenseite).
const NAEHE_WARNUNG_M = 300;

// Sammelt Meldungen, während die Wartungsseite Schritte ausführt (sonst null).
let MELDUNGS_PUFFER = null;

// Reihenfolge im Blatt (Christof, 18.09.2026): was er von Hand pflegt vorne, was das Script füllt hinten.
// Das Script liest und schreibt nach Spaltennamen; ordneSpalten_() bringt ein älteres Blatt in diese Reihenfolge.
const SPALTEN_PUNKTE = ['id', 'Maps-Link', 'Name', 'Straße', 'Notiz', 'kW', 'Anzahl', 'Richtung', 'Favorit',
  'Betreiber', 'Adresse', 'Lat', 'Lon', 'Status'];

/** Zeile in der Reihenfolge von SPALTEN_PUNKTE aus einem Objekt { Spaltenname: Wert }. */
function punkteZeile_(werte) {
  return SPALTEN_PUNKTE.map(function (k) { return werte[k] === undefined ? '' : werte[k]; });
}
const SPALTEN_ROUTEN = ['id', 'Name', 'Start', 'Via', 'Ziel', 'Länge km', 'Fahrzeit', 'Stand', 'Maps-Link'];

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
// Ingolstadt über Augsburg (Christof, 18.09.2026), geprüft am 18.09.2026 mit OSRM (0 m neben der Straße):
// B 17 bei Hurlach (erzwingt Landsberg → Augsburg) und B 300 bei Aichach (A 8 bei Friedberg-Derching, dann B 300).
const VIA_B17 = '48.13813,10.83188';
const VIA_B300 = '48.52578,11.23978';
const ZIEL_INGOLSTADT = '48.7650800,11.4237200';

// Zeilen für das Blatt „Routen": id, Name, Start, Via, Ziel.
// Zwei Savona- und zwei Ingolstadt-Varianten auf Christofs Wunsch (15. und 18.09.2026) — bewusste Abweichung vom Brief
// („eine Route pro Strecke"); die Mont-Blanc-Route ist gestrichen.
const STAMMSTRECKEN = [
  ['neuenrade', 'Morges – Neuenrade', START_MORGES, '', '51.2847342,7.7950369'],
  // Ohne Via wählt OpenRouteService den Weg über München (A 96 – A 99 – A 9); die id bleibt für bestehende Fahrten.
  ['ingolstadt', 'Morges – Ingolstadt (München)', START_MORGES, '', ZIEL_INGOLSTADT],
  ['ingolstadt_augsburg', 'Morges – Ingolstadt (Augsburg)', START_MORGES, VIA_B17 + ';' + VIA_B300, ZIEL_INGOLSTADT],
  ['savona_simplon', 'Morges – Savona (Simplon)', START_MORGES, VIA_SIMPLON, ZIEL_SAVONA],
  ['savona_bernhard', 'Morges – Savona (Gr. St. Bernhard)', START_MORGES, VIA_GR_ST_BERNHARD, ZIEL_SAVONA],
  // Weitere Routen legt Christof seit v0.17.0 per Google-Maps-Link an (Wartung → „Route hinzufügen").
];
// savona: Mont-Blanc-Variante; markomannenstrasse_2a: am 19.09.2026 falsch aus einem Link erzeugt (Wuppertal → Wien)
const ROUTEN_ENTFERNT = ['savona', 'markomannenstrasse_2a'];

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
      if (MELDUNGS_PUFFER) MELDUNGS_PUFFER.push(titel + (text ? '\n' + text : ''));
      return echt ? echt.alert(titel, text, knoepfe) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Web-App: Formular zum Bearbeiten und Hinzufügen (Christof, 15.09.2026).
// Nur mit dem eigenen Google-Konto nutzbar (appsscript.json: webapp.access = MYSELF),
// daher steht kein Kennwort in der öffentlichen App. Aufruf: …/exec?id=p023 oder …/exec?neu=1
// ---------------------------------------------------------------------------

const APP_URL = 'https://obitusde.github.io/ladeplanung/';
const FORMULAR_FELDER = ['Name', 'Betreiber', 'kW', 'Anzahl', 'Richtung', 'Favorit', 'Notiz', 'Straße'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  const modell = { appUrl: APP_URL, formularUrl: ScriptApp.getService().getUrl(), version: VERSION };
  if (p.seite === 'vergleich') {
    const routesText = githubLies_('routes.json');
    if (!routesText) return einfacheSeite_('routes.json nicht gefunden — bitte zuerst in der Wartung veröffentlichen.');
    modell.routen = vergleichsRouten_(JSON.parse(routesText));
    modell.vorwahl = { route: String(p.route || ''), richtung: p.richtung === 'rueck' ? 'rueck' : 'hin', nach: String(p.nach || '') };
    const seite = HtmlService.createTemplateFromFile('Vergleich');
    seite.modellJson = JSON.stringify(modell).replace(/</g, '\\u003c');
    return seite.evaluate()
      .setTitle('Ladeplanung – Vergleichswert eintragen')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.seite === 'kalibrieren') {
    let fahrt = null;
    try { fahrt = JSON.parse(p.fahrt || ''); } catch (e) { fahrt = null; }
    if (!fahrt || typeof fahrt !== 'object') return einfacheSeite_('Keine Fahrtdaten übergeben – bitte in der App „Angekommen" tippen.');
    modell.fahrt = fahrt;
    const seite = HtmlService.createTemplateFromFile('Kalibrieren');
    seite.modellJson = JSON.stringify(modell).replace(/</g, '\\u003c');
    return seite.evaluate()
      .setTitle('Ladeplanung – Fahrt kalibrieren')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.seite === 'preise') {
    const text = githubLies_(PREISE_DATEI);
    modell.preise = text ? JSON.parse(text) : { anbieter: [] };
    modell.schluessel = !!PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    const seite = HtmlService.createTemplateFromFile('Preise');
    seite.modellJson = JSON.stringify(modell).replace(/</g, '\\u003c');
    return seite.evaluate()
      .setTitle('Ladeplanung – Ladepreise')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.seite === 'wartung') {
    modell.status = wartungStatus_();
    modell.fokus = p.fokus === 'route' ? 'route' : ''; // aus dem App-Menü „Route hinzufügen"
    const seite = HtmlService.createTemplateFromFile('Wartung');
    seite.modellJson = JSON.stringify(modell).replace(/</g, '\\u003c');
    return seite.evaluate()
      .setTitle('Ladeplanung – Wartung & Status')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.id) {
    const punkt = /^p\d{1,5}$/.test(p.id) ? liesPunkt_(p.id) : null;
    if (!punkt) return einfacheSeite_('Ladepunkt „' + p.id + '" nicht gefunden.');
    modell.modus = 'bearbeiten';
    modell.punkt = punkt;
  } else {
    modell.modus = 'neu';
    modell.punkt = { link: p.link || '', Richtung: 'beide' };
  }
  const vorlage = HtmlService.createTemplateFromFile('Formular');
  vorlage.modellJson = JSON.stringify(modell).replace(/</g, '\\u003c');
  return vorlage.evaluate()
    .setTitle(modell.modus === 'neu' ? 'Ladepunkt hinzufügen' : 'Ladepunkt bearbeiten')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function einfacheSeite_(text) {
  const sicher = String(text).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  return HtmlService.createHtmlOutput('<p style="font:18px system-ui;padding:16px">' + sicher +
    '</p><p style="font:18px system-ui;padding:0 16px"><a href="' + APP_URL + '" target="_top">Zurück zur App</a></p>')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Wird vom Formular aufgerufen (google.script.run): ändert nur die Formularfelder, danach Export. */
function speicherePunkt(daten) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    const fehler = pruefeFormular_(daten, false);
    if (fehler) return { ok: false, fehler: fehler };
    const t = punkteBlattMitIndex_();
    const zeile = findeZeile_(t.blatt, t.sp, daten.id);
    if (!zeile) return { ok: false, fehler: 'Ladepunkt ' + daten.id + ' nicht gefunden.' };

    const neu = normalisiereFormular_(daten);
    const alt = t.blatt.getRange(zeile, 1, 1, t.blatt.getLastColumn()).getValues()[0];
    const geaendert = FORMULAR_FELDER.filter(function (f) { return String(alt[t.sp[f] - 1]) !== String(neu[f]); });
    if (geaendert.length === 0) return { ok: true, meldung: 'Keine Änderungen — nichts gespeichert.' };
    geaendert.forEach(function (f) { t.blatt.getRange(zeile, t.sp[f]).setValue(neu[f]); });
    SpreadsheetApp.flush();

    // Name oder Betreiber geleert → wieder aus dem Link ergänzen
    if (neu.Name === '' || neu.Betreiber === '') aufloeseLinks();
    const exp = exportJson();
    return {
      ok: true,
      meldung: 'Gespeichert: ' + geaendert.join(', ') + '.',
      warnung: exp.fehler ? 'Export fehlgeschlagen:\n' + exp.meldungen.join('\n') : '',
      punkt: punktAusExport_(exp.json, daten.id),
    };
  } finally {
    sperre.releaseLock();
  }
}

/** Wird vom Formular aufgerufen: prüft den Link, warnt vor Dubletten, legt die Zeile an, ergänzt und exportiert. */
function legePunktAn(daten) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    const fehler = pruefeFormular_(daten, true);
    if (fehler) return { ok: false, fehler: fehler };
    const link = String(daten.link).trim();

    let info;
    try {
      info = linkInfo_(link);
    } catch (e) {
      return { ok: false, fehler: 'Link nicht auflösbar: ' + e.message };
    }
    if (info.lat === null) {
      return { ok: false, fehler: 'Im Link stehen weder Koordinaten noch eine genaue Adresse. In Google Maps lange auf die Station drücken (Stecknadel), „Teilen" → „Link kopieren" und diesen Link einfügen.' };
    }

    const t = punkteBlattMitIndex_();
    const werte = t.blatt.getLastRow() >= 2 ? t.blatt.getRange(2, 1, t.blatt.getLastRow() - 1, t.blatt.getLastColumn()).getValues() : [];
    const bestehende = werte.map(function (z) {
      return { id: String(z[t.sp.id - 1]).trim(), name: String(z[t.sp.Name - 1]), lat: z[t.sp.Lat - 1], lon: z[t.sp.Lon - 1] };
    });
    if (!daten.trotzdem) {
      const naechste = naechsteStation_(bestehende, info.lat, info.lon);
      if (naechste && naechste.abstand_m <= DUBLETTE_MAX_M) return { ok: false, dublette: naechste };
      if (naechste && naechste.abstand_m <= NAEHE_WARNUNG_M) return { ok: false, naehe: naechste };
    }

    // ids gelöschter Stationen werden nicht neu vergeben
    const id = naechsteId_(bestehende.map(function (b) { return b.id; }).concat(geloeschteIds_()));
    const neu = normalisiereFormular_(daten);
    const zeile = new Array(t.blatt.getLastColumn()).fill('');
    zeile[t.sp.id - 1] = id;
    zeile[t.sp['Maps-Link'] - 1] = link;
    zeile[t.sp.Lat - 1] = runde_(info.lat, 6);
    zeile[t.sp.Lon - 1] = runde_(info.lon, 6);
    FORMULAR_FELDER.forEach(function (f) { zeile[t.sp[f] - 1] = neu[f]; });
    if (info.ausAdresse) zeile[t.sp.Status - 1] = STATUS_AUS_ADRESSE;
    t.blatt.appendRow(zeile);
    SpreadsheetApp.flush();

    aufloeseLinks(); // ergänzt nur leere Felder: Name mit Ort, Adresse, Betreiber
    const exp = exportJson();
    const punkt = punktAusExport_(exp.json, id);
    return {
      ok: true,
      meldung: 'Angelegt als ' + id + (punkt && punkt.name ? ': ' + punkt.name : '') + '.' +
        (info.ausAdresse ? '\nDer Link enthielt keine Koordinaten – sie wurden aus der Adresse ermittelt. Lage bei Bedarf in Google Maps prüfen.' : ''),
      warnung: exp.fehler ? 'Export fehlgeschlagen:\n' + exp.meldungen.join('\n') : '',
      punkt: punkt,
    };
  } finally {
    sperre.releaseLock();
  }
}

/** Wird vom Formular aufgerufen: verschiebt die Zeile ins Blatt „Gelöscht" (zurückholbar) und veröffentlicht. */
function loeschePunkt(id) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    if (!/^p\d{1,5}$/.test(String(id))) return { ok: false, fehler: 'Ungültige id.' };
    const t = punkteBlattMitIndex_();
    const zeile = findeZeile_(t.blatt, t.sp, id);
    if (!zeile) return { ok: false, fehler: 'Ladepunkt ' + id + ' nicht gefunden — vielleicht schon gelöscht?' };

    const ss = tabelle_();
    const koepfe = t.blatt.getRange(1, 1, 1, t.blatt.getLastColumn()).getValues()[0];
    let archiv = ss.getSheetByName(BLATT_GELOESCHT);
    if (!archiv) {
      archiv = ss.insertSheet(BLATT_GELOESCHT, ss.getSheets().length);
      archiv.getRange(1, 1, 1, koepfe.length + 1).setValues([koepfe.concat(['gelöscht am'])]).setFontWeight('bold');
      archiv.setFrozenRows(1);
    }
    const werte = t.blatt.getRange(zeile, 1, 1, koepfe.length).getValues()[0];
    // nach Spaltennamen, weil sich die Reihenfolge im Blatt Ladepunkte ändern kann; fehlende Köpfe hinten anhängen
    let archivKoepfe = archiv.getRange(1, 1, 1, archiv.getLastColumn()).getValues()[0];
    koepfe.forEach(function (k) {
      if (k === '' || archivKoepfe.indexOf(k) !== -1) return;
      archiv.getRange(1, archivKoepfe.length + 1).setValue(k).setFontWeight('bold');
      archivKoepfe = archivKoepfe.concat([k]);
    });
    archiv.appendRow(archivKoepfe.map(function (k) {
      if (k === 'gelöscht am') return new Date();
      const i = koepfe.indexOf(k);
      return i === -1 ? '' : werte[i];
    }));
    t.blatt.deleteRow(zeile);
    SpreadsheetApp.flush();

    const exp = exportJson();
    return {
      ok: true,
      meldung: 'Gelöscht: ' + id + ' ' + werte[t.sp.Name - 1] + '.\nDie Zeile liegt im Blatt „' + BLATT_GELOESCHT + '" und kann von dort zurückkopiert werden.',
      warnung: exp.fehler ? 'Veröffentlichen fehlgeschlagen:\n' + exp.meldungen.join('\n') : '',
    };
  } finally {
    sperre.releaseLock();
  }
}

/**
 * Wartungsseite: führt eine Aktion samt Folgeschritten aus, damit nichts in der falschen
 * Reihenfolge angestoßen wird (z. B. Routen berechnen → veröffentlichen).
 */
function wartungAusfuehren(aktion, wert) {
  const ablaeufe = {
    route_link: [function () { legeRouteAusLinkAn_(wert); }, berechneRouten, exportJson],
    export: [exportJson],
    links: [aufloeseLinks, exportJson],
    routen: [routenVorgabenUebernehmen, berechneRouten, exportJson],
    routen_neu: [routenVorgabenUebernehmen, berechneRoutenNeu, exportJson],
    bereinigen_vorschau: [function () { bereinigeIntern_('vorschau'); }],
    bereinigen: [function () { bereinigeIntern_('ausfuehren'); }, exportJson],
    kalibrieren: [function () {
      const erg = kalibriereUndVeroeffentliche_();
      meldungsUi_().alert('Verbrauchsmodell v' + VERSION, erg.text + (erg.fehler ? '\n' + erg.fehler : ''));
    }],
  };
  const schritte = ablaeufe[aktion];
  if (!schritte) return { ok: false, text: 'Unbekannte Aktion: ' + aktion };

  const sperre = LockService.getScriptLock();
  if (!sperre.tryLock(30000)) return { ok: false, text: 'Gerade läuft schon eine andere Änderung — bitte in einer Minute noch einmal.' };
  MELDUNGS_PUFFER = [];
  try {
    schritte.forEach(function (schritt) { schritt(); });
    return { ok: true, text: MELDUNGS_PUFFER.join('\n\n') || 'Fertig.', status: wartungStatus_() };
  } catch (e) {
    return { ok: false, text: MELDUNGS_PUFFER.concat(['Fehler: ' + e.message]).join('\n\n'), status: wartungStatus_() };
  } finally {
    MELDUNGS_PUFFER = null;
    sperre.releaseLock();
  }
}

/** Zustand für die Wartungsseite: Stationen, Routen (aktuell oder neu zu berechnen), letzte Veröffentlichung. */
function wartungStatus_() {
  const ss = tabelle_();
  const props = PropertiesService.getScriptProperties();
  const status = { punkte: 0, ohneKoordinaten: 0, nichtAufloesbar: 0, ohneRoute: [], routen: [], letzterExport: '' };

  const punkte = ss.getSheetByName(BLATT_PUNKTE);
  if (punkte && punkte.getLastRow() >= 2) {
    const sp = spaltenIndex_(punkte);
    punkte.getRange(2, 1, punkte.getLastRow() - 1, punkte.getLastColumn()).getValues().forEach(function (z) {
      const id = String(z[sp.id - 1]).trim();
      if (!id) return;
      status.punkte++;
      const st = String(z[sp.Status - 1]);
      if (z[sp.Lat - 1] === '' && String(z[sp['Maps-Link'] - 1]).trim() !== '') status.ohneKoordinaten++;
      if (st.indexOf(STATUS_FEHLER_PRAEFIX) === 0) status.nichtAufloesbar++;
      if (istOhneRouteStatus_(st)) status.ohneRoute.push(id + ' ' + z[sp.Name - 1]);
    });
  }

  const routen = ss.getSheetByName(BLATT_ROUTEN);
  if (routen && routen.getLastRow() >= 2) {
    const sp = spaltenIndex_(routen);
    routen.getRange(2, 1, routen.getLastRow() - 1, routen.getLastColumn()).getValues().forEach(function (z) {
      const f = function (name) { return String(z[sp[name] - 1]).trim(); };
      const id = f('id');
      if (!id) return;
      const standRoh = z[sp.Stand - 1];
      const stand = standRoh instanceof Date ? Utilities.formatDate(standRoh, 'Europe/Zurich', 'dd.MM.yyyy HH:mm') : String(standRoh);
      const eingabe = [f('Start'), f('Via'), f('Ziel')].join('|');
      const aktuell = stand !== '' && stand.indexOf('Fehler') !== 0 && props.getProperty('EINGABE_' + id) === eingabe + '#f' + LINIEN_FORMAT;
      status.routen.push({ id: id, name: f('Name'), laenge: f('Länge km'), stand: stand, aktuell: aktuell });
    });
  }

  try {
    const text = githubLies_('routes.json');
    if (text) status.letzterExport = JSON.parse(text).erzeugt || '';
  } catch (e) {
    status.letzterExport = '';
  }

  const fahrtenBlatt = ss.getSheetByName(BLATT_FAHRTEN);
  status.modell = { gespeichert: fahrtenBlatt ? Math.max(0, fahrtenBlatt.getLastRow() - 1) : 0, kalibrierung: null };
  try {
    const text = githubLies_('modell.json');
    if (text) status.modell.kalibrierung = JSON.parse(text).kalibrierung || null;
  } catch (e) {
    status.modell.kalibrierung = null;
  }
  return status;
}

// ---------------------------------------------------------------------------
// Verbrauchsmodell (Christof, 15.09.2026). Die App errechnet den Akkubedarf je Strecke.
// Optional: „Losfahren" / „Angekommen" in der App → Formular → Zeile im Blatt „Fahrten" →
// Kalibrierung über alle gespeicherten Fahrten → modell.json im Repo.
// Physikalischer Kern identisch zu energieAnteile() in index.html (geprüft in tests/test-modell.js).
// Startwerte abgeglichen mit EV Database, Born 58 kWh bei 110 km/h:
// 18,1 kWh/100 km bei 23 °C ohne Klima, 23,2 kWh/100 km bei −10 °C mit Heizung.
// ---------------------------------------------------------------------------

const BLATT_FAHRTEN = 'Fahrten';
const SPALTEN_FAHRTEN = [
  'erfasst', 'Route', 'Richtung', 'Start', 'Ende', 'Start Lat', 'Start Lon', 'Ende Lat', 'Ende Lon',
  'km', 'hm auf', 'hm ab', 'Dauer h', 'Ø km/h Bordcomputer', 'km/h verwendet', 'Zusatzgewicht kg',
  'Temp Start', 'Temp Ende', 'Temp Ø', 'Akku Start %', 'Akku Ende %', 'Akku erwartet %',
  'Verbrauch kWh', 'Anteil Fahrt kWh', 'Anteil Höhe kWh', 'Anteil Heizung kWh', 'Modell kWh', 'Abweichung %',
  'verwenden', 'Notiz', 'Quelle', 'Kalibrierung',
];
// Gewicht je Quelle in der Kalibrierung: echte Fahrten zählen voll, Schätzungen anderer Apps nur wenig.
const QUELLEN_VERGLEICH = ['ABRP', 'My CUPRA'];
const MIN_FAHRTEN_EINZELFAKTOREN = 5;
const TEMPERATUR_ERSATZ_C = 15;

const MODELL_STANDARD = {
  version: 1,
  fahrzeug: { name: 'Cupra Born 58 kWh', kapazitaet_kwh: 58, masse_kg: 1811, fahrer_kg: 80 },
  physik: { cda: 0.63, crr: 0.008, eta: 0.78, rekuperation: 0.6, hilfsleistung_kw: 0.3, heiz_kw_pro_grad: 0.14, heiz_schwelle_c: 18 },
  korrektur: { gesamt: 1, fahrt: 1, hoehe: 1, heizung: 1 },
};

/** Energieanteile in kWh (unkorrigiert): Fahrwiderstand, Höhe (bergauf minus Rückgewinnung), Heizung/Nebenverbraucher. */
function energieAnteile_(modell, km, hmAuf, hmAb, kmh, temperatur, zusatzKg) {
  const ph = modell.physik;
  const masse = modell.fahrzeug.masse_kg + modell.fahrzeug.fahrer_kg + (Number(zusatzKg) || 0);
  const geschw = Math.max(20, Number(kmh) || 0);
  const v = geschw / 3.6;
  const stunden = km / geschw;
  const luftdichte = 1.293 * 273.15 / (273.15 + temperatur);
  const leistungRad = 0.5 * luftdichte * ph.cda * v * v * v + ph.crr * masse * 9.81 * v;
  return {
    fahrt: leistungRad / ph.eta / 1000 * stunden,
    hoehe: masse * 9.81 * (hmAuf / ph.eta - hmAb * ph.eta * ph.rekuperation) / 3.6e6,
    heiz: (ph.hilfsleistung_kw + Math.max(0, ph.heiz_schwelle_c - temperatur) * ph.heiz_kw_pro_grad) * stunden,
  };
}

/** Korrigierter Energiebedarf in kWh (nie negativ). */
function energieKwh_(modell, a) {
  const k = modell.korrektur;
  return Math.max(0, k.gesamt * (k.fahrt * a.fahrt + k.hoehe * a.hoehe + k.heizung * a.heiz));
}

const AUSREISSER_ABWEICHUNG = 0.35;  // Verhältnis Wert/Physik mehr als 35 % neben dem Median → nicht verwenden
const MIN_TEMPERATURSPANNE_C = 10;    // darunter lässt sich der Heizungsanteil nicht von den übrigen Anteilen trennen

/**
 * Kalibrierung aus Fahrten [{ w, real, a: [fahrt, hoehe, heiz], temp }] (kWh).
 * 1. Ausreißer (ab 3 Werten): Verhältnis Wert/Physik weicht mehr als 35 % vom Median ab → nicht verwenden.
 * 2. Gesamtfaktor aus den übrigen Werten (gewichtete kleinste Quadrate).
 * 3. Ab MIN_FAHRTEN_EINZELFAKTOREN: Einzelfaktoren relativ zum Gesamtfaktor, per Ridge-Regression Richtung 1.
 *    Die Heizung nur, wenn die Temperaturen mindestens 10 °C auseinanderliegen — sonst ist ihr Anteil nicht bestimmbar.
 *    (15.09.2026: sechs ABRP-Werte bei ~24 °C mit einem Ausreißer trieben ihn in v0.14.0 auf den Anschlag 2,5.)
 * Gibt { korrektur, methode, abweichung, ausreisser: [bool je Fahrt] } zurück.
 */
function kalibriere_(fahrten, kapazitaet) {
  const k = { gesamt: 1, fahrt: 1, hoehe: 1, heizung: 1 };
  const begrenze = function (x, min, max) { return Math.min(max, Math.max(min, x)); };
  const physik = function (f) { return f.a[0] + f.a[1] + f.a[2]; };

  const ausreisser = fahrten.map(function () { return false; });
  if (fahrten.length >= 3) {
    const verhaeltnis = fahrten.map(function (f) { return f.real / Math.max(0.1, physik(f)); });
    const sortiert = verhaeltnis.slice().sort(function (a, b) { return a - b; });
    const mitte = Math.floor(sortiert.length / 2);
    const median = sortiert.length % 2 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
    verhaeltnis.forEach(function (v, i) { ausreisser[i] = Math.abs(v / median - 1) > AUSREISSER_ABWEICHUNG; });
  }
  const gute = fahrten.filter(function (f, i) { return !ausreisser[i]; });
  let methode = 'Physik-Startwerte';

  if (gute.length > 0) {
    let zaehler = 0, nenner = 0;
    gute.forEach(function (f) {
      const m = physik(f);
      zaehler += f.w * f.real * m;
      nenner += f.w * m * m;
    });
    k.gesamt = begrenze(nenner > 0 ? zaehler / nenner : 1, 0.6, 1.6);
    methode = 'Gesamtfaktor aus ' + gute.length + ' Wert(en)';
  }

  if (gute.length >= MIN_FAHRTEN_EINZELFAKTOREN) {
    const temps = gute.map(function (f) { return f.temp; }).filter(function (t) { return typeof t === 'number' && isFinite(t); });
    const spanne = temps.length ? Math.max.apply(null, temps) - Math.min.apply(null, temps) : 0;
    const mitHeizung = spanne >= MIN_TEMPERATURSPANNE_C;
    const idx = mitHeizung ? [0, 1, 2] : [0, 1];
    const A = idx.map(function () { return idx.map(function () { return 0; }); });
    const b = idx.map(function () { return 0; });
    let skala = 0;
    gute.forEach(function (f) {
      const ziel = f.real / k.gesamt - (mitHeizung ? 0 : f.a[2]); // ohne Heizungsfaktor: Anteil fest mit 1
      skala += f.w * physik(f) * physik(f);
      idx.forEach(function (ii, i) {
        b[i] += f.w * f.a[ii] * ziel;
        idx.forEach(function (jj, j) { A[i][j] += f.w * f.a[ii] * f.a[jj]; });
      });
    });
    const lambda = 0.1 * skala / gute.length; // gleich stark für alle Anteile: kleine Anteile bleiben nahe 1
    for (let i = 0; i < idx.length; i++) { A[i][i] += lambda; b[i] += lambda; }
    const c = loeseLGS_(A, b);
    k.fahrt = begrenze(c[0], 0.7, 1.3);
    k.hoehe = begrenze(c[1], 0.5, 1.5);
    if (mitHeizung) k.heizung = begrenze(c[2], 0.5, 2);
    methode = 'Gesamt- und Einzelfaktoren aus ' + gute.length + ' Werten' + (mitHeizung ? '' : ' (Heizung fest, Temperaturen zu ähnlich)');
  }
  if (gute.length < fahrten.length) methode += ', ' + (fahrten.length - gute.length) + ' Ausreißer nicht verwendet';

  let summe = 0, gewichte = 0;
  gute.forEach(function (f) {
    summe += f.w * Math.abs(energieKwh_({ korrektur: k }, { fahrt: f.a[0], hoehe: f.a[1], heiz: f.a[2] }) - f.real);
    gewichte += f.w;
  });
  return { korrektur: k, methode: methode, abweichung: gewichte > 0 ? runde_(summe / gewichte / kapazitaet * 100, 1) : null, ausreisser: ausreisser };
}

/** Gauß-Elimination mit Pivotsuche für ein kleines n×n-System; bei Singularität alle Faktoren 1. */
function loeseLGS_(A, b) {
  const n = b.length;
  const m = A.map(function (z, i) { return z.concat([b[i]]); });
  for (let s = 0; s < n; s++) {
    let p = s;
    for (let r = s + 1; r < n; r++) if (Math.abs(m[r][s]) > Math.abs(m[p][s])) p = r;
    const t = m[s]; m[s] = m[p]; m[p] = t;
    if (Math.abs(m[s][s]) < 1e-12) return b.map(function () { return 1; });
    for (let r = s + 1; r < n; r++) {
      const f = m[r][s] / m[s][s];
      for (let c = s; c <= n; c++) m[r][c] -= f * m[s][c];
    }
  }
  const x = b.map(function () { return 0; });
  for (let s = n - 1; s >= 0; s--) {
    let summe = m[s][n];
    for (let c = s + 1; c < n; c++) summe -= m[s][c] * x[c];
    x[s] = summe / m[s][s];
  }
  return x;
}

function loese3_(A, b) { return loeseLGS_(A, b); }

/**
 * Rechnet alle Zeilen des Blatts „Fahrten" nach und kalibriert — rein rechnerisch (testbar ohne Apps Script).
 * zeilen: [{ km, hmAuf, hmAb, kmh, temp, zusatzKg, start, ende, quelle, bordcomputer, dauer, verwenden, notiz }]
 * Gibt { modell, zeilen: [{ real, a, gueltig, verwenden, ausreisser, modellKwh, abweichung, status }], text } zurück.
 */
function kalibriereZeilen_(zeilen) {
  const kap = MODELL_STANDARD.fahrzeug.kapazitaet_kwh;
  const fahrten = [];
  const erg = zeilen.map(function (z) {
    const quelle = String(z.quelle || '').trim() || 'gemessen';
    const temp = typeof z.temp === 'number' && isFinite(z.temp) ? z.temp : TEMPERATUR_ERSATZ_C;
    const a = energieAnteile_(MODELL_STANDARD, Number(z.km), Number(z.hmAuf), Number(z.hmAb), Number(z.kmh) || 120, temp, Number(z.zusatzKg) || 0);
    const real = (Number(z.start) - Number(z.ende)) / 100 * kap;
    const gueltig = isFinite(a.fahrt) && isFinite(real) && real > 0.5 && Number(z.km) >= 10;
    const gewicht = gewichtFuer_(quelle, !!z.bordcomputer, !!z.dauer);
    const abgewaehlt = String(z.verwenden || '').trim().toLowerCase() === 'nein';
    const e = { a: a, real: real, quelle: quelle, notiz: String(z.notiz || ''), gueltig: gueltig, gewicht: gewicht,
      verwenden: gueltig && gewicht > 0 && !abgewaehlt, ausreisser: false, modellKwh: null, abweichung: null, status: '' };
    if (!gueltig) e.status = 'nicht verwendet: ungültig (unter 10 km oder Akku nicht gesunken)';
    else if (abgewaehlt) e.status = 'nicht verwendet: auf „nein" gesetzt';
    else if (gewicht === 0) e.status = 'nicht verwendet: Fahrzeit fehlt';
    if (e.verwenden) {
      e.fahrtIndex = fahrten.length;
      fahrten.push({ w: gewicht, real: real, a: [a.fahrt, a.hoehe, a.heiz], temp: temp });
    }
    return e;
  });

  const kal = kalibriere_(fahrten, kap);
  const modell = JSON.parse(JSON.stringify(MODELL_STANDARD));
  modell.erzeugt = new Date().toISOString();
  modell.korrektur = kal.korrektur;

  erg.forEach(function (e) {
    if (e.verwenden && kal.ausreisser[e.fahrtIndex]) { e.ausreisser = true; e.verwenden = false; }
    if (e.gueltig) {
      e.modellKwh = energieKwh_(modell, e.a);
      e.abweichung = (e.modellKwh - e.real) / kap * 100;
    }
    if (e.ausreisser) e.status = 'nicht verwendet: Ausreißer (Modell ' + Math.round(e.modellKwh / kap * 100) + ' %, Wert ' + Math.round(e.real / kap * 100) + ' %)';
    else if (e.verwenden) e.status = 'verwendet (Gewicht ' + String(e.gewicht).replace('.', ',') + ')';
  });

  const verwendet = erg.filter(function (e) { return e.verwenden; });
  modell.kalibrierung = {
    fahrten: verwendet.length, abweichung_prozent: kal.abweichung, stand: modell.erzeugt, methode: kal.methode,
    quellen: quellenStatistik_(verwendet.map(function (e) { return { quelle: e.quelle, diff: e.abweichung }; })),
  };

  const k = kal.korrektur;
  let text = 'Verbrauchsmodell: ' + kal.methode + '.';
  if (verwendet.length) {
    text += '\nKorrektur: gesamt ' + runde_(k.gesamt, 2) + ', Fahrt ' + runde_(k.fahrt, 2) + ', Höhe ' + runde_(k.hoehe, 2) + ', Heizung ' + runde_(k.heizung, 2) +
      '\nØ Abweichung: ' + String(kal.abweichung).replace('.', ',') + ' % Akku je Wert.';
  }
  const ausreisser = erg.filter(function (e) { return e.ausreisser; });
  if (ausreisser.length) text += '\nNicht verwendet (Ausreißer): ' + ausreisser.map(function (e) { return e.notiz || '–'; }).join('; ');
  const q = modell.kalibrierung.quellen;
  Object.keys(q).forEach(function (name) {
    text += '\n' + name + ': ' + q[name].n + ' × Ø ' + String(q[name].abweichung).replace('.', ',') + ' % Abweichung (Modell im Schnitt ' +
      (q[name].tendenz >= 0 ? '+' : '') + String(q[name].tendenz).replace('.', ',') + ' %)';
  });
  return { modell: modell, zeilen: erg, text: text };
}

/** Wird vom Kalibrierungsformular aufgerufen: Fahrt speichern, Temperaturen holen, neu kalibrieren. */
function speichereFahrt(daten) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    const fehler = pruefeFahrt_(daten);
    if (fehler) return { ok: false, fehler: fehler };
    const f = normalisiereFahrt_(daten);

    const tStart = temperaturBei_(f.start_lat, f.start_lon, f.start_zeit);
    const tEnde = temperaturBei_(f.ende_lat, f.ende_lon, f.ende_zeit);
    const vorhanden = [tStart, tEnde].filter(function (t) { return t !== null; });
    const tMittel = vorhanden.length ? vorhanden.reduce(function (a, b) { return a + b; }, 0) / vorhanden.length : null;
    const dauer = (new Date(f.ende_zeit).getTime() - new Date(f.start_zeit).getTime()) / 3.6e6;
    const kmh = f.bordcomputer_kmh || (dauer > 0 ? f.km / dauer : f.geschwindigkeit);

    const blatt = fahrtenBlatt_();
    const zeile = SPALTEN_FAHRTEN.map(function () { return ''; });
    const setze = function (spalte, wert) { zeile[SPALTEN_FAHRTEN.indexOf(spalte)] = wert; };
    setze('erfasst', new Date());
    setze('Route', f.route); setze('Richtung', f.richtung);
    setze('Start', new Date(f.start_zeit)); setze('Ende', new Date(f.ende_zeit));
    setze('Start Lat', f.start_lat); setze('Start Lon', f.start_lon); setze('Ende Lat', f.ende_lat); setze('Ende Lon', f.ende_lon);
    setze('km', runde_(f.km, 1)); setze('hm auf', Math.round(f.hm_auf)); setze('hm ab', Math.round(f.hm_ab));
    setze('Dauer h', runde_(dauer, 2)); setze('Ø km/h Bordcomputer', f.bordcomputer_kmh || ''); setze('km/h verwendet', Math.round(kmh));
    setze('Zusatzgewicht kg', f.zusatzgewicht);
    setze('Temp Start', tStart === null ? '' : runde_(tStart, 1)); setze('Temp Ende', tEnde === null ? '' : runde_(tEnde, 1));
    setze('Temp Ø', tMittel === null ? '' : runde_(tMittel, 1));
    setze('Akku Start %', f.start_soc); setze('Akku Ende %', f.ende_soc);
    setze('Akku erwartet %', f.erwartet === null ? '' : Math.round(f.erwartet));
    setze('verwenden', 'ja'); setze('Notiz', f.notiz); setze('Quelle', 'gemessen');
    blatt.appendRow(zeile);
    SpreadsheetApp.flush();

    const kal = kalibriereUndVeroeffentliche_();
    const vorher = f.erwartet === null ? '' : 'Erwartet waren ' + Math.round(f.erwartet) + ' %, tatsächlich ' + f.ende_soc + ' % (' +
      (f.ende_soc - Math.round(f.erwartet) >= 0 ? '+' : '') + (f.ende_soc - Math.round(f.erwartet)) + ').\n';
    return {
      ok: true,
      meldung: 'Fahrt gespeichert: ' + runde_(f.km, 0) + ' km, ' + (tMittel === null ? 'Temperatur unbekannt (15 °C angenommen)' : 'Ø ' + runde_(tMittel, 0) + ' °C') +
        ', ' + Math.round(kmh) + ' km/h' + (f.bordcomputer_kmh ? ' (Bordcomputer)' : ' (aus der Fahrzeit geschätzt)') + '.\n' + vorher + '\n' + kal.text,
      warnung: kal.fehler || '',
    };
  } finally {
    sperre.releaseLock();
  }
}

function pruefeFahrt_(d) {
  if (!d || typeof d !== 'object') return 'Keine Fahrtdaten übermittelt.';
  if (!/^[a-z0-9_]{1,40}$/.test(String(d.route || ''))) return 'Unbekannte Route.';
  if (d.richtung !== 'hin' && d.richtung !== 'rueck') return 'Unbekannte Richtung.';
  const soc = function (x) { const n = Number(x); return String(x).trim() !== '' && isFinite(n) && n >= 0 && n <= 100; };
  if (!soc(d.start_soc)) return 'Akkustand beim Start bitte als Zahl von 0 bis 100.';
  if (!soc(d.ende_soc)) return 'Akkustand bei Ankunft bitte als Zahl von 0 bis 100.';
  if (Number(d.ende_soc) >= Number(d.start_soc)) return 'Der Akkustand bei Ankunft muss kleiner sein als beim Start. (Unterwegs geladen? Dann diese Fahrt nicht speichern.)';
  if (!(Number(d.km) >= 1)) return 'Die Strecke ist zu kurz für eine Kalibrierung.';
  if (isNaN(new Date(d.start_zeit)) || isNaN(new Date(d.ende_zeit)) || new Date(d.ende_zeit) <= new Date(d.start_zeit)) return 'Start- oder Ankunftszeit ungültig.';
  for (const feld of ['start_lat', 'start_lon', 'ende_lat', 'ende_lon']) if (!isFinite(Number(d[feld]))) return 'Position fehlt.';
  const bc = String(d.bordcomputer_kmh === undefined || d.bordcomputer_kmh === null ? '' : d.bordcomputer_kmh).trim();
  if (bc !== '' && !(Number(bc) >= 20 && Number(bc) <= 200)) return 'Ø-Geschwindigkeit bitte zwischen 20 und 200 km/h.';
  const zg = String(d.zusatzgewicht === undefined || d.zusatzgewicht === null ? '' : d.zusatzgewicht).trim();
  if (zg !== '' && !(Number(zg) >= 0 && Number(zg) <= 1000)) return 'Zusatzgewicht bitte zwischen 0 und 1000 kg.';
  return '';
}

function normalisiereFahrt_(d) {
  const zahl = function (x, ersatz) { const s = String(x === undefined || x === null ? '' : x).trim(); return s === '' ? ersatz : Number(s); };
  return {
    route: d.route, richtung: d.richtung, start_zeit: d.start_zeit, ende_zeit: d.ende_zeit,
    start_lat: Number(d.start_lat), start_lon: Number(d.start_lon), ende_lat: Number(d.ende_lat), ende_lon: Number(d.ende_lon),
    km: Number(d.km), hm_auf: zahl(d.hm_auf, 0), hm_ab: zahl(d.hm_ab, 0),
    start_soc: Number(d.start_soc), ende_soc: Number(d.ende_soc), erwartet: zahl(d.erwartet, null),
    geschwindigkeit: zahl(d.geschwindigkeit, 120), bordcomputer_kmh: zahl(d.bordcomputer_kmh, null),
    zusatzgewicht: zahl(d.zusatzgewicht, 0), notiz: normalisiereFormular_({ Notiz: d.notiz }).Notiz,
  };
}

function fahrtenBlatt_() {
  const ss = tabelle_();
  let blatt = ss.getSheetByName(BLATT_FAHRTEN);
  if (!blatt) {
    blatt = ss.insertSheet(BLATT_FAHRTEN, ss.getSheets().length);
    blatt.setFrozenRows(1);
  }
  // Neue Blätter haben nur 26 Spalten — vor dem Schreiben der Köpfe erweitern
  if (blatt.getMaxColumns() < SPALTEN_FAHRTEN.length) {
    blatt.insertColumnsAfter(blatt.getMaxColumns(), SPALTEN_FAHRTEN.length - blatt.getMaxColumns());
  }
  // Fehlende Köpfe ergänzen: leeres Blatt oder ältere Fassung ohne spätere Spalten (z. B. „Quelle")
  const koepfe = blatt.getRange(1, 1, 1, SPALTEN_FAHRTEN.length).getValues()[0];
  koepfe.forEach(function (k, i) {
    if (k === '') blatt.getRange(1, i + 1).setValue(SPALTEN_FAHRTEN[i]).setFontWeight('bold');
  });
  return blatt;
}

/** Gewicht einer Zeile in der Kalibrierung. */
function gewichtFuer_(quelle, hatBordcomputer, hatDauer) {
  // Vergleichswerte ohne Fahrzeit zählen nicht: das angenommene Tempo verfälscht sie stärker, als sie nützen
  // (15.09.2026: drei ABRP-Werte mit angenommenen 120 km/h drückten den Faktor auf 0,80 statt 0,92).
  if (QUELLEN_VERGLEICH.indexOf(quelle) !== -1) return hatDauer ? 0.3 : 0;
  return hatBordcomputer ? 1 : 0.5;
}

/** Abweichung Modell − Wert je Quelle in Prozentpunkten Akku: { quelle: { n, abweichung, tendenz } }. */
function quellenStatistik_(eintraege) {
  const s = {};
  eintraege.forEach(function (e) {
    const q = s[e.quelle] || (s[e.quelle] = { n: 0, abs: 0, summe: 0 });
    q.n++;
    q.abs += Math.abs(e.diff);
    q.summe += e.diff;
  });
  const erg = {};
  Object.keys(s).forEach(function (k) {
    erg[k] = { n: s[k].n, abweichung: runde_(s[k].abs / s[k].n, 1), tendenz: runde_(s[k].summe / s[k].n, 1) };
  });
  return erg;
}

// ---------------------------------------------------------------------------
// Vergleichswerte aus ABRP / My CUPRA (Christof, 15.09.2026): Strecke von Station X nach Y,
// Akku Start und Ankunft laut App. Kilometer und Höhenmeter rechnet das Script aus den Routendaten.
// ---------------------------------------------------------------------------

/** Routen mit ihren Stationen für die Auswahllisten im Formular. */
function vergleichsRouten_(json) {
  return json.routen.map(function (r) {
    const stationen = [];
    json.punkte.forEach(function (p) {
      const z = (p.zuordnung || []).filter(function (x) { return x.route === r.id; })[0];
      if (z) stationen.push({ id: p.id, name: kurznameServer_(p.name), km: Math.round(z.km), richtung: p.richtung, quer_km: z.quer_km || 0 });
    });
    return { id: r.id, name: r.name, laenge_km: r.laenge_km, stationen: stationen };
  });
}

function kurznameServer_(name) {
  const kurz = String(name || '')
    .replace(/[-\s]*(ladestation|ladepunkt|ladesäule|charging station|station de recharge|stazione di ricarica)(?=$|[\s,.-])/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return kurz || String(name || '');
}

/** Position auf der Route: 'anfang' (km 0), 'ende' (Routenende) oder eine zugeordnete Station. */
function positionAufRoute_(json, linie, routeId, id) {
  if (id === 'anfang' || id === 'ende') {
    const p = id === 'anfang' ? linie[0] : linie[linie.length - 1];
    const route = json.routen.filter(function (r) { return r.id === routeId; })[0];
    const teile = String(route ? route.name : '').split(/\s+[–-]\s+/);
    return { km: p[2], hm_hin: p[3], hm_rueck: p[4], lat: p[0], lon: p[1], quer: 0, name: (id === 'anfang' ? teile[0] : teile[1]) || id };
  }
  const punkt = json.punkte.filter(function (x) { return x.id === id; })[0];
  const z = punkt && (punkt.zuordnung || []).filter(function (x) { return x.route === routeId; })[0];
  if (!z) return null;
  return { km: z.km, hm_hin: z.hm_hin, hm_rueck: z.hm_rueck, lat: punkt.lat, lon: punkt.lon, quer: z.quer_km || 0, name: kurznameServer_(punkt.name) };
}

/** Kilometer, Anstieg und Gefälle in Fahrtrichtung — identisch zu streckenwerte() in index.html. */
function streckenwerte_(richtung, von, bis) {
  const hin = richtung === 'hin';
  return {
    km: Math.max(0, hin ? bis.km - von.km : von.km - bis.km),
    auf: Math.max(0, hin ? bis.hm_hin - von.hm_hin : von.hm_rueck - bis.hm_rueck),
    ab: Math.max(0, hin ? bis.hm_rueck - von.hm_rueck : von.hm_hin - bis.hm_hin),
  };
}

/** „2:10", „2h10", „2.10" oder Minuten („130") → Minuten; leer → null; unlesbar → NaN. */
function parseFahrzeit_(text) {
  const t = String(text === undefined || text === null ? '' : text).trim();
  if (t === '') return null;
  let m = t.match(/^(\d{1,2})\s*[:h.]\s*(\d{1,2})\s*(min)?$/i);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d{1,3})\s*(min)?$/i);
  if (m) return Number(m[1]);
  return NaN;
}

function pruefeVergleich_(d) {
  if (!d || typeof d !== 'object') return 'Keine Daten übermittelt.';
  if (QUELLEN_VERGLEICH.indexOf(d.quelle) === -1) return 'Bitte die Quelle wählen: ABRP oder My CUPRA.';
  if (!/^[a-z0-9_]{1,40}$/.test(String(d.route || ''))) return 'Bitte eine Route wählen.';
  if (d.richtung !== 'hin' && d.richtung !== 'rueck') return 'Bitte die Richtung wählen.';
  const ort = /^(anfang|ende|p\d{1,5})$/;
  if (!ort.test(String(d.von || '')) || !ort.test(String(d.nach || ''))) return 'Bitte „Von" und „Nach" wählen.';
  if (d.von === d.nach) return '„Von" und „Nach" müssen verschieden sein.';
  const soc = function (x) { const n = Number(x); return String(x === undefined || x === null ? '' : x).trim() !== '' && isFinite(n) && n >= 0 && n <= 100; };
  if (!soc(d.start_soc)) return 'Akku Start bitte als Zahl von 0 bis 100.';
  if (!soc(d.ende_soc)) return 'Akku Ankunft bitte als Zahl von 0 bis 100.';
  if (Number(d.ende_soc) >= Number(d.start_soc)) return 'Akku Ankunft muss kleiner sein als Akku Start.';
  const minuten = parseFahrzeit_(d.fahrzeit);
  if (minuten === null) return 'Bitte die Fahrzeit laut App eintragen (z. B. 2:10) – ohne sie ist der Vergleich zu ungenau.';
  if (!(minuten > 0)) return 'Fahrzeit bitte als 2:10 oder in Minuten.';
  const t = String(d.temperatur === undefined || d.temperatur === null ? '' : d.temperatur).trim();
  if (t !== '' && !(Number(t) >= -30 && Number(t) <= 45)) return 'Temperatur bitte zwischen −30 und 45 °C.';
  return '';
}

/** Das veröffentlichte Modell (mit Korrekturen), sonst die Startwerte. */
function aktuellesModell_() {
  try {
    const text = githubLies_('modell.json');
    const m = text ? JSON.parse(text) : null;
    if (m && m.physik && m.fahrzeug && m.korrektur) return m;
  } catch (e) { /* Startwerte */ }
  return MODELL_STANDARD;
}

/** Wird vom Formular „Vergleichswert" aufgerufen: Zeile im Blatt „Fahrten", danach Kalibrierung. */
function speichereVergleich(daten) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    const fehler = pruefeVergleich_(daten);
    if (fehler) return { ok: false, fehler: fehler };

    const routesText = githubLies_('routes.json');
    const linienText = githubLies_(LINIEN_ORDNER + '/' + daten.route + '.json');
    if (!routesText || !linienText) return { ok: false, fehler: 'Routendaten nicht gefunden — bitte in der Wartung „Routen berechnen".' };
    const json = JSON.parse(routesText);
    const linie = JSON.parse(linienText).linie;

    const von = positionAufRoute_(json, linie, daten.route, daten.von);
    const nach = positionAufRoute_(json, linie, daten.route, daten.nach);
    if (!von || !nach) return { ok: false, fehler: 'Eine der Stationen ist dieser Route nicht zugeordnet.' };
    const w = streckenwerte_(daten.richtung, von, nach);
    if (w.km < 1) return { ok: false, fehler: '„Nach" muss in Fahrtrichtung hinter „Von" liegen.' };
    const km = w.km + von.quer + nach.quer;

    const minuten = parseFahrzeit_(daten.fahrzeit);
    const kmh = minuten ? km / (minuten / 60) : null;
    if (kmh !== null && (kmh < 30 || kmh > 180)) return { ok: false, fehler: 'Fahrzeit passt nicht zur Strecke (' + Math.round(kmh) + ' km/h bei ' + Math.round(km) + ' km).' };

    const tEingabe = String(daten.temperatur === undefined || daten.temperatur === null ? '' : daten.temperatur).trim();
    const temp = tEingabe !== '' ? Number(tEingabe) : temperaturBei_((von.lat + nach.lat) / 2, (von.lon + nach.lon) / 2, new Date().toISOString());
    const tempRechnung = temp === null ? TEMPERATUR_ERSATZ_C : temp;

    const kap = MODELL_STANDARD.fahrzeug.kapazitaet_kwh;
    const modellVorher = aktuellesModell_();
    const vorher = energieKwh_(modellVorher, energieAnteile_(modellVorher, km, w.auf, w.ab, kmh || 120, tempRechnung, 0)) / kap * 100;
    const start = Number(daten.start_soc), ende = Number(daten.ende_soc);

    const blatt = fahrtenBlatt_();
    const zeile = SPALTEN_FAHRTEN.map(function () { return ''; });
    const setze = function (spalte, wert) { zeile[SPALTEN_FAHRTEN.indexOf(spalte)] = wert; };
    setze('erfasst', new Date()); setze('Route', daten.route); setze('Richtung', daten.richtung);
    setze('Start Lat', runde_(von.lat, 5)); setze('Start Lon', runde_(von.lon, 5)); setze('Ende Lat', runde_(nach.lat, 5)); setze('Ende Lon', runde_(nach.lon, 5));
    setze('km', runde_(km, 1)); setze('hm auf', Math.round(w.auf)); setze('hm ab', Math.round(w.ab));
    setze('Dauer h', minuten ? runde_(minuten / 60, 2) : '');
    setze('km/h verwendet', Math.round(kmh || 120));
    setze('Zusatzgewicht kg', 0);
    setze('Temp Ø', temp === null ? '' : runde_(temp, 1));
    setze('Akku Start %', start); setze('Akku Ende %', ende); setze('Akku erwartet %', Math.round(start - vorher));
    setze('verwenden', 'ja');
    setze('Notiz', normalisiereFormular_({ Notiz: von.name + ' → ' + nach.name + (daten.notiz ? ' · ' + daten.notiz : '') }).Notiz);
    setze('Quelle', daten.quelle);
    blatt.appendRow(zeile);
    SpreadsheetApp.flush();

    const kal = kalibriereUndVeroeffentliche_();
    return {
      ok: true,
      meldung: daten.quelle + ': ' + Math.round(start - ende) + ' % Akku für ' + Math.round(km) + ' km (' + von.name + ' → ' + nach.name + ').\n' +
        'Das Modell sagte bisher ' + Math.round(vorher) + ' % bei ' + Math.round(kmh || 120) + ' km/h' + (kmh ? '' : ' (angenommen)') +
        ', ' + Math.round(tempRechnung) + ' °C' + (temp === null ? ' (angenommen)' : '') + '.',
      kalibrierung: kal.text,
      warnung: kal.fehler || '',
      zeile: { von: von.name, nach: nach.name, km: Math.round(km), referenz: Math.round(start - ende), modell: Math.round(vorher), quelle: daten.quelle },
    };
  } finally {
    sperre.releaseLock();
  }
}

/** Stündliche Temperatur von Open-Meteo (kostenlos, ohne Schlüssel) zur nächstgelegenen Stunde; null, wenn nicht verfügbar. */
function temperaturBei_(lat, lon, iso) {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&hourly=temperature_2m&past_days=5&forecast_days=1&timezone=UTC';
    const antwort = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (antwort.getResponseCode() !== 200) return null;
    const j = JSON.parse(antwort.getContentText());
    const ziel = new Date(iso).getTime();
    let beste = null, abstand = Infinity;
    j.hourly.time.forEach(function (t, i) {
      const d = Math.abs(new Date(t + ':00Z').getTime() - ziel);
      if (d < abstand && j.hourly.temperature_2m[i] !== null) { abstand = d; beste = j.hourly.temperature_2m[i]; }
    });
    return abstand <= 2 * 3600e3 ? beste : null;
  } catch (e) {
    return null;
  }
}

/** Liest das Blatt „Fahrten", kalibriert (kalibriereZeilen_), trägt Ergebnisse und Status ein und veröffentlicht modell.json. */
function kalibriereUndVeroeffentliche_() {
  const blatt = fahrtenBlatt_();
  const sp = spaltenIndex_(blatt);
  const werte = blatt.getLastRow() >= 2 ? blatt.getRange(2, 1, blatt.getLastRow() - 1, SPALTEN_FAHRTEN.length).getValues() : [];
  const feld = function (z, name) { return sp[name] ? z[sp[name] - 1] : ''; };

  const erg = kalibriereZeilen_(werte.map(function (z) {
    return {
      km: feld(z, 'km'), hmAuf: feld(z, 'hm auf'), hmAb: feld(z, 'hm ab'), kmh: feld(z, 'km/h verwendet'),
      temp: feld(z, 'Temp Ø') === '' ? null : Number(feld(z, 'Temp Ø')), zusatzKg: feld(z, 'Zusatzgewicht kg'),
      start: feld(z, 'Akku Start %'), ende: feld(z, 'Akku Ende %'), quelle: feld(z, 'Quelle'),
      bordcomputer: feld(z, 'Ø km/h Bordcomputer') !== '', dauer: feld(z, 'Dauer h') !== '',
      verwenden: feld(z, 'verwenden'), notiz: feld(z, 'Notiz'),
    };
  }));

  if (werte.length > 0) {
    blatt.getRange(2, sp['Verbrauch kWh'], erg.zeilen.length, 6).setValues(erg.zeilen.map(function (e) {
      if (!e.gueltig) return ['', '', '', '', '', ''];
      return [runde_(e.real, 2), runde_(e.a.fahrt, 2), runde_(e.a.hoehe, 2), runde_(e.a.heiz, 2), runde_(e.modellKwh, 2), runde_(e.abweichung, 1)];
    }));
    blatt.getRange(2, sp['Kalibrierung'], erg.zeilen.length, 1).setValues(erg.zeilen.map(function (e) { return [e.status]; }));
  }

  let fehler = '';
  try {
    githubSchreibe_('modell.json', JSON.stringify(erg.modell, null, 1), 'modell.json kalibriert: ' + erg.modell.kalibrierung.methode + ' (Apps Script v' + VERSION + ')');
  } catch (e) {
    fehler = 'Modell konnte nicht veröffentlicht werden: ' + e.message;
  }
  return { modell: erg.modell, text: erg.text, fehler: fehler };
}

function punkteBlattMitIndex_() {
  const blatt = tabelle_().getSheetByName(BLATT_PUNKTE);
  if (!blatt) throw new Error('Blatt „' + BLATT_PUNKTE + '" fehlt');
  spalteSicherstellen_(blatt, 'Straße');
  return { blatt: blatt, sp: spaltenIndex_(blatt) };
}

/**
 * Bringt die Spalten in die Reihenfolge von SPALTEN_PUNKTE (ganze Spalten verschieben, Inhalte und
 * Prüfregeln wandern mit). Unbekannte eigene Spalten bleiben rechts. Gibt true zurück, wenn verschoben wurde.
 */
function ordneSpalten_(blatt) {
  let verschoben = false;
  for (let ziel = 1; ziel <= SPALTEN_PUNKTE.length; ziel++) {
    const koepfe = blatt.getRange(1, 1, 1, blatt.getLastColumn()).getValues()[0];
    const ist = koepfe.indexOf(SPALTEN_PUNKTE[ziel - 1]) + 1;
    if (ist === 0 || ist === ziel) continue;
    blatt.moveColumns(blatt.getRange(1, ist, blatt.getMaxRows(), 1), ziel);
    verschoben = true;
  }
  if (verschoben) SpreadsheetApp.flush();
  return verschoben;
}

/** Hängt eine fehlende Spalte mit Kopf rechts an (z. B. „Straße" ab v0.16.0). */
function spalteSicherstellen_(blatt, name) {
  const breite = blatt.getLastColumn();
  const koepfe = blatt.getRange(1, 1, 1, breite).getValues()[0];
  if (koepfe.indexOf(name) !== -1) return;
  if (blatt.getMaxColumns() <= breite) blatt.insertColumnsAfter(breite, 1);
  blatt.getRange(1, breite + 1).setValue(name).setFontWeight('bold');
  SpreadsheetApp.flush();
}

function findeZeile_(blatt, sp, id) {
  if (blatt.getLastRow() < 2) return 0;
  const ids = blatt.getRange(2, sp.id, blatt.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return i + 2;
  return 0;
}

function liesPunkt_(id) {
  const t = punkteBlattMitIndex_();
  const zeile = findeZeile_(t.blatt, t.sp, id);
  if (!zeile) return null;
  const z = t.blatt.getRange(zeile, 1, 1, t.blatt.getLastColumn()).getValues()[0];
  const f = function (name) { const v = z[t.sp[name] - 1]; return v === null || v === undefined ? '' : v; };
  return {
    id: id, link: String(f('Maps-Link')), Adresse: String(f('Adresse')), Name: String(f('Name')),
    Betreiber: String(f('Betreiber')), kW: f('kW') === '' ? '' : Number(f('kW')), Anzahl: f('Anzahl') === '' ? '' : Number(f('Anzahl')),
    Richtung: String(f('Richtung')) || 'beide', Favorit: String(f('Favorit')) === 'ja', Notiz: String(f('Notiz')),
    'Straße': String(f('Straße')),
  };
}

/** Prüft die Formulareingaben; gibt einen Fehlertext oder '' zurück. */
function pruefeFormular_(d, neu) {
  if (!d || typeof d !== 'object') return 'Keine Daten übermittelt.';
  if (neu && !istMapsLink_(String(d.link || '').trim())) {
    return 'Bitte einen Google-Maps-Link einfügen (https://maps.app.goo.gl/… oder https://www.google.com/maps/…).';
  }
  if (!neu && !/^p\d{1,5}$/.test(String(d.id || ''))) return 'Ungültige id.';
  const kw = String(d.kW === undefined || d.kW === null ? '' : d.kW).trim();
  if (kw !== '' && !(Number(kw) > 0 && Number(kw) <= 1000)) return 'Leistung bitte als Zahl zwischen 1 und 1000 kW.';
  const anzahl = String(d.Anzahl === undefined || d.Anzahl === null ? '' : d.Anzahl).trim();
  if (anzahl !== '' && !(Number.isInteger(Number(anzahl)) && Number(anzahl) >= 1 && Number(anzahl) <= 99)) {
    return 'Ladepunkte bitte als ganze Zahl zwischen 1 und 99.';
  }
  if (d.Richtung && RICHTUNGEN.indexOf(d.Richtung) === -1) return 'Unbekannte Richtung.';
  return '';
}

/** Formularwerte → Zellwerte. Text, der mit = + - @ beginnt, wird als Text markiert (keine Formel). */
function normalisiereFormular_(d) {
  const text = function (v, max) {
    let s = String(v === undefined || v === null ? '' : v).trim().slice(0, max);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  };
  const zahl = function (v) { const s = String(v === undefined || v === null ? '' : v).trim(); return s === '' ? '' : Number(s); };
  return {
    Name: text(d.Name, 120), Betreiber: text(d.Betreiber, 60), kW: zahl(d.kW), Anzahl: zahl(d.Anzahl),
    Richtung: RICHTUNGEN.indexOf(d.Richtung) !== -1 ? d.Richtung : 'beide',
    Favorit: d.Favorit === true || d.Favorit === 'ja' ? 'ja' : '',
    Notiz: text(d.Notiz, 500),
    'Straße': text(d['Straße'], 40),
  };
}

/** Nächste freie id nach der höchsten vorhandenen: p047 → p048. Lücken werden nicht neu vergeben. */
function naechsteId_(ids) {
  let max = 0;
  ids.forEach(function (id) { const m = String(id).match(/^p(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  return 'p' + ('00' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
}

/** Nächstgelegene bestehende Station mit Abstand in Metern, oder null, wenn keine Koordinaten vorhanden sind. */
function naechsteStation_(bestehende, lat, lon) {
  let beste = null;
  bestehende.forEach(function (b) {
    if (b.lat === '' || b.lon === '' || b.lat === null || b.lat === undefined) return;
    const m = haversine_(Number(b.lat), Number(b.lon), lat, lon) * 1000;
    if (!beste || m < beste.abstand_m) beste = { id: b.id, name: b.name, abstand_m: Math.round(m) };
  });
  return beste;
}

function geloeschteIds_() {
  const archiv = tabelle_().getSheetByName(BLATT_GELOESCHT);
  if (!archiv || archiv.getLastRow() < 2) return [];
  return archiv.getRange(2, 1, archiv.getLastRow() - 1, 1).getValues().map(function (z) { return String(z[0]).trim(); });
}

/** Kurzfassung eines exportierten Punktes für die Rückmeldung im Formular. */
function punktAusExport_(json, id) {
  if (!json) return null;
  const p = json.punkte.filter(function (x) { return x.id === id; })[0];
  if (!p) return null;
  const namen = {};
  json.routen.forEach(function (r) { namen[r.id] = r.name; });
  return {
    id: p.id, name: p.name, adresse: p.adresse, betreiber: p.betreiber,
    zuordnung: p.zuordnung.map(function (z) {
      return { route: namen[z.route] || z.route, km: Math.round(z.km), quer_km: z.quer_km, strasse: z.strasse, raststaette: z.raststaette };
    }),
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
  const ss = tabelle_();
  const meldungen = [];

  const punkte = blattMitKoepfen_(ss, BLATT_PUNKTE, SPALTEN_PUNKTE, meldungen);
  const routen = blattMitKoepfen_(ss, BLATT_ROUTEN, SPALTEN_ROUTEN, meldungen);

  // Ladepunkte: nur befüllen, solange das Blatt noch keine Datenzeilen hat.
  if (punkte.getLastRow() < 2) {
    const anzahl = importiereAltblatt_(ss, punkte);
    if (anzahl > 0) {
      meldungen.push(anzahl + ' Ladepunkte aus dem alten Blatt übernommen, altes Blatt heißt jetzt „' + BLATT_SICHERUNG + '".');
    } else {
      punkte.appendRow(punkteZeile_({ id: 'p001', Name: 'Beispiel – Zeile löschen oder überschreiben', Betreiber: 'Ionity', kW: 350, Anzahl: 6, Richtung: 'beide', Notiz: 'Coop, McDonald\'s' }));
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
  const blatt = tabelle_().getSheetByName(BLATT_ROUTEN);
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
      zeilen.push(punkteZeile_({ id: id, 'Maps-Link': link, Richtung: richtung, Notiz: String(w[1]).trim(), Status: status }));
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
  ['totalenergies', 'TotalEnergies'], ['lidl', 'Lidl'], ['kaufland', 'Kaufland'], ['ewe go', 'EWE Go'], ['migrol', 'Migrol'],
];

const STATUS_FEHLER_PRAEFIX = 'nicht auflösbar';
const MAX_LAUFZEIT_MS = 5 * 60 * 1000; // Reserve zur Sechs-Minuten-Grenze

function aufloeseLinks() {
  const ui = meldungsUi_();
  const blatt = tabelle_().getSheetByName(BLATT_PUNKTE);
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
      let ausAdresse = false;

      if (fehltName || fehltKoord) {
        const info = linkInfo_(link);
        if (info.lat === null) throw new Error('weder Koordinaten noch genaue Adresse im Link gefunden');
        linkName = info.name;
        if (fehltKoord) {
          ausAdresse = !!info.ausAdresse;
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
      if (ausAdresse) setze('Status', STATUS_AUS_ADRESSE);
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

  // Neueres Teilen-Format ohne Koordinaten: „Name, Straße Nr, PLZ Ort, Land"
  const teile = name.split(',');
  if (teile.length >= 2 && /\d/.test(name)) {
    const ersterIstAdresse = /\d/.test(teile[0]);
    return {
      name: ersterIstAdresse ? name : teile[0].trim(),
      lat: null, lon: null,
      adresse: ersterIstAdresse ? name : teile.slice(1).join(',').trim(),
    };
  }
  return { name: name, lat: null, lon: null };
}

const STATUS_AUS_ADRESSE = 'Koordinaten aus Adresse';

/** Fehlen Koordinaten, wird die Adresse aus dem Link geokodiert – nur wenn mindestens straßengenau, sonst bleibt lat null. */
function koordinatenAusAdresse_(info) {
  if (info.lat !== null || !info.adresse) return info;
  const antwort = Maps.newGeocoder().setLanguage('de').geocode(info.adresse);
  const erstes = antwort.status === 'OK' && antwort.results && antwort.results[0];
  if (!erstes || erstes.geometry.location_type === 'APPROXIMATE') return info;
  info.lat = erstes.geometry.location.lat;
  info.lon = erstes.geometry.location.lng;
  info.ausAdresse = true;
  return info;
}

function linkInfo_(link) {
  return koordinatenAusAdresse_(werteMapsUrlAus_(folgeWeiterleitungen_(link)));
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
  const blatt = tabelle_().getSheetByName(BLATT_PUNKTE);
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
const MAX_START_NEUE_ROUTE_MS = 3 * 60 * 1000; // danach keine neue Route mehr beginnen (Verlauf und Export brauchen noch Zeit)

const GITHUB_REPO = 'obitusde/ladeplanung';
const GITHUB_BRANCH = 'main';
const LINIEN_ORDNER = 'linien';

/** Berechnet nur Routen, deren Start/Via/Ziel sich geändert haben oder die noch fehlen. */
function berechneRouten() { berechneRoutenIntern_(false); }

/** Berechnet alle Routen neu. */
function berechneRoutenNeu() { berechneRoutenIntern_(true); }

function berechneRoutenIntern_(erzwingen) {
  const ui = meldungsUi_();
  const ss = tabelle_();
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

  const meldungen = ergaenzeRoutenAusLinks_(blatt); // Zeilen nur mit Maps-Link → Start/Via/Ziel, Name, id
  const sp = spaltenIndex_(blatt);
  const werte = blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues();
  const start = Date.now();
  let abgebrochen = false;

  for (let i = 0; i < werte.length; i++) {
    const z = werte[i];
    const zeile = i + 2;
    const feld = function (name) { return String(z[sp[name] - 1]).trim(); };
    const setze = function (name, wert) { blatt.getRange(zeile, sp[name]).setValue(wert); };

    const id = feld('id');
    if (!id) {
      if (feld('Name') || feld('Start') || feld('Ziel')) meldungen.push('Zeile ' + zeile + ' („' + feld('Name') + '"): id fehlt — übersprungen');
      continue;
    }

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
      const strassen = strassenAbschnitte_(route.schritte, voll);

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
        strassen: strassen,
        hoechster: hoechsterPunkt_(voll),
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
    const info = linkInfo_(text);
    if (info.lat === null) throw new Error('Link ohne Koordinaten: ' + text);
    return [info.lon, info.lat];
  }
  throw new Error('weder Koordinate noch Maps-Link: ' + text);
}

// ---------------------------------------------------------------------------
// Routen aus geteilten Google-Maps-Links (Christof, 19.09.2026): Route in Google Maps planen,
// Zwischenziele als Stopps, „Teilen" → Link. Geprüft mit einem echten Link vom 19.09.2026:
//   https://www.google.ch/maps/dir/Morges,+1110/Brig-Glis/@…/data=!4m14!4m13!1m5!1m1!1s0x…!2m2!1d6.4961301!2d46.5088127!1m5…!3e0
// Pfadsegmente = Wegpunkte in Reihenfolge (Name oder „lat,lon"), im data-Block je benanntem Punkt
// „!2m2!1d<lon>!2d<lat>". Passt die Zuordnung nicht eindeutig (z. B. mit der Hand gezogene Umwege,
// die zusätzliche Koordinaten erzeugen), wird sichtbar abgebrochen statt geraten.
// ---------------------------------------------------------------------------

const START_FANG_KM = 3; // Start so nah an Christofs Startpunkt → genau dieser (alle Stammstrecken beginnen dort)

/** Rein rechnerisch: /maps/dir/-URL → [{ name, lat, lon }] (lat null = nur Name bekannt). Wirft bei Unklarem. */
function routenpunkteAusUrl_(url) {
  const teil = String(url).split('/maps/dir/')[1];
  if (!teil) throw new Error('kein Routenlink – in Google Maps eine Route planen und „Teilen" → „Link kopieren"');
  const pfad = teil.split(/[?#]/)[0].split('/');
  const segmente = [];
  for (let i = 0; i < pfad.length; i++) {
    if (pfad[i].charAt(0) === '@' || pfad[i].indexOf('data=') === 0) break;
    segmente.push(decodeURIComponent(pfad[i].replace(/\+/g, ' ')).trim());
  }
  while (segmente.length && segmente[segmente.length - 1] === '') segmente.pop();
  if (segmente.length < 2) throw new Error('Route braucht mindestens Start und Ziel');
  if (segmente.some(function (x) { return x === ''; })) throw new Error('ein Wegpunkt ist leer (z. B. „Mein Standort") – bitte einen Ort wählen');

  const datenTeil = (teil.match(/data=([^?#]*)/) || [])[1] || '';
  const paare = [];
  const muster = /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = muster.exec(datenTeil)) !== null) paare.push({ lat: Number(m[2]), lon: Number(m[1]) });

  const punkte = segmente.map(function (x) {
    const k = x.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    return k ? { name: '', text: '', lat: Number(k[1]), lon: Number(k[2]) } : { name: ortAusText_(x), text: x, lat: null, lon: null };
  });
  const benannt = punkte.filter(function (p) { return p.lat === null; });
  if (paare.length === punkte.length) {
    punkte.forEach(function (p, i) { if (p.lat === null) { p.lat = paare[i].lat; p.lon = paare[i].lon; } });
  } else if (paare.length === benannt.length) {
    benannt.forEach(function (p, i) { p.lat = paare[i].lat; p.lon = paare[i].lon; });
  } else if (paare.length > 0) {
    throw new Error(punkte.length + ' Wegpunkte, aber ' + paare.length + ' Koordinaten im Link – wurde die Route mit dem Finger verschoben? ' +
      'Bitte stattdessen Zwischenziele als Stopp hinzufügen');
  }
  return punkte;
}

/**
 * Ort aus einem Wegpunkt-Text: „Dahler Str. 6b, 58809 Neuenrade" → „Neuenrade", „Morges, 1110" → „Morges",
 * „Brig-Glis" → „Brig-Glis". Nur eine Vermutung; routeAusLink_ nimmt, wenn möglich, den Ort vom Geocoder.
 */
function ortAusText_(text) {
  const teile = String(text).split(',').map(function (t) { return t.trim(); }).filter(function (t) { return t; });
  for (let i = 0; i < teile.length; i++) {
    const m = teile[i].match(/^(?:[A-Z]{1,2}-)?\d{4,5}\s+(.+)$/);
    if (m) return m[1].replace(/\s+\(.*\)$/, '').replace(/\s+[A-Z]{2}$/, '').trim(); // „Savona SV" → „Savona"
  }
  return teile[0] || '';
}

/** Kennung aus einem Ortsnamen: „Brig-Glis" → „brig_glis", „Zürich" → „zuerich". */
function routenId_(name, vorhandene) {
  const basis = String(name || 'route').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'route';
  let id = basis, n = 2;
  while (vorhandene.indexOf(id) !== -1) id = basis + '_' + n++;
  return id;
}

/** Rein rechnerisch: Wegpunkte → Zeilenwerte { Name, Ort (Ziel), Start, Via, Ziel }. Start bei Morges → Christofs Startpunkt. */
function routenZeileAusPunkten_(punkte) {
  const text = function (p) { return runde_(p.lat, 6) + ',' + runde_(p.lon, 6); };
  const s0 = START_MORGES.split(',').map(Number);
  const start = punkte[0], ziel = punkte[punkte.length - 1], via = punkte.slice(1, -1);
  const amStart = haversine_(start.lat, start.lon, s0[0], s0[1]) <= START_FANG_KM;
  const namen = via.map(function (p) { return p.name; }).filter(function (x) { return x; });
  return {
    Name: (amStart ? 'Morges' : start.name || 'Start') + ' – ' + (ziel.name || 'Ziel') + (namen.length ? ' (' + namen.join(', ') + ')' : ''),
    Ort: (amStart ? '' : (start.name || 'start') + ' ') + (ziel.name || 'route'), // für die id: „neuenrade_ingolstadt"
    Start: amStart ? START_MORGES : text(start),
    Via: via.map(text).join(';'),
    Ziel: text(ziel),
  };
}

/** Link auflösen (Kurzlink folgen), Wegpunkte lesen, fehlende Koordinaten/Namen über den Google-Geocoder ergänzen. */
function routeAusLink_(link) {
  const url = folgeWeiterleitungen_(String(link).trim());
  const punkte = routenpunkteAusUrl_(url);
  const geocoder = Maps.newGeocoder().setLanguage('de');
  const ortAus = function (ergebnis) {
    const teile = (ergebnis && ergebnis.address_components) || [];
    const ort = teile.filter(function (t) { return t.types.indexOf('locality') !== -1 || t.types.indexOf('postal_town') !== -1; })[0];
    return ort ? ort.long_name : '';
  };
  punkte.forEach(function (p) {
    if (p.lat === null) {
      // die ganze Adresse suchen – nur die Straße („Dahler Str. 6b") fand am 19.09.2026 Wuppertal statt Neuenrade
      const r = geocoder.geocode(p.text);
      const erstes = r.status === 'OK' && r.results && r.results[0];
      if (!erstes) throw new Error('Ort „' + p.text + '" nicht gefunden');
      p.lat = erstes.geometry.location.lat;
      p.lon = erstes.geometry.location.lng;
      p.name = ortAus(erstes) || p.name;
    } else {
      const r = geocoder.reverseGeocode(p.lat, p.lon);
      p.name = ortAus(r.results && r.results[0]) || p.name;
    }
  });
  return routenZeileAusPunkten_(punkte);
}

/**
 * Zeilen im Blatt Routen mit Maps-Link, aber ohne Start oder Ziel: Start/Via/Ziel, leeren Namen und leere id
 * aus dem Link füllen. Fehler landen in „Stand". Gibt Meldungen zurück.
 */
function ergaenzeRoutenAusLinks_(blatt) {
  spalteSicherstellen_(blatt, 'Maps-Link');
  const sp = spaltenIndex_(blatt);
  const meldungen = [];
  if (blatt.getLastRow() < 2) return meldungen;
  const werte = blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues();
  const ids = werte.map(function (z) { return String(z[sp.id - 1]).trim(); }).filter(function (x) { return x; });
  werte.forEach(function (z, i) {
    const f = function (k) { return String(z[sp[k] - 1]).trim(); };
    if (!f('Maps-Link') || (f('Start') && f('Ziel'))) return;
    const zeile = i + 2;
    try {
      const r = routeAusLink_(f('Maps-Link'));
      ['Start', 'Via', 'Ziel'].forEach(function (k) { schreibeText_(blatt, zeile, sp[k], r[k]); });
      if (!f('Name')) blatt.getRange(zeile, sp.Name).setValue(r.Name);
      let id = f('id');
      if (!id) { id = routenId_(r.Ort, ids); ids.push(id); schreibeText_(blatt, zeile, sp.id, id); }
      meldungen.push(id + ': aus dem Maps-Link übernommen – ' + (f('Name') || r.Name));
    } catch (e) {
      blatt.getRange(zeile, sp.Stand).setValue('Fehler: ' + e.message);
      meldungen.push('Zeile ' + zeile + ': Maps-Link – ' + e.message);
    }
  });
  if (meldungen.length) SpreadsheetApp.flush();
  return meldungen;
}

/** Wartung: Route aus einem Link anlegen (vollständige Zeile anhängen; berechnen und veröffentlichen folgen). */
function legeRouteAusLinkAn_(link) {
  const ui = meldungsUi_();
  if (!istMapsLink_(String(link || '').trim())) throw new Error('Bitte einen Google-Maps-Link einfügen (https://maps.app.goo.gl/…).');
  const blatt = tabelle_().getSheetByName(BLATT_ROUTEN);
  spalteSicherstellen_(blatt, 'Maps-Link');
  const r = routeAusLink_(link);
  const sp = spaltenIndex_(blatt);
  const werte = blatt.getLastRow() >= 2 ? blatt.getRange(2, 1, blatt.getLastRow() - 1, blatt.getLastColumn()).getValues() : [];
  const gleich = werte.filter(function (z) {
    return ['Start', 'Via', 'Ziel'].every(function (k) { return String(z[sp[k] - 1]).trim() === r[k]; });
  })[0];
  if (gleich) throw new Error('Diese Route gibt es schon: ' + gleich[sp.Name - 1] + ' (' + gleich[sp.id - 1] + ')');
  const id = routenId_(r.Ort, werte.map(function (z) { return String(z[sp.id - 1]).trim(); }));
  const zeile = blatt.getLastRow() + 1;
  schreibeText_(blatt, zeile, sp.id, id);
  blatt.getRange(zeile, sp.Name).setValue(r.Name);
  ['Start', 'Via', 'Ziel'].forEach(function (k) { schreibeText_(blatt, zeile, sp[k], r[k]); });
  blatt.getRange(zeile, sp['Maps-Link']).setValue(String(link).trim());
  SpreadsheetApp.flush();
  ui.alert('Route angelegt', id + ': ' + r.Name + (r.Via ? '\nVia: ' + r.Via : ''), ui.ButtonSet.OK);
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
  if (strassen[i][1]) return kurzStrasse_(strassen[i][1]);

  let davor = i - 1, danach = i + 1;
  while (davor >= 0 && !strassen[davor][1]) davor--;
  while (danach < strassen.length && !strassen[danach][1]) danach++;
  const abstandDavor = davor >= 0 ? km - strassen[davor + 1][0] : Infinity;
  const abstandDanach = danach < strassen.length ? strassen[danach][0] - km : Infinity;
  if (Math.min(abstandDavor, abstandDanach) > 3) return '';
  return kurzStrasse_(abstandDavor <= abstandDanach ? strassen[davor][1] : strassen[danach][1]);
}

/**
 * Kurzform für die Anzeige: Autobahnnummer, wenn vorhanden („Autostrada dei Trafori, A26" → „A26"),
 * sonst der erste Teil vor dem Komma („Kantonsstrasse, 9" → „Kantonsstrasse").
 */
function kurzStrasse_(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const autobahn = n.match(/(?:^|[\s,])(A ?\d{1,3})(?=$|[\s,])/);
  if (autobahn) return autobahn[1];
  return n.split(',')[0].trim();
}

// Höhenmeter sind ein Näherungswert zur Einschätzung der Reichweite. Die Höhendaten rauschen
// stark, in engen Tälern (Gondoschlucht, Apennin) um mehr als 50 m. Deshalb zweistufig:
//  1. Profil im 100-m-Raster über 2 km mit gleitendem Median glätten (entfernt Ausreißer an Talwänden),
//  2. Anstieg/Gefälle erst ab 10 m Änderung seit dem letzten gezählten Punkt zählen.
// Geprüft am 15.09.2026: Simplon-Route 3225 m statt 9180 m ungefiltert, Passhöhe bleibt erhalten.
const HOEHEN_SCHWELLE_M = 10;
const GLAETTUNG_FENSTER_KM = 2;
const GLAETTUNG_RASTER_KM = 0.1;
// Bei jeder Änderung an Rechnung oder Linienformat erhöhen — erzwingt Neuberechnung der Routen.
// 4 (18.09.2026): zusätzlich hoechster (höchster Punkt).
const LINIEN_FORMAT = 4;

/**
 * [lon, lat, höhe] in voller Auflösung → [lat, lon, km, anstieg_hin, anstieg_rueck, höhe_geglättet].
 * Der Anstieg in Rückrichtung ist das kumulierte Gefälle in Hinrichtung.
 */
function kumuliere_(koordinaten) {
  const n = koordinaten.length;
  const kms = new Array(n);
  let km = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) km += haversine_(koordinaten[i - 1][1], koordinaten[i - 1][0], koordinaten[i][1], koordinaten[i][0]);
    kms[i] = km;
  }
  const glatt = glaetteHoehen_(kms, koordinaten.map(function (p) { return p[2]; }));

  const erg = [];
  let auf = 0, ab = 0;
  let bezug = n > 0 ? glatt[0] : 0;
  for (let i = 0; i < n; i++) {
    const d = glatt[i] - bezug;
    if (d >= HOEHEN_SCHWELLE_M) { auf += d; bezug = glatt[i]; }
    else if (-d >= HOEHEN_SCHWELLE_M) { ab -= d; bezug = glatt[i]; }
    erg.push([koordinaten[i][1], koordinaten[i][0], kms[i], auf, ab, glatt[i]]);
  }
  return erg;
}

/**
 * Gleitender Median über GLAETTUNG_FENSTER_KM. Wegen der ungleichmäßigen Punktdichte
 * (dicht in Kurven, dünn auf Geraden) wird zuerst auf ein gleichmäßiges Raster interpoliert
 * und das Ergebnis danach wieder auf die Originalpunkte übertragen.
 */
function glaetteHoehen_(kms, hoehen) {
  const n = hoehen.length;
  const laenge = n > 0 ? kms[n - 1] : 0;
  if (n < 3 || laenge <= 0) return hoehen.slice();

  const schritte = Math.max(1, Math.round(laenge / GLAETTUNG_RASTER_KM));
  const raster = new Array(schritte + 1);
  let j = 0;
  for (let s = 0; s <= schritte; s++) {
    const k = laenge * s / schritte;
    while (j + 1 < n - 1 && kms[j + 1] < k) j++;
    const spann = kms[j + 1] - kms[j];
    const t = spann > 0 ? Math.max(0, Math.min(1, (k - kms[j]) / spann)) : 0;
    raster[s] = hoehen[j] + t * (hoehen[j + 1] - hoehen[j]);
  }

  const radius = Math.max(1, Math.round(GLAETTUNG_FENSTER_KM / 2 / (laenge / schritte)));
  const median = raster.map(function (_, s) {
    const fenster = raster.slice(Math.max(0, s - radius), s + radius + 1).sort(function (a, b) { return a - b; });
    return fenster[Math.floor(fenster.length / 2)];
  });

  return kms.map(function (k) {
    const pos = k / laenge * schritte;
    const s0 = Math.min(schritte, Math.floor(pos));
    const s1 = Math.min(schritte, s0 + 1);
    return median[s0] + (pos - s0) * (median[s1] - median[s0]);
  });
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

/** Höchster Punkt der geglätteten Linie: [km, Höhe m] — für die Routeninfo in der App. */
function hoechsterPunkt_(voll) {
  let best = null;
  voll.forEach(function (p) { if (best === null || p[5] > best[5]) best = p; });
  return best ? [runde_(best[2], 1), Math.round(best[5])] : null;
}

// ---------------------------------------------------------------------------
// Straßen (Christof, 18.09.2026): Die Straßennamen von OpenRouteService fehlen oft auf langen Stücken
// (A 96, A 45), weil sie nur an Abbiegungen stehen. Daher Spalte „Straße" je Station, von Hand gepflegt.
// Automatisch aus OpenStreetMap ging nicht: Overpass lehnt Anfragen aus Apps Script ab (HTTP 406).
// ---------------------------------------------------------------------------

const STRASSE_KEINE = '–';             // im Blatt: bewusst keine Straße

/** Straßennummer ohne Leerzeichen (Christof, 18.09.2026): „A 96" → „A96", „B 17" → „B17", „SS 33" → „SS33". */
function ohneLeerzeichen_(name) {
  return String(name || '').trim().replace(/\b([A-Z]{1,3})\s+(\d)/g, '$1$2');
}

/** Straße für den Titel: die der Route an dieser Stelle, wenn sie bei der Station liegt; sonst die erste der Station. */
function waehleStrasse_(stationsStrassen, routenStrasse) {
  const liste = String(stationsStrassen || '').split(/[,\/;]/).map(ohneLeerzeichen_)
    .filter(function (x) { return x !== '' && x !== STRASSE_KEINE && x !== '-'; });
  const route = ohneLeerzeichen_(routenStrasse);
  if (route && liste.indexOf(route) !== -1) return route;
  return liste[0] || route || '';
}

/** Straße für eine Zuordnung: Straße(n) der Station abgestimmt mit der Straße der Route an dieser Stelle. */
function strasseFuerZuordnung_(stationsStrassen, route, km) {
  return waehleStrasse_(stationsStrassen, strasseBeiKm_(route.strassen, km));
}

// ---------------------------------------------------------------------------
// exportJson() — ordnet Punkte den Routen zu (Querabstand ≤ 5 km), baut
// routes.json und lädt sie ins Repo. Reine Rechenarbeit, kein Routing-Aufruf.
// ---------------------------------------------------------------------------

// 10 km statt der 2 km aus dem Brief (Christof, 15.09.2026): Stationen an Ausfahrten und an
// parallelen Autobahnen (A5/A67) gehören dazu — er trägt ohnehin nur sinnvolle Punkte ein.
// Der Querabstand wird mit exportiert und angezeigt.
const ZUORDNUNG_MAX_KM = 10;
const STATUS_OHNE_ROUTE = 'keiner Route zugeordnet (> ' + ZUORDNUNG_MAX_KM + ' km)';

/** Erkennt den Status auch in älteren Fassungen („… (> 2 km)"), damit er beim Export verschwindet. */
function istOhneRouteStatus_(status) {
  return String(status || '').indexOf('keiner Route zugeordnet') === 0;
}
const RASTSTAETTE_MAX_KM = 0.5;
const RASTSTAETTE_MUSTER = /rastst[äa]tte|rasthof|rastanlage|rastplatz|autobahn|autogrill|aire de service|area di servizio/i;

/** Gibt { meldungen, json, fehler } zurück — das Formular zeigt daraus die Zuordnung an. */
function exportJson() {
  const ui = meldungsUi_();
  let json = null;
  const ss = tabelle_();
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
        routen.push({
          id: id, name: String(z[spR.Name - 1]).trim() || datei.name, linie: datei.linie, strassen: datei.strassen || [],
          hoechster: datei.hoechster || null, dauer_s: datei.ors_dauer_s || null,
        });
      });
    }
    if (routen.length === 0) throw new Error('keine berechnete Route vorhanden');

    spalteSicherstellen_(punkteBlatt, 'Straße');
    if (ordneSpalten_(punkteBlatt)) meldungen.push('Spalten im Blatt „' + BLATT_PUNKTE + '" neu geordnet');
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
          betreiber: String(feld('Betreiber')).trim() || betreiberAusName_(String(feld('Name'))),
          kw: zahlOderNull_(feld('kW')),
          anzahl: zahlOderNull_(feld('Anzahl')),
          richtung: RICHTUNGEN.indexOf(String(feld('Richtung')).trim()) !== -1 ? String(feld('Richtung')).trim() : 'beide',
          favorit: String(feld('Favorit')).trim().toLowerCase() === 'ja',
          notiz: String(feld('Notiz')).trim(),
          link: String(feld('Maps-Link')).trim(), // für „In Google Maps ansehen" (öffnet die genaue Ortskarte)
          strasse: String(feld('Straße') || '').trim(), // „A 96, A 7" oder „–" (keine); Auswahl je Route in baueExport_
        });
        statusZeilen.push({ zeile: i + 2, status: String(feld('Status')) });
      });
    }

    json = baueExport_(routen, punkte, new Date().toISOString());
    githubSchreibe_('routes.json', JSON.stringify(json), 'routes.json exportiert (Apps Script v' + VERSION + ')');

    // Status-Spalte: nicht zugeordnete Punkte kennzeichnen, erledigte Kennzeichnung entfernen.
    const ohne = [];
    json.punkte.forEach(function (p, k) {
      const s = statusZeilen[k];
      if (p.zuordnung.length === 0) {
        ohne.push(p.id);
        if (s.status === '' || (istOhneRouteStatus_(s.status) && s.status !== STATUS_OHNE_ROUTE)) {
          punkteBlatt.getRange(s.zeile, spP.Status).setValue(STATUS_OHNE_ROUTE);
        }
      } else if (istOhneRouteStatus_(s.status)) {
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
  return { meldungen: meldungen, json: json, fehler: meldungen.some(function (m) { return m.indexOf('Fehler:') === 0; }) };
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
          // Straße der Station (Spalte „Straße") vor der Straße der Route an dieser Stelle
          strasse: strasseFuerZuordnung_(p.strasse, v.r, pr.km),
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
    version: '1.2', // 1.1: zuordnung um quer_km, strasse, raststaette; 1.2: routen um dauer_s, hoechster; punkte um strasse
    erzeugt: zeitstempel,
    routen: routen.map(function (r) {
      const letzter = r.linie[r.linie.length - 1];
      return {
        id: r.id, name: r.name, laenge_km: letzter[2], hm_hin: letzter[3], hm_rueck: letzter[4],
        dauer_s: r.dauer_s || null, hoechster: r.hoechster || null,
        linie: r.linie,
      };
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
  const sp = spaltenIndex_(punkte);
  const spalteRichtung = sp.Richtung;
  const spalteFavorit = sp.Favorit;

  punkte.getRange(2, spalteRichtung, zeilen, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(RICHTUNGEN, true).setAllowInvalid(false).build()
  );
  punkte.getRange(2, spalteFavorit, zeilen, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['ja'], true).setAllowInvalid(false).build()
  );
}


// ---------------------------------------------------------------------------
// Ladepreise (Christof, 19.09.2026): nur Direktangebote der Betreiber, kein Roaming. EnBW nur S/M/L,
// Tesla für Fremdfahrzeuge. preise.json im Repo, die App zeigt je Station den Preis ihres Betreibers.
// Aktualisieren: je Anbieter und Land ein Sprachmodell über OpenRouter mit Websuche (Plugin „web"),
// Hinweis auf die offizielle Preisseite. Nichts wird ohne Bestätigung auf der Seite „Preise" übernommen.
// Die Schweizer Ladepreiskarte (api.chargeprice.app/v1/opendata/charging_prices_ch) braucht einen
// eigenen Schlüssel (geprüft 19.09.2026) – daher auch für die Schweiz dieser Weg.
// ---------------------------------------------------------------------------

const PREISE_DATEI = 'preise.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PREIS_MODELL_STANDARD = 'google/gemini-3.8-flash'; // änderbar über die Skripteigenschaft PREIS_MODELL
const LAENDER = { CH: 'Schweiz', DE: 'Deutschland', AT: 'Österreich', IT: 'Italien' };

/** Frage an das Modell für einen Anbieter-Eintrag. Rein rechnerisch (testbar). */
function preisFrage_(a) {
  const land = LAENDER[a.land] || a.land;
  const besonders = a.betreiber === 'EnBW' ? ' Nur die Tarife S, M und L der EnBW mobility+ App an EnBW-eigenen Ladesäulen, keinen Ad-hoc-Preis.'
    : a.betreiber === 'Tesla' ? ' Preise für Fremdfahrzeuge (Nicht-Tesla), ohne und mit Supercharger-Mitgliedschaft; Spanne von–bis, weil je Standort verschieden.'
    : '';
  return 'Aktuelle Ladepreise des Betreibers ' + a.betreiber + ' in ' + land + ' an seinen eigenen Ladestationen, ' +
    'nur Direktangebote des Betreibers (App oder Ladekarte des Betreibers), kein Roaming über andere Anbieter.' + besonders +
    '\nOffizielle Quelle, wenn möglich: ' + (a.suche || '–') +
    '\nBisherige Werte (' + a.waehrung + '): ' + JSON.stringify({ tarife: a.tarife, hinweis: a.hinweis }) +
    '\nAntworte NUR mit JSON in genau dieser Form: {"tarife":[{"name":"…","kwh":0.00,"kwh_bis":0.00,"grund_monat":0,"minute":0,"kw_bis":0}],' +
    '"hinweis":"kurz, deutsch","quelle":"URL","sicher":true}. kwh in ' + a.waehrung + ' je kWh, kwh_bis nur bei Spannen, minute nur bei ' +
    'Minutenpreisen, kw_bis nur bei leistungsabhängigen Preisen. Findest du keine verlässliche aktuelle Quelle, gib die bisherigen Werte ' +
    'zurück und setze "sicher":false. Nichts erfinden.';
}

/** Antwort des Modells → { tarife, hinweis, quelle, sicher } oder Fehler. Rein rechnerisch (testbar). */
function preisAntwortLesen_(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('keine JSON-Antwort');
  const j = JSON.parse(m[0]);
  if (!Array.isArray(j.tarife)) throw new Error('tarife fehlen');
  const zahl = function (v) { return v === undefined || v === null || v === '' ? undefined : Number(v); };
  const tarife = j.tarife.map(function (t) {
    const e = { name: String(t.name || '').slice(0, 40), kwh: zahl(t.kwh), grund_monat: zahl(t.grund_monat) || 0 };
    if (!(e.kwh >= 0.05 && e.kwh <= 2)) throw new Error('unplausibler Preis ' + t.kwh + ' bei ' + e.name);
    ['kwh_bis', 'minute', 'kw_bis'].forEach(function (k) { const v = zahl(t[k]); if (v > 0) e[k] = v; });
    if (e.kwh_bis !== undefined && !(e.kwh_bis > e.kwh && e.kwh_bis <= 2)) delete e.kwh_bis;
    return e;
  });
  return { tarife: tarife, hinweis: String(j.hinweis || '').slice(0, 200), quelle: String(j.quelle || '').slice(0, 300), sicher: j.sicher !== false };
}

/** Seite „Preise": Vorschläge für alle Anbieter holen (parallel). Übernimmt nichts. */
function preiseVorschlagen() {
  const schluessel = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
  if (!schluessel) return { ok: false, text: 'OPENROUTER_API_KEY fehlt in den Skripteigenschaften.' };
  const modell = PropertiesService.getScriptProperties().getProperty('PREIS_MODELL') || PREIS_MODELL_STANDARD;
  const preise = JSON.parse(githubLies_(PREISE_DATEI) || '{"anbieter":[]}');
  const anfragen = preise.anbieter.map(function (a) {
    return {
      url: OPENROUTER_URL, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + schluessel, 'HTTP-Referer': APP_URL, 'X-Title': 'Ladeplanung' },
      payload: JSON.stringify({
        model: modell, temperature: 0,
        plugins: [{ id: 'web', max_results: 5 }],
        messages: [
          { role: 'system', content: 'Du recherchierst Ladepreise für Elektroautos. Antworte nur mit gültigem JSON.' },
          { role: 'user', content: preisFrage_(a) },
        ],
      }),
    };
  });
  const antworten = UrlFetchApp.fetchAll(anfragen);
  const vorschlaege = preise.anbieter.map(function (a, i) {
    try {
      const code = antworten[i].getResponseCode();
      const j = JSON.parse(antworten[i].getContentText());
      if (code !== 200) throw new Error('OpenRouter HTTP ' + code + ': ' + ((j.error && j.error.message) || '').slice(0, 150));
      return { alt: a, neu: preisAntwortLesen_(j.choices[0].message.content) };
    } catch (e) {
      return { alt: a, fehler: e.message };
    }
  });
  return { ok: true, modell: modell, vorschlaege: vorschlaege };
}

/** Seite „Preise": bestätigte Werte übernehmen → preise.json mit neuem Stand (Datum). */
function preiseSpeichern(anbieter) {
  const sperre = LockService.getScriptLock();
  sperre.waitLock(30000);
  try {
    if (!Array.isArray(anbieter) || anbieter.length === 0) return { ok: false, text: 'Keine Preise übergeben.' };
    anbieter.forEach(function (a) {
      if (!a.betreiber || !a.land || !Array.isArray(a.tarife)) throw new Error('unvollständiger Eintrag');
      a.tarife.forEach(function (t) { if (!(t.kwh >= 0.05 && t.kwh <= 2)) throw new Error('unplausibler Preis bei ' + a.betreiber); });
    });
    const datei = { version: 1, stand: Utilities.formatDate(new Date(), 'Europe/Zurich', 'yyyy-MM-dd'), anbieter: anbieter };
    githubSchreibe_(PREISE_DATEI, JSON.stringify(datei, null, 1), 'preise.json aktualisiert (Apps Script v' + VERSION + ')');
    return { ok: true, text: 'Gespeichert – in der App nach 1–2 Minuten sichtbar.', preise: datei };
  } catch (e) {
    return { ok: false, text: 'Fehler: ' + e.message };
  } finally {
    sperre.releaseLock();
  }
}
