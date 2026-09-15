/**
 * Ladeplanung Cupra Born — Apps Script, an das Sheet „Ladestationen" gebunden.
 *
 * Version 0.2.0 — Etappe 2: setup() und Menü.
 *
 * Grundlage: Umsetzungsbrief v5.0, Stufe 1.
 */

const VERSION = '0.2.0';

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
    .addItem('Setup (Blätter anlegen)', 'setup')
    .addToUi();
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
