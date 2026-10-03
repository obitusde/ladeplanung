# Ladeplanung Cupra Born

Zeigt vor und während der Fahrt die Ladepunkte voraus auf einer Stammstrecke — Entfernung entlang der Straße, Akku bei Ankunft, Leistung, Preis, Lage und Notiz. Keine Navigation, kein Belegt-Status: entschieden wird selbst.

**App:** https://obitusde.github.io/ladeplanung/ (auf dem Handy über Chrome → „Zum Startbildschirm hinzufügen")

## Benutzung

Ausführlich in der App unter ☰ → **ⓘ So funktioniert die App**. Kurz:

1. **Vor der Fahrt:** oben *von* und *nach* wählen (bei mehreren Wegen auch *über*). Akkustand bei „Akku jetzt" eintragen und ✓ tippen – mit OBD-Adapter genügt ein Tipp auf **Standort**.
2. **Unterwegs:** **Standort** tippen, wann immer du sehen willst, welche Stationen kommen und wie viel Akku dort übrig ist (rot = unter der Reserve, „letzte vor Reserve" markiert). Station antippen → Adresse für My CUPRA kopieren, in Google Maps navigieren, Belegung in Google Maps, App des Betreibers, ABRP.
3. **Vor dem Laden und am Ziel (freiwillig):** **Fahrt beenden** → Formular mit dem echten Akkustand → speichern. Daraus lernt die Prognose (Kalibrierung); ein paar Fahrten reichen.
4. **Nach dem Laden:** neuen Akkustand eintragen bzw. mit Adapter **Standort** tippen – das Laden wird erkannt.

| Knopf | Was er macht |
|---|---|
| **Standort** | GPS-Position holen und Liste neu rechnen; mit Adapter zusätzlich Akku und Kilometerstand lesen. Nur beim Tippen, keine Aufzeichnung. |
| **Akku jetzt … ✓** | Akkustand von Hand, beginnt eine „Fahrt". |
| **Fahrt beenden** | Öffnet das Kalibrierformular (Akku, mit Adapter auch km vorbefüllt). |
| **✕** in der Fahrt-Leiste | Fahrt verwerfen, ohne zu kalibrieren (Test, Tippfehler). |
| **⇄** | Richtung tauschen. |
| ☰ → **Einstellungen** | Zusatzgewicht, Reserve, Temperatur (leer = Wetter), OBD-Adapter ein/aus. |
| ☰ → **Simulation** | Position auf einer Route vorgeben (testen ohne Fahrt). |
| ☰ → **Ladepreise** / **Preise aktualisieren** | Tarife der Betreiber; Aktualisieren sucht per KI mit Websuche, übernommen wird nur Bestätigtes. |
| ☰ → **Ladepunkt / Route hinzufügen** | Per geteiltem Google-Maps-Link; wird automatisch veröffentlicht. |
| ☰ → **Wartung & Status** | Status, Routen berechnen, Sheet-Änderungen veröffentlichen, neu kalibrieren – mit Erklärung, wann was nötig ist. |

**OBD-Adapter** (Veepeak OBDCheck BLE+): in den Einstellungen einschalten, Zündung an, Bluetooth an. Beim ersten Tipp nach dem Öffnen der App in der Geräteliste *VEEPEAK* wählen. Zum Ausprobieren gibt es [`obd-test.html`](https://obitusde.github.io/ladeplanung/obd-test.html).

Formulare (Bearbeiten, Wartung, Kalibrieren, Preise) laufen als Google-Apps-Script-Web-App und gehen nur mit Christofs Google-Konto.

## Dateien

- `index.html`, `manifest.json`, `sw.js`, `icon-*.png` — die PWA (GitHub Pages, offline nutzbar)
- `routes.json`, `linien/`, `modell.json` — Daten, vom Apps Script erzeugt
- `preise.json` — Ladepreise der Betreiber
- `obd-test.html` — Testseite für den OBD-Adapter
- `apps-script/` — an das Google Sheet gebundenes Script mit Web-App-Formularen; veröffentlicht per GitHub Action bei Push auf `main`
- `tests/` — Node-Tests und Werkzeuge
- `docs/Umsetzungsbrief_v5.0.md` — ursprünglicher Auftrag

**Vollständiger Projektstand, Entscheidungen und Arbeitsweise: [`CLAUDE.md`](CLAUDE.md).**
