# Ladeplanung Cupra Born — Projektstand für Claude

**Stand 17.10.2026** · App (`index.html`) v0.31.0 · Fahrt auswerten (`auswertung.html`) v0.5.0 · Apps Script (`apps-script/Code.js`) v0.22.0 · Veröffentlichen per GitHub Action (`.github/workflows/apps-script.yml`) v1.0.0 · Bundesdaten-Action (`.github/workflows/bundesdaten.yml`) v1.1.0
Ursprünglicher Auftrag: [`docs/Umsetzungsbrief_v5.0.md`](docs/Umsetzungsbrief_v5.0.md). Diese Datei beschreibt den **tatsächlichen** Stand inklusive aller späteren Entscheidungen und hat Vorrang vor dem Brief.

---

## 1. Nutzer und Arbeitsweise (unbedingt beachten)

- **Christof**, GitHub `obitusde`, wohnt bei Morges (CH). Handy: **Google Pixel 8 (Android, Chrome) – kein iPhone**, keine iOS-Varianten anbieten.
- Will **so wenig wie möglich selbst machen**: **kein Terminal**. Claude führt git, gh, clasp, Tests selbst aus und darf bei GitHub alles (Repo, Pages, Push). Unvermeidbar für ihn: Google-Autorisierungen, Handy-Tests, Werte eintragen.
- **Umsetzungsentscheidungen vorher klar und high-level fragen** – kurze Optionen mit Empfehlung. Multiple-Choice-Dialoge (AskUserQuestion) klickt er oft weg → Fragen lieber als Text mit „a/b/c". Sagt er „erst antworten", nichts bauen; gebaut wird nach „los" / „ja so bauen" / „alles beheben".
- **Deutsch** in Oberfläche, Kommentaren, Commit-Nachrichten. **Versionsnummer bei jeder Änderung** (Kopfkommentar der Datei + `VERSION` bzw. `APP_VERSION`). Diagnostisch-iterativ: Test/Analyse vor Produktivcode, Unsicherheit ehrlich benennen.
- Anleitungen für Web-Oberflächen (GitHub, Google) **klickgenau** schreiben.
- **Zwei Arbeitsorte, ein Stand**: Christof arbeitet mal am PC (Claude Code lokal), mal unterwegs am Handy (Claude Code in der Cloud). **GitHub `main` ist die einzige Wahrheit**, veröffentlicht wird **nur über `git push`** (siehe §5). Kein lokales `clasp push`/`clasp deploy` mehr.
- **Selbst testen**: Node-Tests, lokale App im Browser-Pane (Simulationsmodus), Formular-Vorschauen mit nachgebautem `google.script.run`. Christof testet nur, was nur auf dem Handy/mit Google-Login geht.

---

## 2. Was die App ist

PWA für lange Fahrten mit dem **Cupra Born 58 kWh (2021)**. Zeigt die Ladepunkte **voraus** auf einer Stammstrecke: Entfernung entlang der Straße, **Akku-Prognose**, Leistung, Lage (Straße, Raststätte, „x km abseits"), **Ladepreis des Betreibers**, Notiz. Keine Navigation, kein Belegt-Status – Christof entscheidet selbst.

Stammstrecken (je Hin/Rück): `neuenrade` (Morges–Neuenrade), `ingolstadt` (Ingolstadt über München, ohne Via), `ingolstadt_augsburg` (Via B 17 Hurlach `48.13813,10.83188` + B 300 Aichach `48.52578,11.23978` → A 8 Friedberg-Derching), `savona_simplon`, `savona_bernhard`; weitere per Maps-Link (z. B. Brig). Ulm-Variante bewusst nicht. **Neue Routen (seit v0.17.0) per geteiltem Google-Maps-Routenlink**: Wartung → „Route hinzufügen" (Feld) oder im Blatt Routen nur die Spalte `Maps-Link` füllen und „Routen berechnen". Das Script füllt Start/Via/Ziel, Name („Morges – Ziel (Via-Orte)"), id (aus dem Zielort, `routenId_`); Start ≤ 3 km von `START_MORGES` → genau dieser. Parser `routenpunkteAusUrl_`: Pfadsegmente nach `/maps/dir/` = Wegpunkte, im data-Block `!2m2!1d<lon>!2d<lat>` je benanntem Punkt; Anzahl passt nicht → Fehler (gezogene Umwege), keine Koordinaten → Geocoder. Die ganze Adresse wird geokodiert (v0.18.0; vorher nur die Straße → „Dahler Str. 6b" landete in Wuppertal, Ziel in Wien); Name/id aus den Orten (Geocoder-`locality`, sonst `ortAusText_` „58809 Neuenrade" → Neuenrade), id `start_ziel` wenn der Start nicht Morges ist. Getestet mit echtem Link Morges → Brig-Glis; Zwischenziele beim ersten echten Link prüfen.

App: **https://obitusde.github.io/ladeplanung/** (auf dem Pixel installiert).

---

## 3. Architektur und Datenfluss

```
Google Sheet „Ladestationen"  ──(Apps Script, an das Sheet gebunden)──►  GitHub-Repo obitusde/ladeplanung
  Blätter: Ladepunkte, Routen,           • OpenRouteService: Routen + Höhen        routes.json   (Routen + Punkte + Zuordnung)
  Fahrten, Gelöscht,                     • Google-Maps-Kurzlinks auflösen          linien/<id>.json (Linie je Route)
  Alt-Import (Sicherung)                 • Open-Meteo: Temperatur                  modell.json   (Verbrauchsmodell)
        ▲                                • GitHub Contents-API (Upload)                  │
        │                                                                                ▼ GitHub Pages
  Web-App-Formulare (Apps Script, nur Christofs Konto) ◄──── Links aus der App ──── index.html (PWA, rechnet im Handy)
```

Kein Backend zur Laufzeit der App: sie lädt `routes.json` + `modell.json` (mit `?t=` gegen Caches) und rechnet selbst. Schreiben geht nur über die Web-App (Google-Login).

---

## 4. Zugänge und IDs

| Was | Wert |
|---|---|
| Repo | `obitusde/ladeplanung` (öffentlich). Lokale Kopie am PC optional: `D:\Coding\ladeplanung` |
| Pages | https://obitusde.github.io/ladeplanung/ |
| Sheet „Ladestationen" | ID `1t7mFq1DEODDg_8TQ3rWCGfjkNyJXm0jL5kZSI2AWeaE` |
| Apps Script (gebunden) | scriptId `1paeATvOfJWWUunRDfUEgsEjFdGPIirbhS9wd4JivvFKhnjhDa0b585_w`, Editor https://script.google.com/d/1paeATvOfJWWUunRDfUEgsEjFdGPIirbhS9wd4JivvFKhnjhDa0b585_w/edit |
| Web-App | Deployment-ID `AKfycbzTwwwZcQBuUdfmyoniHH5-gALKnrMlvl50VWtuM_JjZ7tBn7nk-AUwPO37bpPNBjsmuw`, URL `https://script.google.com/macros/s/<ID>/exec` (steht als `FORMULAR_URL` in `index.html`). `access: MYSELF`, `executeAs: USER_DEPLOYING` → ohne Google-Login 302 auf accounts.google.com |
| Script Properties | `ORS_API_KEY` (openrouteservice, Basic), `GITHUB_TOKEN` (fine-grained, Contents Read/Write nur dieses Repo), `OPENROUTER_API_KEY` (Christof hat Konto mit Guthaben; für Preise), optional `PREIS_MODELL` (Standard `google/gemini-3.8-flash`). **Nie ins Repo, nie im Frontend. Claude trägt keine Schlüssel ein.** |
| GitHub-Secret `CLASPRC_JSON` | Inhalt von `~/.clasprc.json` (clasp-Login). Nutzt die Action zum Veröffentlichen. **Nie ausgeben, nie ins Repo.** Erneuern: am PC `clasp login`, dann `gh secret set CLASPRC_JSON -R obitusde/ladeplanung < ~/.clasprc.json` |
| gh CLI (PC) | als `obitusde` angemeldet |
| clasp (PC) | angemeldet (`~/.clasprc.json`) – nur noch für Diagnose und zum Erneuern des Secrets, **nicht** zum Veröffentlichen |

Web-App-Seiten (`doGet`):
`?id=p023` Bearbeiten/Löschen · `?neu=1` Hinzufügen · `?seite=wartung[&fokus=route]` Wartung & Status (auch „Route hinzufügen" per Link) · `?seite=preise` Ladepreise · `?seite=kalibrieren&fahrt=<JSON>` Fahrt kalibrieren (alt, App ruft es seit v0.31.0 nicht mehr auf) · `?seite=messwerte&stuecke=<JSON-Liste>` Messwerte speichern (bis 20 Stücke) · `?seite=vergleich[&route=…&richtung=hin|rueck&nach=p041]` Vergleichswert.

---

## 5. Routine: testen, veröffentlichen (PC und Cloud gleich)

**Sitzungsbeginn – immer:**
```bash
git checkout main && git pull --rebase      # das Script committet selbst routes.json, linien/*, modell.json
```

**Testen:**
```bash
node --check apps-script/Code.js
for t in tests/test-*.js; do node "$t" || break; done     # alle Tests
node tests/formular-vorschau.js                               # Vorschauen der Web-App-Seiten → tests/fixtures/*.html
node tests/erzeuge-testdaten.js                               # synthetische routes-test.json für die App
```

**Veröffentlichen = committen und auf `main` pushen.** Sonst nichts.
- **App** (`index.html` usw.): GitHub Pages baut nach dem Push selbst (1–2 min).
- **Apps Script**: Die GitHub Action „Apps Script veröffentlichen" läuft, sobald sich etwas unter `apps-script/` ändert: Syntax + Tests → `clasp push -f` → `clasp deploy -i <Deployment-ID>` (URL bleibt). Beschreibung der Version: `v<VERSION>: <Commit-Betreff>` → **`VERSION` in Code.js vor dem Commit hochzählen.** Manuell starten: GitHub → Actions → „Apps Script veröffentlichen" → „Run workflow".
- **Nach dem Push prüfen**, ob der Action-Lauf grün ist (`gh run list -R obitusde/ladeplanung --workflow apps-script.yml -L 3`, bzw. GitHub-Tools/-API). Rot → Log lesen, beheben, erneut pushen. Geht das nicht, Christof bitten, in der GitHub-App unter Actions nachzusehen.
- **Kein lokales `clasp push`/`clasp deploy`.** Ausnahme nur nach Rückfrage, wenn die Action kaputt ist (z. B. Secret abgelaufen) – dann vorher `git pull --rebase`, damit kein alter Stand veröffentlicht wird.
- **Git:** Commit-Nachricht per Datei (`git commit -F <datei>`, wegen „…"-Anführungszeichen in Bash), dann `git pull --rebase`, dann `git push`. Letzte Zeile: `Co-Authored-By: Claude …`.

**In der Cloud (Handy) zusätzlich:**
- **Direkt auf `main` arbeiten und pushen** (Christof sagt das zu Beginn; sonst selbst auf `main` wechseln, bevor etwas geändert wird). Der Push geht nur auf den Branch, auf dem die Sitzung arbeitet.
- Lehnt der Git-Proxy den Push auf `main` ab: auf einen `claude/…`-Branch pushen, Pull Request erstellen und Christof bitten, ihn in der GitHub-App zu mergen. Erst nach dem Merge wird veröffentlicht.
- Kein Browser-Pane: App-Prüfung per Node/Headless-Chromium (Playwright, falls vorhanden) oder Christof testet auf dem Pixel. Google-Drive-Connector nur, wenn in der Sitzung verfügbar; sonst Daten aus `routes.json`/`modell.json` im Repo.
- Windows-Pfade (`D:\…`) gelten dort nicht; alle Befehle relativ zum Repo-Wurzelverzeichnis.

**Am PC zusätzlich:**
- **Lokal testen:** Server `node tests/server.js 8765` (in `.claude/launch.json` als „ladeplanung"). App mit `?daten=tests/fixtures/routes-test.json` oder echten Daten; Simulationsmodus über `localStorage['ladeplanung.v1']` setzen. Browser-Pane-Screenshots laufen oft in Timeouts → Zustand per JavaScript/Seitentext prüfen.
- **Sheet lesen:** Google-Drive-Connector `read_file_content` mit der Sheet-ID (liefert alle Blätter als Tabellen, Zahlen mit deutschem Komma).
- **Analyse:** `node tests/analyse-routen.js` (Routenverlauf, Höhensprünge, Punkte ohne Route).

Christof pflegt über die App; Rechenschritte stößt er über **Wartung & Status** an (ⓘ → „Wartung & Status öffnen"). Im Editor gibt es zusätzlich `schritt0_…` bis `schritt5_…` ohne UI-Dialoge.

---

## 6. Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Die PWA (CSS+JS eingebettet, keine Bibliotheken). Rechenkern `projiziere`, `haversine`, `streckenwerte`, Energieblock zwischen `// ENERGIE-START` und `// ENERGIE-ENDE` (muss identisch zu Code.js bleiben – Test prüft das). `window.ladeplanung` für Tests. |
| `auswertung.html` | „Fahrt auswerten (GPX)" (Menü): GPX nur im Browser lesen, Stopps/Ladestopps (≥ 10 min, Station ≤ 400 m), Tempo, Zeitachse, Strecke ohne Kartenkacheln; Akkustände an Start/Ladestopps/Ziel → Messwerte (Quelle „GPX") an `?seite=messwerte`. Strecke seit v0.2.0 auf OpenStreetMap-Karte (Leaflet wie die App; CSS für Diagramm-SVGs nur `section > svg`, sonst verzerrt es die SVG-Ebene von Leaflet), ohne Netz Skizze. Garmin-Export nur über die Webseite connect.garmin.com (nicht in der App). Seit v0.4.0 (Christof 18.10.2026): Fußweg vor/nach der Fahrt abgeschnitten (`kuerzeAufFahrt`: erstes/letztes 1-min-Fenster > 20 km/h), Abschnitt Verbrauch (kWh/100 km je Abschnitt, geladene kWh, Ø Ladeleistung), **Stau-Analyse** (`stauAnalyse`: je km Tempo gegen freies Tempo der Umgebung = 85. Perzentil ±15 km; < 60 % davon bei frei ≥ 70 km/h; nur eingebettet = je 3 km davor/danach ≥ 75 % des freien Tempos; ≥ 2 min Verlust; nicht neben Pausen/Ladestopps. Erste Fassung ohne diese Regeln fand 26 „Staus“ = Bergstraße, Ausfahrten, Bahnhof; jetzt 6 Staus, 23 min bei Ovronnaz → Neuenrade), Karte im Vollbild (Zurück schließt), ohne Ø-Linie im Tempo-Diagramm und ohne Höhen in den Fahrabschnitten. **v0.5.0 (Christof 18.10.2026, „nur eine Schätzung“, „viele Baustellen mit 80“):** Stau = unter **50 %** des freien Tempos, eingebettet = **irgendwo in 10 km davor und danach ≥ 80 %** des freien Tempos (die 3-km-Regel verwarf einen echten 15-min-Stau mit zähem Anlauf), Stücke bis 3 km Abstand zusammen. **Zähfließend** = darüber, aber < 72 km/h, wo frei ≥ 90 km/h; Verlust gegen 80 km/h (Baustellen mit 80 zählen so nicht), nicht neben Pausen, nicht in Staus. Ovronnaz → Neuenrade: 14 Staus ≈ 1 h 02 + zähfließend ≈ 6 min (30 km). Große Dienste (TomTom, INRIX) rechnen gleich (Ist − Zeit bei freiem Verkehr), aber mit freiem Tempo je Straßenabschnitt aus vielen Fahrzeugen. Blöcke `LINIE` und `ENERGIE` + `haversine` sind Kopien aus index.html (Tests prüfen Gleichheit, Einrückung egal) |
| `manifest.json`, `icon-*.png` | Installierbarkeit (Blitz-Icon) |
| `routes.json` | vom Script exportiert, Format 1.2 |
| `preise.json` | Ladepreise je Betreiber und Land (Direktangebote), `stand` = Datum; Pflege über `?seite=preise` |
| `fremde.json` | Fremde Stationen ab 100 kW, je Standort (≈ 2150, 410 KB, ein Punkt je Zeile): CH aus BFE/ich-tanke-strom.ch (AMAG, Migrol, Tesla; id `bfe-lat-lon`), DE aus dem Ladesäulenregister der Bundesnetzagentur (nur „EnBW mobility+" und „Tesla Germany GmbH", Status „In Betrieb"; id `bnetza-lat-lon`). Tesla nur, wenn laut supercharge.info (`allSites`, Feld `otherEVs`, Zuordnung ≤ 500 m) offen für andere Autos und nicht `CLOSED_PERM`; ohne Eintrag bleiben sie (Christof 15.10.2026: Martigny nur für Teslas). Format 2: `{ version 2, stand, min_kw, quellen {CH, DE}, punkte: [{ id, name, betreiber, lat, lon, kw, anzahl, adresse ("…, Schweiz"/"…, Deutschland") }] }`. Monatlich von der Action (`tests/hole-bundesdaten.js`); App zeigt sie nur bei „Route ab hier" |
| `sw.js` | Service Worker nur für offline: Netz zuerst, sonst zuletzt geladene Fassung (Abfrage `?t=` ignoriert) |
| `linien/<route>.json` | vom Script, eine Datei je Route (Format 4) |
| `modell.json` | Verbrauchsmodell mit Kalibrierung, vom Script (oder lokal mit `kalibriereZeilen_` erzeugt) |
| `apps-script/Code.js` | gesamte Server-Logik (siehe §8) |
| `apps-script/Formular.html` | Bearbeiten / Löschen / Hinzufügen |
| `apps-script/Wartung.html` | Wartung & Status (Knöpfe mit „Wann"-Erklärung) |
| `apps-script/Kalibrieren.html` | Fahrt kalibrieren (einzelne Fahrt, alt) |
| `apps-script/Messwerte.html` | Messwerte speichern: Liste der Stücke, je „verwenden", Zusatzgewicht für alle, `speichereMesswerte` |
| `apps-script/Vergleich.html` | Vergleichswert aus ABRP / My CUPRA |
| `apps-script/Preise.html` | Ladepreise ansehen, über OpenRouter neu suchen, je Anbieter bestätigen |
| `apps-script/appsscript.json` | Zeitzone Europe/Zurich, V8, `webapp` MYSELF |
| `.github/workflows/apps-script.yml` | Veröffentlicht Apps Script bei Push auf `main` (nur bei Änderungen unter `apps-script/`) |
| `.github/workflows/bundesdaten.yml` | Am 1. jedes Monats (und per „Run workflow“): `fremde.json` neu, Commit nur bei Änderung, danach Pages-Bau anfordern |
| `tests/test-*.js` | links, routen, bereinigung, routen-vorgaben, formular, modell, vergleich, spalten, routenlink, preise, bundesdaten, linie (App-Linie = Script-Linie) |
| `tests/formular-vorschau.js`, `tests/erzeuge-testdaten.js`, `tests/server.js`, `tests/analyse-routen.js`, `tests/hole-bundesdaten.js` | Werkzeuge |
| `tests/fixtures/` | aufgelöste Maps-Links, synthetische Routen, generierte Vorschauseiten |
| `docs/Umsetzungsbrief_v5.0.md` | ursprünglicher Auftrag |

---

## 7. Datenformate

**Blatt `Ladepunkte`** (Reihenfolge seit v0.16.1: von Hand gepflegt vorne): `id | Maps-Link | Name | Straße | Notiz | kW | Anzahl | Richtung (hin/rueck/beide) | Favorit (ja) | Betreiber | Adresse | Lat | Lon | Status`. Das Script arbeitet nach Spaltennamen; `ordneSpalten_()` ordnet beim Export ein abweichendes Blatt um (eigene Zusatzspalten bleiben rechts). `Straße` pflegt Christof selbst (auch im Formular), **Nummern immer ohne Leerzeichen** („A96"; `ohneLeerzeichen_` gleicht auch ORS-Namen an, Trenner `,` `/` `;`): „A 8", mehrere „A 96, A 7" (Titel zeigt die, auf der die Route dort fährt), „–" = keine; leer → Straße der Route aus den ORS-Namen (`waehleStrasse_`). Spalte wird bei Bedarf angelegt (`spalteSicherstellen_`). Das Script schreibt nur leere Felder; `Notiz` nur beim Zusammenführen von Dubletten. `Richtung` bezieht sich auf die Route: `hin` = nur auf der Fahrt ab Morges erreichbar.

**Blatt `Routen`:** `id | Name | Start | Via (;-getrennt) | Ziel | Länge km | Fahrzeit | Stand | Maps-Link`. Start/Via/Ziel als `lat,lon` (als Text schreiben, deutsches Gebietsschema!) oder Maps-Link.

**Blatt `Fahrten`** (32 Spalten): `erfasst | Route | Richtung | Start | Ende | Start Lat | Start Lon | Ende Lat | Ende Lon | km | hm auf | hm ab | Dauer h | Ø km/h Bordcomputer | km/h verwendet | Zusatzgewicht kg | Temp Start | Temp Ende | Temp Ø | Akku Start % | Akku Ende % | Akku erwartet % | Verbrauch kWh | Anteil Fahrt kWh | Anteil Höhe kWh | Anteil Heizung kWh | Modell kWh | Abweichung % | verwenden | Notiz | Quelle (gemessen/ABRP/My CUPRA) | Kalibrierung`. Christof darf Zeilen löschen oder `verwenden = nein` setzen, danach Wartung → „Neu kalibrieren". Quelle **„GPX"** (seit Script v0.22.0): Route `gpx`, „km/h verwendet" = Verbrauchstempo, „Ø km/h Bordcomputer" = Ø-Tempo beim Fahren, Gewicht 1.

**Blatt `Gelöscht`:** gelöschte Ladepunkte (Zeile + „gelöscht am"); ihre ids werden nie neu vergeben.

**`routes.json` (1.2):**
```json
{ "version": "1.2", "erzeugt": "ISO",
  "routen": [{ "id", "name", "laenge_km", "hm_hin", "hm_rueck", "dauer_s", "hoechster": [km, m], "linie": [[lat, lon, km, hm_hin_kum, hm_rueck_kum], …] }],
  "punkte": [{ "id", "name", "adresse", "lat", "lon", "betreiber", "kw", "anzahl", "richtung", "favorit", "notiz", "link", "strasse",
               "zuordnung": [{ "route", "km", "hm_hin", "hm_rueck", "quer_km", "strasse", "raststaette" }] }] }
```
**`linien/<id>.json`:** `{ version, id, name, eingabe ("Start|Via|Ziel"), erzeugt, ors_distanz_km, ors_dauer_s, laenge_km, hm_hin, hm_rueck, stuetzpunkte_voll, format: 4, strassen: [[km_ab, name]], hoechster: [km, m], linie }`.
**`modell.json`:** `{ version, fahrzeug {kapazitaet_kwh 58, masse_kg 1811, fahrer_kg 80}, physik {cda 0.63, crr 0.008, eta 0.78, rekuperation 0.6, hilfsleistung_kw 0.3, heiz_kw_pro_grad 0.14, heiz_schwelle_c 18}, korrektur {gesamt, fahrt, hoehe, heizung}, tempo {faktor, fahrten, stand}, erzeugt, kalibrierung {fahrten, abweichung_prozent, stand, methode, quellen {Quelle: {n, abweichung, tendenz}}} }`.

**App-Zustand** `localStorage['ladeplanung.v1']`: `route, richtung, sim {aktiv, lat, lon, label}, einst {zusatzgewicht 0, temperatur '' (=auto), reserve 10}, wetter {temp, zeit, lat, lon}, fahrt {start_soc, start_zeit, start_lat, start_lon, route, route_name, richtung, start {km, hm_hin, hm_rueck, q}}, ankunft {url, zeit, anzahl} (= Seite „Messwerte" geöffnet), messung {soc, zeit, lat, lon, km_stand, route, richtung, km, hm_hin, hm_rueck, q} (letzter Messpunkt), stuecke [] (wartende Messstücke), letzterStandort {lat, lon, genauigkeit, zeit}`.

**`preise.json`:** `{ version 1, stand "JJJJ-MM-TT", anbieter: [{ betreiber, land (CH/DE/AT/IT), waehrung, suche (offizielle URL als Hinweis fürs Modell), tarife: [{ name, kwh, kwh_bis?, grund_monat, minute?, kw_bis? }], hinweis, app { name, url (Google Play) }, auch? [weitere Betreiber mit gleichem Preis, z. B. Porsche → AMAG] }] }`. Tesla nur Tarif „Fremdfahrzeug" (keine Mitgliedschaft). Zuordnung in der App: Betreiber der Station (leer → Name enthält Betreiber) + Land aus dem letzten Teil der Adresse. `kw_bis` wählt bei Migrol den Tarif zur kW der Station. Liste: Spanne über alle Tarife (EnBW S–L), Tesla nur Fremdfahrzeug.

---

## 8. Kernlogik

**Streckenkilometer-Modell** (Brief §2, unverändert): Position äquirektangulär auf die Linie projizieren (`x = lon·111,320·cos(lat0)`, `y = lat·110,574`) → Streckenkilometer `s`, Querabstand `q`. Distanz zu P: hin `km(P) − s`, rück `s − km(P)`; ≤ 1 km ausblenden. Anstieg aus den kumulierten Werten der Fahrtrichtung. **q > 10 km → Planung ab dem gewählten Startort** (App v0.18.2, Christof 20.09.2026): volle Rechnung ab Routenanfang der Richtung, Hinweis „Geplant ab X“ mit Knopf „ab meinem Standort“ → alte Luftlinien-Ansicht (`zustand.abStandort`).

**Routen berechnen** (`berechneRouten`): ORS `driving-car/geojson`, `elevation: true`, `instructions: true` (nur für Straßennamen), Fangradius 2000 m. Höhen: **gleitender Median über 2 km im 100-m-Raster, dann 10-m-Hysterese** (sonst 2–3-fach überhöht: Rheinebene +965 statt +53 m, Gondoschlucht). Ausdünnung: Punkt behalten, wenn > 250 m oder > 10 m Höhe seit dem letzten. Übersprungen, wenn `EINGABE_<id>` in den Script Properties = `Start|Via|Ziel#f<LINIEN_FORMAT>`. **`LINIEN_FORMAT` (derzeit 4) erhöhen erzwingt Neuberechnung** aller Routen.

**Export** (`exportJson`): Zuordnung bis **10 km** Querabstand, mit `quer_km`, `strasse` (`kurzStrasse_`: Autobahnnummer, sonst erster Teil vor dem Komma; unbenannte Stücke → nächste benannte Straße bis 3 km), `raststaette` (q ≤ 0,5 km und Richtung einseitig oder Muster „Raststätte/Rasthof/Autobahn/…"). Leerer Betreiber → aus dem Namen (`BETREIBER_MUSTER`). Status „keiner Route zugeordnet (> 10 km)" im Sheet.

**Links auflösen:** Kurzlink per `followRedirects:false` verfolgen; Name aus `/maps/place/<Name>/`, Koordinaten aus letztem `!3d<lat>!4d<lon>`, sonst `@lat,lon`, sonst (neueres Teilen-Format `/maps/place/Name, Straße, PLZ Ort, Land/data=…`) Adresse per `Maps.newGeocoder().geocode` – nur wenn nicht `APPROXIMATE`, Status „Koordinaten aus Adresse" (`linkInfo_`). Adresse + Ort über `Maps.newGeocoder().reverseGeocode` (Name = Maps-Name + Ort). Nicht auflösbar → Status, nie raten.

**Energiemodell** (identisch App/Script, `energieAnteile`/`energieAnteile_`):
```
masse = 1811 + 80 + Zusatzgewicht;  v = max(20, km/h)/3,6;  t = km / km/h
fahrt   = (0,5·ρ(T)·CdA·v³ + Crr·masse·9,81·v) / eta · t        ρ(T) = 1,293·273,15/(273,15+T)
hoehe   = masse·9,81·(hm_auf/eta − hm_ab·eta·rekuperation) / 3,6e6
heiz    = (0,3 kW + max(0, 18 − T)·0,14 kW) · t
kWh     = max(0, gesamt·(k_fahrt·fahrt + k_hoehe·hoehe + k_heizung·heiz));   % = kWh / 58 · 100
```
Startwerte abgeglichen mit EV Database (Born 150 kW 58 kWh, 110 km/h): **18,1 kWh/100 km bei 23 °C**, **23,2 bei −10 °C mit Heizung**.

**Prognose in der App:** Bedarf je Station = Strecke ab Position (+ `quer_km` als Umweg). **Seit v0.29.0 (Christof 16.10.2026) Abschnitt für Abschnitt** entlang der Linie (`akkuProfil`, je Linienpunkt ≤ 250 m), Akku **gedeckelt bei 100 %** – Rückgewinnung bergab mit vollem Akku geht verloren (Ovronnaz → Tal mit 100 %: ≈ 1,4 % weniger ab dem Tal; Gr. St. Bernhard → Martigny nur ≈ 0,2 %, weil der Fahrverbrauch dort überwiegt). Gilt für Liste, Fußzeile, „Akku jetzt" und den erwarteten Wert bei „Fahrt beenden"; der Umweg zur Station wird flach angehängt. `bedarf()` (ungedeckelt, Summen) nur noch für km/hm der Fahrt. Die Kalibrierung im Script rechnet weiter mit Summen (kein Deckel). **Reisetempo (App v0.18.0, Christof 19.09.2026): nicht mehr einstellbar**, sondern Schnitt der Route aus `dauer_s` in routes.json (neuenrade 109, ingolstadt 103, augsburg 97, neuenrade_ingolstadt 113, brig 91, simplon 87, bernhard 80 km/h), mal `modell.tempo.faktor` aus echten Fahrten (`tempoFaktor_`: nur Quelle „gemessen" mit Ø km/h Bordcomputer, km-gewichtet, 0,6–1,4); Fußzeile zeigt „(Route)" bzw. „(gemessen)". Zusatzgewicht und Temperatur weiter aus den Einstellungen. Temperatur: Eingabe, sonst Open-Meteo am Standort (Mittel aus jetzt und +3 h, max. 30 min/30 km alt), sonst 15 °C. Oben **„Akku jetzt __ % ✓"** (intern weiter `fahrt`, früher „Losfahren") → „jetzt ≈" = Eingabe − Bedarf(Eingabe-Position→Position), je Station „Rest bei Ankunft ≈ x %", **rot unter der Reserve**, unter 0 „nicht erreichbar (fehlen ≈ x %)". **Ohne Eingabe wird voller Akku (100 %) angenommen** (v0.17.0): Markierungen erscheinen trotzdem, Text „braucht ≈ x %" bzw. „nicht erreichbar, braucht ≈ x %". Marke **„letzte vor Reserve"**. In der Liste steht nur „nicht erreichbar“, die Zahl in den Details. Je Station „danach x km bis zur nächsten" bzw. „letzte Station, danach x km bis zum Ziel". Nur volle km. Notiz-Kasten über die ganze Zeilenbreite. Preiszeile je Station. Fußzeile: Ziel-km und „braucht ≈" bzw. nach Los „am Ziel ≈". Höhenmeter nur in den Details (v0.16.0). **„Angekommen"** öffnet `?seite=kalibrieren` mit vorbefüllten Werten.

**Verbrauchstempo (Christof 17.10.2026, aus GPX Ovronnaz → Neuenrade):** Ungleichmäßiges Fahren (Stau + 110–125 km/h) braucht mehr als gleichmäßiges Ø-Tempo; mit Ø-Tempo lag das Modell auf dem flachen Abschnitt Herbolzheim → Hüttenberg 15 Punkte zu tief (70 statt 85 %), mit dem Tempoverlauf je 5 km passte es (84 %). Verbrauchstempo = √(km-gewichtetes Mittel von v² je 5 km), war 91/101/100 km/h bei Ø 81/87/84. Script: `verbrauchFaktor_` (GPX-Zeilen, km-gewichtet Verbrauchstempo/Ø, 1–1,4) → `modell.tempo.verbrauch`; Zeilen „gemessen" rechnet `kalibriereZeilen_` mit kmh × Faktor (ABRP/My CUPRA nicht). App: `verbrauchsTempo(route)` = `tempo(route).wert × modell.tempo.verbrauch` für `akkuProfil`/`bedarf`; Anzeige „Tempo" bleibt das Reisetempo.

**Kalibrierung** (`kalibriereZeilen_` rein rechnerisch → `kalibriere_`), nach jeder gespeicherten Fahrt/jedem Vergleichswert und per Wartung:
1. Gewicht: gemessen mit Bordcomputer-Tempo 1, ohne 0,5; ABRP/My CUPRA mit Fahrzeit 0,3, **ohne Fahrzeit 0** (nicht verwendet). Gültig ab 10 km und gesunkenem Akku; `verwenden = nein` respektieren.
2. **Ausreißer** (ab 3 Werten): Verhältnis Wert/Physik > 35 % neben dem Median → nicht verwendet.
3. Gesamtfaktor (gewichtete kleinste Quadrate, 0,6–1,6).
4. Ab 5 Werten Einzelfaktoren relativ zum Gesamtfaktor, Ridge Richtung 1 (λ = 0,1·mittleres Physik²): Fahrt 0,7–1,3, Höhe 0,5–1,5, **Heizung nur bei ≥ 10 °C Temperaturspanne** (0,5–2), sonst fest 1.
5. Statistik je Quelle (Abweichung, Tendenz Modell − Wert in %-Punkten), Status je Zeile in Spalte „Kalibrierung", `modell.json` ins Repo.

**Vergleichswerte** (`speichereVergleich`): Von/Nach = Station, `anfang` (km 0) oder `ende`; km/hm aus `routes.json` + Linie, + `quer_km` beider Punkte; Tempo aus Fahrzeit (Pflicht); Temperatur Eingabe oder Open-Meteo am Mittelpunkt.

**Formular-Schutz:** Hinzufügen warnt bei ≤ 25 m (Dublette) und fragt bei ≤ 300 m nach (Raststätten-Gegenseite). Löschen verschiebt ins Blatt „Gelöscht". Texte mit `= + - @` am Anfang werden als Text markiert. Alle schreibenden Funktionen mit `LockService`.

---

## 9. Entscheidungen und Abweichungen vom Brief v5.0 (von Christof entschieden)

- Linien als Dateien im Repo statt verborgener Blätter (lokal prüfbar).
- **Savona als zwei Routen**: Simplon (Via `46.245838,8.02474`, Simplonstrasse) und Gr. St. Bernhard **Tunnel** (Via `45.85658,7.16605`, „Traforo del Gran San Bernardo"). **Mont-Blanc-Tunnel nie.** Via-Punkte vorher mit OSRM (`router.project-osrm.org` nearest/route) gegen das Straßennetz geprüft; dabei nie Christofs Startkoordinate schicken, sondern Ortsmitte Morges.
- Zuordnungskorridor **10 km** statt 2 km; Luftlinie ab 10 km statt 5 km.
- Höhen geglättet (s. o.).
- Betreiber aus dem Maps-Namen; kW/Anzahl optional.
- p003 Porsche Destination gelöscht; 5 Dubletten zusammengeführt (p020→p006, p021→p007, p032→p010, p035→p025, p034→p026).
- Anzeige: ein Richtungsknopf „nach X ⇄"; Namen ohne „Ladestation/Charging Station"; Straße im Titel („EnBW Appenweier (A 5)"); Betreiber nicht doppelt; getrennt „Navigieren (Google Maps)" / „In Google Maps ansehen" (gespeicherter Maps-Link).
- **ABRP-Link:** `destinations` ist die Wegpunktliste, **erster Eintrag = Start** (aktuelle Position), sonst „keine Positionsdaten".
- **My CUPRA:** Teilen geht nicht → „Adresse kopieren" und dort einfügen.
- Schreibender Endpunkt (eigentlich Stufe 4): Web-App nur für Christofs Konto – Bearbeiten, Löschen, Hinzufügen, Wartung, Kalibrieren, Vergleich.
- **Akku-Prognose mit roter Schrift** (bewusst gegen das Nicht-Ziel „Farblogik"). Alles optional; **keine Dauermessung, Handy muss nicht an bleiben**.
- Mehrere Varianten je Stammstrecke erlaubt (Savona, Ingolstadt).
- **Bedienung seit App v0.17.0:** oben „von" ⇄ „nach" (nur Orte mit Route; Orte = Start/Ziel aus dem Routennamen „A – B (Variante)"), bei mehreren Routen „über"; Menü ☰ (Ladepunkt/Route hinzufügen, Einstellungen, Simulation, Ladepreise, Preise aktualisieren, Wartung & Status, Info). Simulation: je Route Start, km 25/50/75 % (mit nächster Station), Ziel.
- **Ladepreise:** nur Direktangebote der Betreiber, kein Roaming; EnBW nur S/M/L (kein Ad hoc), alle drei immer zeigen; Tesla für Fremdfahrzeuge; nur Datum als Stand anzeigen. Aktualisieren über OpenRouter mit Websuche, Vorschlag alt/neu, Übernahme nur nach Bestätigung. **Seit Script v0.21.0 (Christof 16.10.2026):** Suche mit der eingebauten Google-Suche des Modells (`plugins: [{id:'web', engine:'native'}]`, ≈ 1,4 Cent je Anbieter; bei Fehler nochmal mit der Standardsuche), dazu liest das Script die offizielle Preisseite (`suche`) selbst und gibt Ausschnitte um Preisangaben mit (`seitenText_`, `preisAuszug_`; liefert bei EWE Go, AMAG, Migrol, EnBW nur teils, Tesla sperrt mit 403). „sicher" = heute bestätigt, auch wenn unverändert; sonst `grund`. Seite: Zusammenfassung „x bestätigt, y mit neuem Preis, z unsicher", je Anbieter ✓ / ✎ (angekreuzt) / ? (mit Grund, nicht angekreuzt) / ⚠; **„Speichern (Stand heute)" immer** – Stand = zuletzt geprüft (vorher blieb das Datum ohne Änderung alt, Christof wunderte sich). Vor v0.21.0 meldete das Modell praktisch immer „unsicher" (nur Suchschnipsel, strenge Vorgabe). Schweizer Ladepreiskarte (`api.chargeprice.app/v1/opendata/charging_prices_ch`) braucht eigenen Schlüssel → nicht genutzt.
- **Offline** per Service Worker (Brief-Stufe 4 vorgezogen) und letzter Standort bis GPS da ist.
- **Messwerte statt „Fahrt beenden" (v0.31.0, Christof 17.10.2026):** Jeder Akkuwert (Eingabe ✓ oder Adapter) ist ein Messpunkt (`merkeMesspunkt`, nicht bei Simulation/Planung). Zwischen zwei Punkten auf derselben Route/Richtung (beide q ≤ 2 km), **ab 50 km** (`MESSSTUECK_MIN_KM`; 30 km zu ungenau: Akku ±0,5 % je Wert) und ohne Laden (+2 %) entsteht ein Messstück; kürzer → alter Punkt bleibt Anfang. km vom Kilometerzähler, wenn beide Werte vom Adapter, sonst Route; Ø-Tempo aus der Zeit, unter 60 % des Routentempos → Tempo der Route („mit Pause"). Leiste: „Messwerte senden (n)" → `?seite=messwerte`; Erinnerung „Messwerte geöffnet … – gespeichert?". „Fahrt beenden"/`angekommen()` entfernt; „Fahrt" bleibt intern für „Akku jetzt ≈".
- **Fahrt auswerten (GPX, v0.31.0, Christof 17.10.2026):** GPX nur lokal auswerten („soll nur lokal ausgewertet werden"), Ergebnis wie die einmalige Auswertung in `D:\Coding\fahrten\` (nicht im Repo, Spur zeigt Wohnorte). Gesendet werden nur Abschnittswerte. Erste Fahrt (16.10.2026, 11 h 12, 797 km, 9 h 28 fahren Ø 84 km/h, Routendienst 7 h 57 bei 95 km/h → +19 %; Laden 77 min; Akku 100→20, 91→6, 60→16 %): Faustregel Reisezeit = Routendienst × 1,2 + Laden + 5–10 min je 3 h.
- **Standort von selbst (v0.30.0, Christof 17.10.2026):** beim Öffnen und Zurückkehren in die App (`visibilitychange`) und alle 2 min, solange sichtbar (`STANDORT_INTERVALL_MS`); nur GPS, kein Adapter (Web Bluetooth braucht einen Tipp), keine ORS-Abfragen. Im Hintergrund/bei ausgeschaltetem Bildschirm läuft nichts (Web-App).
- **Route ab hier (App v0.25.0, Christof 14.10.2026):** Menü → „Route ab hier“. Start = Standort oder gesuchter Ort, Ziel = bekannter Ort (Start/Ziel der Stammstrecken, Koordinate = Linienende) oder frei gesuchter Ort – **nur Orte/Ortsmitte** (ORS-Geocoder `layers=locality,localadmin`), keine Straßen. Route direkt im Handy: ORS `/v2/directions/driving-car/geojson`, `elevation`, `radiuses 5000`, **Mont Blanc:** erst ohne Sperre rechnen, führt die Linie durch das Tunnelinnere (`durchMontBlanc`, Rechteck 45,84–45,89 / 6,88–6,94, auch Inneres langer Abschnitte geprüft), nochmal mit Via Gr. St. Bernhard `45.85658,7.16605` (`route.ueber`, Hinweis in der Meldung); Linie mit derselben Glättung wie das Script (Block `// LINIE-START…ENDE`, `tests/test-linie.js` prüft Gleichheit). Route `id: 'adhoc'` in `localStorage['ladeplanung.adhoc']`, wird nach jedem Laden in `daten` eingefügt (`fuegeAdhocEin`): eigene Punkte bis 10 km zugeordnet, Richtung einseitiger Stationen über den Vergleich der Fahrtrichtung mit ihrer Stammstrecke (`adhocRichtung`, `z.richtung`). Name „Start – Ziel (Route ab hier)“ → erscheint oben in von/nach. Vergleichswert bei adhoc ausgeblendet (Script kennt die Route nicht); Kalibrieren geht (Route-id `adhoc`).
- **ORS-Schlüssel im Handy:** Christof nimmt den bestehenden Schlüssel und trägt ihn in den App-Einstellungen ein (`localStorage['ladeplanung.ors']`), **nie ins Repo**. Grund: Repo und Pages sind öffentlich, fremde Nutzung würde das Kontingent aufbrauchen bzw. den Schlüssel sperren (dann auch Routenberechnung im Script tot).
- **Fremde Stationen (v0.25.0, DE seit v0.26.0):** nur bei „Route ab hier“, nicht bei Stammstrecken, **ab 100 kW**. CH: Migrol (beim Bund unter „M-Charge“, Name „Migrol | Ort n“), Tesla, AMAG (nur Cham, Volketswil). DE: EnBW mobility+ (≈ 1740) und Tesla Germany (≈ 330); **ohne** Tesla Manufacturing Brandenburg (Werk) und EnBW Ostwürttemberg DonauRies (regionale Tochter) – Christof 14.10.2026. CSV-Link der Bundesnetzagentur trägt das Datum → `neuesterCsvLink` sucht ihn auf der Seite. App filtert vor dem Zuordnen per Rechteck um die Route (≈ 0,2 s am PC).
- **Bekannte Abschnitte (v0.27.0, Christof 14.10.2026, Variante a):** Auf Abschnitten von „Route ab hier“, die auf einer Stammstrecke liegen (je km geprüft, ≤ 1,5 km Abstand, beide Richtungen; bekannte Stücke < 3 km = Kreuzung → unbekannt, unbekannte Lücken < 3 km mitten in bekannt → bekannt), **nur eigene Stationen**; fremde nur auf unbekannten Abschnitten. **Seit v0.28.0 (Christof 15.10.2026, Variante b):** liegt auf einem bekannten Abschnitt keine einzige eigene Station (Richtung nicht „rueck“), gelten dort die fremden – Anlass Ovronnaz → Villars, Rhonetal ohne eigene Station (Migrol Collombey erscheint). Grund: Christof hat auf seinen Strecken selbst geprüft, wo Stationen Sinn machen. Bewusst in Kauf genommen: Rhonetal (Teil der Savona-Strecken) hat keine eigene Station (bis v0.27.1 blieben bei Ovronnaz → Neuenrade die ersten ~94 km leer; Alternative „Lückenregel 20 km“ abgelehnt). `bekannteAbschnitte(r)` cached in `r.bekannt {schluessel: routes.json-erzeugt + Routen-ids, km: [bool]}`.
- **Vorrang auf der Karte (v0.26.0, Christof):** eigene Stationen (★ zuerst), AMAG, EnBW, Migrol, Tesla, Rest (`FIRMEN_VORRANG`, `vorrang`). Bestimmt, wer oben liegt und wessen Schild bei Überdeckung bleibt; die Liste bleibt nach Entfernung. Was ≤ 150 m neben einer eigenen Station liegt, ist dieselbe Station → nur die eigene. **Seit v0.30.0 (Christof 17.10.2026, Variante 1b):** derselbe Anbieter (`gleicheFirma` über `firmaVon`) bis 1 km um eine eigene Station → ausgeblendet (Gegenseite der Raststätte, Ladepark im Ort); unter fremden je Anbieter im Umkreis von 1 km nur die nächste an der Route. Anlass Speyer → Neuenrade: EnBW Pfungstadt dreimal (eigene p038 = Ost, fremd West und Mainstr.). `hole-bundesdaten.js` 1.3.0 (`eindeutigeNamen`): gleiche Namen bekommen die Straße ohne Ort/Hausnummer („EnBW Pfungstadt (Raststätte Ost)", „(Mainstr.)"). Gestrichelt mit „nicht in deiner Liste“; Details: „In meine Liste übernehmen“ → `?neu=1&link=…/maps/search/?api=1&query=lat,lon&name=&betreiber=&kw=&anzahl=` (Script v0.20.0: `vorbelegungNeu_`, `query=` in `werteMapsUrlAus_`).
- **Abseits (App v0.25.2, Christof 14.10.2026):** Station ausblenden, wenn ihr Abzweig (`quer_km` > 1) länger ist als der Weg entlang der Route bis dorthin – liegt neben/hinter dir (Anlass: Migrol Sion als „nächste“ bei Ovronnaz → Neuenrade, Route ging erst ostwärts zur A9). Große Zahl, Details, Karte = **ganzer Weg** `weg = km + abseits`; `km` (entlang) bleibt für Lücken „danach x km“; Liste nach `weg` sortiert. Eigene Stationen weiter bis 10 km neben der Route, **fremde nur bis 3 km** (`FREMD_MAX_KM`). Faustregel: 5 km abseits ≈ 10–14 km Umweg, 12–18 min, 2–3 % Akku.
- **Details (v0.25.5, Christof):** Lage, Akkubedarf, Notiz, Adresse, Betreiber, Preis, Leistung, Ladepunkte, Richtung, Streckenkm (+ Quelle bei fremden). Ohne Annahmen (stehen in der Fußzeile), Favorit, Koordinaten, id.
- **Nicht erreichbar = grau** (ganze Zeile, alle Routen), rot nur noch für erreichbar unter Reserve.
- **Karte (v0.25.0):** Knopf „Karte“ oben (nächste Station voraus) und „Auf Karte“ in den Details. Leaflet 1.9.4 von cdnjs mit SRI-Prüfsumme, erst beim Öffnen geladen; Kacheln tile.openstreetmap.org. Ganze Route violett `#6a2fd6` mit weißem Rand (v0.25.5; grau sah aus wie Grenzen, rot = unter Reserve), akzentfarben der Weg ab Linienposition bis zur Station (+ gestrichelter Abzweig bei `quer_km` > 0,2), blau der Standort, Stationen farbig wie die Liste, fremde weiß gefüllt/gestrichelt. **Seit v0.25.3 alle erreichbaren Stationen mit Schild**, seit v0.25.4 mit Firma „Tesla · 26 km · 39 %“ (`firmaVon`: Betreiber, sonst bekannter Name am Anfang) (ohne Akku-Eingabe nur km), gewählte „x km · Rest ≈ y %“; überdeckte Schilder ausgeblendet (`ordneSchilder`, bei `zoomend` neu, gewählte und nähere zuerst); nicht erreichbare klein grau ohne Schild. Antippen: Punkt, unsichtbare 20-px-Tippfläche oder Schild (Leaflet-Tooltips lassen Tipps sonst durch: `pointer-events: none`) wählt die Station. Knopf „Karte“ zoomt auf dich + alle erreichbaren, „Auf Karte“ aus den Details auf dich + diese Station. Überlagernde Seiten mit `nachVorn()`, Zurück schließt nur die oberste.

Weiter gültig aus dem Brief: keine Google Directions/Distance Matrix/Places API, kein Ziel-Versand ans Auto, keine eigene Belegt-/Preis-Logik.

---

## 10. Aktueller Datenstand (15.09.2026)

- **43 Ladepunkte** (p001–p049 mit Lücken; neu p048 EnBW Kißlegg, p049 EWE Go Lindau – beide Ingolstadt-Route). Nur p019 Lörrach (> 10 km) ohne Route.
- **Routen** (Stand 09:57, Format 3): neuenrade 716 km (Basel–A5–Frankfurt–A45), ingolstadt 621 km (Bern–Zürich–Winterthur–St. Margrethen–Lindau–A96), savona_simplon 478 km, savona_bernhard 415 km. Start aller Routen `46.5043239,6.4912739` (Christofs Startpunkt).
- **Modell:** 5 ABRP-Vergleichswerte (Ausreißer-Zeile von Christof gelöscht). Gesamt 0,94 · Fahrt 0,97 · Höhe 1,16 · Heizung 1 (fest) · Ø Abweichung 3,5 %, Tendenz +0,2 %. Bei ABRP-Tempo lag die Physik nur ~6 % zu hoch; das Modell rechnet den Simplon noch etwas zu sparsam (65 % statt 72 %).
- Handy-Abnahme bestanden: Adresse in My CUPRA, Google Maps, ABRP, Installation (Kriterien 8–10). Kriterien 1–7 im Browser mit Simulation bestanden.
- Die Spalte „Kalibrierung" und das Entfernen der alten Status „keiner Route zugeordnet (> 2 km)" werden erst beim nächsten Kalibrieren bzw. Export im Sheet sichtbar.

---

## 11. Offene Punkte und Ideen

- **Nach Brief: erst eine echte Fahrt**, dann über Weiteres entscheiden. Dabei „Losfahren"/„Angekommen" mit Bordcomputer-Ø-Tempo nutzen → erste gemessene Kalibrierwerte (Gewicht 1).
- Heizungsfaktor braucht Werte mit ≥ 10 °C Temperaturunterschied (Winterfahrten).
- **Modellstand 19.09.2026:** 6 ABRP-Werte, gesamt 0,91 · Fahrt 0,98 · Höhe 1,16 · Heizung 0,94, Ø Abweichung 4,6 %. Bei Morges–Gossau liegt das Modell bei gleichem Tempo noch rund 7 % über ABRP. `modell.tempo.faktor` ist noch 1 (keine echte Fahrt).
- **Nach v0.16.0 zu tun (Christof):** Wartung → „Routen berechnen und veröffentlichen" (übernimmt die neue Augsburg-Route, Format 4 → alle Routen neu; bei „Zeitlimit" nochmal tippen). Autobahnen in Spalte „Straße" eintragen.
- **Routeninfo-Seite** (zurückgestellt, 18.09.2026): Verlauf der Strecke (Autobahnen mit km, Orte), Länge/Fahrzeit/hm/höchster Punkt, Energie ganze Strecke + Ladestopps, „du bist auf A 96 bei km …", Hinweise Vignette/Maut von Hand (CH Vignette; A14 Hohenems–Hörbranz vignettenfrei; IT Maut; Tunnelgebühr Gr. St. Bernhard). `dauer_s`/`hoechster` stehen schon in routes.json. Straßen-Verlauf aus ORS-Namen ist lückenhaft; OSM-Overpass liefert ihn sauber (getestet), geht aber nicht aus Apps Script (s. §12) → bräuchte GitHub Action mit Node.
- Straßennamen der Route fehlen, wo ORS keine liefert (A 96, A 45) – im Titel hilft die Spalte „Straße".
- A5/A67 bei Neuenrade: Route läuft über A5, Raststätten an der A67 mit ~4 km Querabstand (akzeptiert durch 10-km-Korridor).
- **OBD-Adapter Veepeak OBDCheck BLE+ (App v0.20.0, 03.10.2026):** Einstellungen → Schalter; Tippen auf „Standort“ liest per Web Bluetooth den Akku (kein Dauerlesen). Bestätigt mit `obd-test.html`: Dienst `fff0`, schreiben `fff2`, Antworten über `fff1` (nicht `ffea`); ELM327 v2.2; `ATSP7, ATCP17, ATSHFC007B, ATCRA17FE007B` → `22028C` = `62 02 8C A`, BMS-SoC = A/2,5. Display ≈ (BMS − 4,5)·100/91,5 – **vorläufig aus einem Punkt** (BMS 18,4 = Display 15 %); zweiten Punkt bei hohem Akku messen (03.10. 17:22: App 27 %, Display 26 % – BMS-Wert unbekannt; Einstellungen zeigen ihn ab v0.23.1). Ohne Fahrt startet der Wert eine, sonst `fahrt.stand` für „jetzt ≈“; „Angekommen“ gibt `ende_soc` (≤ 10 min alt) an Kalibrieren. Chrome auf dem Pixel hat ohne Flag kein `getDevices` → nach jedem Öffnen der App einmal Geräteauswahl; App v0.23.0 nutzt `getDevices`, falls vorhanden (Flag „Use the new permissions backend for Web Bluetooth“). 05.10.: Fehler „Bluetooth device is no longer in range“ bei laufendem Adapter → Flag wirkt offenbar; ein Gerät aus `getDevices` gilt erst nach empfangener Werbung als erreichbar → App v0.24.1 wartet per `watchAdvertisements` (10 s), sonst beim nächsten Tippen wieder Geräteauswahl. **06.10. von Christof bestätigt: klappt, Akkustand der App = Anzeige im Auto.** Musik per Bluetooth im Auto ist nicht die Ursache (klassisches BT, Adapter BLE). Fahrt-Leiste zeigt nur „Akku jetzt ≈“ (Christof). Ab v0.24.0 gilt der letzte bekannte Akkuwert für jede gewählte Route/Richtung (`akkuJetzt`: Ort des Werts auf die gewählte Route projiziert, q > 10 km → Wert unverändert); `fahrt.route` zählt nur noch für die Kalibrierung. Kilometerstand `2202BD`: Bytes 2–4 (47791 = `00 BA AF`), mehrteilige Antwort, braucht `ATFCSH17FC007B, ATFCSD300000, ATFCSM1` (bestätigt). `22028C` antwortete einmal NO DATA → App fragt bis zu 3×. App v0.21.0 liest den Kilometerstand mit; „Fahrt beenden“ (früher „Angekommen“, v0.22.0) nimmt die km vom Zähler (`km_quelle`, `km_route`), wenn Start und Ankunft per Adapter gelesen wurden (Notiz im Blatt Fahrten). Adapter-Wert > vorheriger + 2 % → Laden erkannt, neue Fahrt. Standort = nur Anzeige; kalibriert wird nur über „Fahrt beenden“ (Christof: ein paar Fahrten reichen).
- Aus dem Brief noch nicht gebaut: Stufe 2 teilweise (Routen per Link ja, „Route ab hier“ ja seit v0.25.0, Teilen-Ziel nein), Stufe 3 teilweise (ich-tanke-strom.ch für Migrol/Tesla ja, BNetzA nein), Stufe 4 (Filter, onChange-Trigger).
- **Route ab hier noch nicht echt getestet** (nur mit nachgebautem ORS, Route von OSRM): Christof muss den ORS-Schlüssel in der App eintragen. Beim ersten echten Lauf prüfen: Geocoder-Namen auf Deutsch? Ausweichen über Gr. St. Bernhard bei echten ORS-Routen (z. B. Genf → Aosta; mit OSRM getestet)? Höhenmeter plausibel? Autoverlad (Lötschberg) würde als Fahrstrecke gezählt.
- Idee Christof: später Stationen entlang einer **noch unbekannten Route** – ist mit „Route ab hier“ im Wesentlichen erledigt; Karte ohne Ziel (Umkreis) zurückgestellt.
- **Idee Christof (17.10.2026): altes Handy als Fahrtenschreiber** (Bildschirm an, misst laufend, schreibt irgendwohin) – Rückmeldung gegeben, nicht gebaut. Würde GPX ersetzen und live Fahrzeit/Pausen zeigen.
- **Reisezeit-Voraussage:** nach 3–5 ausgewerteten Fahrten aus GPX ableiten (Faktor auf Routendienst-Zeit, Ladezeiten, Pausen).
- **Preis-Aktualisierung:** erster echter Lauf (Mitte Oktober 2026) → alle „unsicher", Datum blieb alt → Script v0.21.0. Nächster echter Lauf: prüfen, ob `engine: native` bei Gemini angenommen wird (Meldung „Google-Suche des Modells" vs. „teils Standardsuche"), wie viele „bestätigt", Kosten bei OpenRouter. Falls weiter schlecht: Modell `perplexity/sonar-pro` über die Skripteigenschaft `PREIS_MODELL`.

---

## 12. Stolpersteine (gelernt)

- `clasp create --type sheets --parentId …` ignoriert die parentId und legt ein **neues** Sheet an → ohne `--type`.
- Web-App hat kein aktives Sheet → `tabelle_()` (Fallback `openById`). `SpreadsheetApp.getUi()` wirft im Editor und in der Web-App → `meldungsUi_()`.
- Neue Blätter haben **26 Spalten** → vor dem Schreiben erweitern (`fahrtenBlatt_`).
- Deutsches Gebietsschema: `"46.2,8.0"` kann als Zahl gelesen werden → `setNumberFormat('@')`.
- `google.script.run`-Funktionen dürfen nicht auf `_` enden.
- `<dialog>`-`close`-Ereignis im Browser-Pane unzuverlässig → Übernahme im `submit`-Handler.
- GitHub Pages cacht → Daten mit `?t=Date.now()` laden.
- Vergleichswerte ohne Fahrzeit verfälschen die Kalibrierung (Tempo ist der größte Einfluss: 110 → 130 km/h ≈ +25 %).
- Rohe ORS-Höhen summieren Rauschen (Faktor 2–3); 1000 hm bergauf ≈ 6,6 kWh ≈ 11 % Akku.
- Commit-Nachrichten mit „…" in Bash brechen die Quotierung → `-F Datei`.
- Das Script committet selbst ins Repo → vor jedem Push `git pull --rebase`.
- **ORS `avoid_polygons` nur bis 150 km Routenlänge** (sonst HTTP 400 „With avoid areas, the approximated route distance must not be greater than 150000.0 meters") → für lange Routen keine Sperrflächen, stattdessen prüfen und mit Via neu rechnen.
- Browser-Pane: ein alter Service Worker auf localhost:8765 ließ neue Dateien (fremde.json) mit `ERR_FAILED` scheitern, obwohl der Server 200 lieferte → `navigator.serviceWorker.getRegistrations()` abmelden und neu laden.
- Google Maps teilt seit Sept. 2026 teils Links **ohne Koordinaten** (nur Name + Adresse + Orts-ID `0x…:0x…`); die Maps-Seite liefert ohne Browser auch keine → Geokodierung der Adresse.
- Die Action startet nur bei Änderungen unter `apps-script/` (Pfadfilter) – sonst würde jede Kalibrierung/jeder Export des Scripts neu veröffentlichen.
- Jede Veröffentlichung legt eine neue Apps-Script-Version an; Google begrenzt die Anzahl je Projekt (vermutlich 200, nicht geprüft). Daher nicht für Kleinigkeiten mehrfach hintereinander veröffentlichen.
- **Overpass (OpenStreetMap) lehnt Apps Script ab**: HTTP 406 bei der Kennung „Google-Apps-Script", UA nicht änderbar. Von PC/Action mit eigener Kennung geht es; große Abfragen in kleinen Stücken (≈ 8 × 20-km-Rechtecke) mit Pausen, sonst „Dispatcher timeout"/Drosselung.
- Geocoder mit nur Straße + Hausnummer findet irgendeine gleichnamige Straße (Wuppertal statt Neuenrade) → immer die ganze Adresse.
- Dialoge: Übernahme im `submit`-Handler, `close` nur als Rückfall mit Sperre (gilt für Einstellungen und Simulation).
- Action rot bei „clasp show-authorized-user"/`invalid_grant` → Secret abgelaufen oder widerrufen (z. B. nach `clasp logout` am PC). Erneuern siehe §4.
- **ORS-Ortssuche (geocode) im Browser nur mit `api_key=` in der Adresse**: deren CORS-Vorabprüfung erlaubt keinen `Authorization`-Kopf (der Routendienst `/v2/directions` schon) → Chrome bricht ab, die App sah nur „keine Verbindung" (bis v0.27.0, Christof 15.10.2026: Villars-sur-Ollon ließ sich nicht eingeben). Fehlerantworten (403 falscher Schlüssel) tragen keinen CORS-Kopf → im Browser nicht von „kein Netz" zu unterscheiden.
