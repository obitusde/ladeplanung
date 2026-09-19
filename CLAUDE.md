# Ladeplanung Cupra Born — Projektstand für Claude

**Stand 18.09.2026** · App (`index.html`) v0.16.1 · Apps Script (`apps-script/Code.js`) v0.17.1 · Veröffentlichen per GitHub Action (`.github/workflows/apps-script.yml`) v1.0.0
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

PWA für lange Fahrten mit dem **Cupra Born 58 kWh (2021)**. Zeigt die Ladepunkte **voraus** auf einer Stammstrecke: Entfernung entlang der Straße, Anstieg, **Akku-Prognose**, Leistung, Lage (Straße, Raststätte, „x km abseits"), Notiz. Keine Navigation, kein Belegt-Status, keine Preise – Christof entscheidet selbst.

Stammstrecken (je Hin/Rück): `neuenrade` (Morges–Neuenrade), `ingolstadt` (Ingolstadt über München, ohne Via), `ingolstadt_augsburg` (Via B 17 Hurlach `48.13813,10.83188` + B 300 Aichach `48.52578,11.23978` → A 8 Friedberg-Derching), `savona_simplon`, `savona_bernhard`; weitere per Maps-Link (z. B. Brig). Ulm-Variante bewusst nicht. **Neue Routen (seit v0.17.0) per geteiltem Google-Maps-Routenlink**: Wartung → „Route hinzufügen" (Feld) oder im Blatt Routen nur die Spalte `Maps-Link` füllen und „Routen berechnen". Das Script füllt Start/Via/Ziel, Name („Morges – Ziel (Via-Orte)"), id (aus dem Zielort, `routenId_`); Start ≤ 3 km von `START_MORGES` → genau dieser. Parser `routenpunkteAusUrl_`: Pfadsegmente nach `/maps/dir/` = Wegpunkte, im data-Block `!2m2!1d<lon>!2d<lat>` je benanntem Punkt; Anzahl passt nicht → Fehler (gezogene Umwege), keine Koordinaten → Geocoder. Getestet nur mit einem echten Link ohne Zwischenziel (Morges → Brig-Glis) – Zwischenziele beim ersten echten Link prüfen.

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
| Script Properties | `ORS_API_KEY` (openrouteservice, Basic), `GITHUB_TOKEN` (fine-grained, Contents Read/Write nur dieses Repo). **Nie ins Repo, nie im Frontend. Claude trägt keine Schlüssel ein.** |
| GitHub-Secret `CLASPRC_JSON` | Inhalt von `~/.clasprc.json` (clasp-Login). Nutzt die Action zum Veröffentlichen. **Nie ausgeben, nie ins Repo.** Erneuern: am PC `clasp login`, dann `gh secret set CLASPRC_JSON -R obitusde/ladeplanung < ~/.clasprc.json` |
| gh CLI (PC) | als `obitusde` angemeldet |
| clasp (PC) | angemeldet (`~/.clasprc.json`) – nur noch für Diagnose und zum Erneuern des Secrets, **nicht** zum Veröffentlichen |

Web-App-Seiten (`doGet`):
`?id=p023` Bearbeiten/Löschen · `?neu=1` Hinzufügen · `?seite=wartung` Wartung & Status (auch „Route hinzufügen" per Link) · `?seite=kalibrieren&fahrt=<JSON>` Fahrt kalibrieren · `?seite=vergleich[&route=…&richtung=hin|rueck&nach=p041]` Vergleichswert.

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
| `index.html` | Die PWA (CSS+JS eingebettet, keine Bibliotheken, kein Service Worker). Rechenkern `projiziere`, `haversine`, `streckenwerte`, Energieblock zwischen `// ENERGIE-START` und `// ENERGIE-ENDE` (muss identisch zu Code.js bleiben – Test prüft das). `window.ladeplanung` für Tests. |
| `manifest.json`, `icon-*.png` | Installierbarkeit (Blitz-Icon) |
| `routes.json` | vom Script exportiert, Format 1.1 |
| `linien/<route>.json` | vom Script, eine Datei je Route (Format 3) |
| `modell.json` | Verbrauchsmodell mit Kalibrierung, vom Script (oder lokal mit `kalibriereZeilen_` erzeugt) |
| `apps-script/Code.js` | gesamte Server-Logik (siehe §8) |
| `apps-script/Formular.html` | Bearbeiten / Löschen / Hinzufügen |
| `apps-script/Wartung.html` | Wartung & Status (Knöpfe mit „Wann"-Erklärung) |
| `apps-script/Kalibrieren.html` | Fahrt kalibrieren (nach „Angekommen") |
| `apps-script/Vergleich.html` | Vergleichswert aus ABRP / My CUPRA |
| `apps-script/appsscript.json` | Zeitzone Europe/Zurich, V8, `webapp` MYSELF |
| `.github/workflows/apps-script.yml` | Veröffentlicht Apps Script bei Push auf `main` (nur bei Änderungen unter `apps-script/`) |
| `tests/test-*.js` | links, routen, bereinigung, routen-vorgaben, formular, modell, vergleich, spalten, routenlink |
| `tests/formular-vorschau.js`, `tests/erzeuge-testdaten.js`, `tests/server.js`, `tests/analyse-routen.js` | Werkzeuge |
| `tests/fixtures/` | aufgelöste Maps-Links, synthetische Routen, generierte Vorschauseiten |
| `docs/Umsetzungsbrief_v5.0.md` | ursprünglicher Auftrag |

---

## 7. Datenformate

**Blatt `Ladepunkte`** (Reihenfolge seit v0.16.1: von Hand gepflegt vorne): `id | Maps-Link | Name | Straße | Notiz | kW | Anzahl | Richtung (hin/rueck/beide) | Favorit (ja) | Betreiber | Adresse | Lat | Lon | Status`. Das Script arbeitet nach Spaltennamen; `ordneSpalten_()` ordnet beim Export ein abweichendes Blatt um (eigene Zusatzspalten bleiben rechts). `Straße` pflegt Christof selbst (auch im Formular), **Nummern immer ohne Leerzeichen** („A96"; `ohneLeerzeichen_` gleicht auch ORS-Namen an, Trenner `,` `/` `;`): „A 8", mehrere „A 96, A 7" (Titel zeigt die, auf der die Route dort fährt), „–" = keine; leer → Straße der Route aus den ORS-Namen (`waehleStrasse_`). Spalte wird bei Bedarf angelegt (`spalteSicherstellen_`). Das Script schreibt nur leere Felder; `Notiz` nur beim Zusammenführen von Dubletten. `Richtung` bezieht sich auf die Route: `hin` = nur auf der Fahrt ab Morges erreichbar.

**Blatt `Routen`:** `id | Name | Start | Via (;-getrennt) | Ziel | Länge km | Fahrzeit | Stand | Maps-Link`. Start/Via/Ziel als `lat,lon` (als Text schreiben, deutsches Gebietsschema!) oder Maps-Link.

**Blatt `Fahrten`** (32 Spalten): `erfasst | Route | Richtung | Start | Ende | Start Lat | Start Lon | Ende Lat | Ende Lon | km | hm auf | hm ab | Dauer h | Ø km/h Bordcomputer | km/h verwendet | Zusatzgewicht kg | Temp Start | Temp Ende | Temp Ø | Akku Start % | Akku Ende % | Akku erwartet % | Verbrauch kWh | Anteil Fahrt kWh | Anteil Höhe kWh | Anteil Heizung kWh | Modell kWh | Abweichung % | verwenden | Notiz | Quelle (gemessen/ABRP/My CUPRA) | Kalibrierung`. Christof darf Zeilen löschen oder `verwenden = nein` setzen, danach Wartung → „Neu kalibrieren".

**Blatt `Gelöscht`:** gelöschte Ladepunkte (Zeile + „gelöscht am"); ihre ids werden nie neu vergeben.

**`routes.json` (1.2):**
```json
{ "version": "1.2", "erzeugt": "ISO",
  "routen": [{ "id", "name", "laenge_km", "hm_hin", "hm_rueck", "dauer_s", "hoechster": [km, m], "linie": [[lat, lon, km, hm_hin_kum, hm_rueck_kum], …] }],
  "punkte": [{ "id", "name", "adresse", "lat", "lon", "betreiber", "kw", "anzahl", "richtung", "favorit", "notiz", "link", "strasse",
               "zuordnung": [{ "route", "km", "hm_hin", "hm_rueck", "quer_km", "strasse", "raststaette" }] }] }
```
**`linien/<id>.json`:** `{ version, id, name, eingabe ("Start|Via|Ziel"), erzeugt, ors_distanz_km, ors_dauer_s, laenge_km, hm_hin, hm_rueck, stuetzpunkte_voll, format: 4, strassen: [[km_ab, name]], hoechster: [km, m], linie }`.
**`modell.json`:** `{ version, fahrzeug {kapazitaet_kwh 58, masse_kg 1811, fahrer_kg 80}, physik {cda 0.63, crr 0.008, eta 0.78, rekuperation 0.6, hilfsleistung_kw 0.3, heiz_kw_pro_grad 0.14, heiz_schwelle_c 18}, korrektur {gesamt, fahrt, hoehe, heizung}, erzeugt, kalibrierung {fahrten, abweichung_prozent, stand, methode, quellen {Quelle: {n, abweichung, tendenz}}} }`.

**App-Zustand** `localStorage['ladeplanung.v1']`: `route, richtung, sim {aktiv, lat, lon, label}, einst {geschwindigkeit 120, zusatzgewicht 0, temperatur '' (=auto), reserve 10}, wetter {temp, zeit, lat, lon}, fahrt {start_soc, start_zeit, start_lat, start_lon, route, route_name, richtung, start {km, hm_hin, hm_rueck, q}}, ankunft {url, zeit}`.

---

## 8. Kernlogik

**Streckenkilometer-Modell** (Brief §2, unverändert): Position äquirektangulär auf die Linie projizieren (`x = lon·111,320·cos(lat0)`, `y = lat·110,574`) → Streckenkilometer `s`, Querabstand `q`. Distanz zu P: hin `km(P) − s`, rück `s − km(P)`; ≤ 1 km ausblenden. Anstieg aus den kumulierten Werten der Fahrtrichtung. **q > 10 km → Luftlinie** ohne Höhen und ohne Prognose.

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

**Prognose in der App:** Bedarf je Station = Strecke ab Position (+ `quer_km` als Umweg) mit Einstellungen Tempo/Zusatzgewicht/Temperatur. Temperatur: Eingabe, sonst Open-Meteo am Standort (Mittel aus jetzt und +3 h, max. 30 min/30 km alt), sonst 15 °C. Mit **„Losfahren"** (Akku %) → „jetzt ≈" = Start − Bedarf(Start→Position), je Station „Ankunft ≈ x %", **rot unter der Reserve**, unter 0 „nicht erreichbar (fehlen ≈ x %)"; Marke **„letzte vor Reserve"**. Je Station „danach x km bis zur nächsten" bzw. „letzte Station, danach x km bis zum Ziel". Nur volle km. Notiz-Kasten über die ganze Zeilenbreite. Fußzeile: Ziel-km und „braucht ≈" bzw. nach Los „am Ziel ≈". Höhenmeter nur in den Details (v0.16.0). **„Angekommen"** öffnet `?seite=kalibrieren` mit vorbefüllten Werten.

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
- Mehrere Varianten je Stammstrecke erlaubt (Savona).

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
- **Nach v0.16.0 zu tun (Christof):** Wartung → „Routen berechnen und veröffentlichen" (übernimmt die neue Augsburg-Route, Format 4 → alle Routen neu; bei „Zeitlimit" nochmal tippen). Autobahnen in Spalte „Straße" eintragen.
- **Routeninfo-Seite** (zurückgestellt, 18.09.2026): Verlauf der Strecke (Autobahnen mit km, Orte), Länge/Fahrzeit/hm/höchster Punkt, Energie ganze Strecke + Ladestopps, „du bist auf A 96 bei km …", Hinweise Vignette/Maut von Hand (CH Vignette; A14 Hohenems–Hörbranz vignettenfrei; IT Maut; Tunnelgebühr Gr. St. Bernhard). `dauer_s`/`hoechster` stehen schon in routes.json. Straßen-Verlauf aus ORS-Namen ist lückenhaft; OSM-Overpass liefert ihn sauber (getestet), geht aber nicht aus Apps Script (s. §12) → bräuchte GitHub Action mit Node.
- Straßennamen der Route fehlen, wo ORS keine liefert (A 96, A 45) – im Titel hilft die Spalte „Straße".
- A5/A67 bei Neuenrade: Route läuft über A5, Raststätten an der A67 mit ~4 km Querabstand (akzeptiert durch 10-km-Korridor).
- **OBD-Adapter Veepeak OBDCheck BLE+**: Web Bluetooth geht auf dem Pixel. Community-PIDs (MEB, unbestätigt): SoC `22028C` (Header `ATSP7;ATAT1;ATST96`), Kilometerstand `2202BD` (Header `ATSHFC007B`, `ATCRA17FE007B`). Idee: Live-Akkustand statt Eingabe bei „Losfahren"/„Angekommen" – ausdrücklich **ohne Daueraufzeichnung**. Erst mit einer kleinen Testseite prüfen.
- Aus dem Brief noch nicht gebaut: Stufe 2 (geteilte Google-Maps-Routen, „Route ab hier"), Stufe 3 (Registerdaten BNetzA/ich-tanke-strom.ch), Stufe 4 (Filter, Service Worker, onChange-Trigger).

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
- Google Maps teilt seit Sept. 2026 teils Links **ohne Koordinaten** (nur Name + Adresse + Orts-ID `0x…:0x…`); die Maps-Seite liefert ohne Browser auch keine → Geokodierung der Adresse.
- Die Action startet nur bei Änderungen unter `apps-script/` (Pfadfilter) – sonst würde jede Kalibrierung/jeder Export des Scripts neu veröffentlichen.
- Jede Veröffentlichung legt eine neue Apps-Script-Version an; Google begrenzt die Anzahl je Projekt (vermutlich 200, nicht geprüft). Daher nicht für Kleinigkeiten mehrfach hintereinander veröffentlichen.
- **Overpass (OpenStreetMap) lehnt Apps Script ab**: HTTP 406 bei der Kennung „Google-Apps-Script", UA nicht änderbar. Von PC/Action mit eigener Kennung geht es; große Abfragen in kleinen Stücken (≈ 8 × 20-km-Rechtecke) mit Pausen, sonst „Dispatcher timeout"/Drosselung.
- Action rot bei „clasp show-authorized-user"/`invalid_grant` → Secret abgelaufen oder widerrufen (z. B. nach `clasp logout` am PC). Erneuern siehe §4.
