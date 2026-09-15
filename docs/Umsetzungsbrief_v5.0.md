# Umsetzungsbrief: Ladeplanungs-App Cupra Born

**Version 5.0** — 14.09.2026 · Ersetzt v4.0 und alle früheren Fassungen.

Neu geordnet nach dem Grundsatz **klein anfangen**. Stufe 1 ist eine vollständige, benutzbare App mit dem kleinstmöglichen Umfang. Die Stufen 2 bis 4 sind sauber abgegrenzt und werden erst gebaut, wenn Stufe 1 im Auto bestanden hat — möglicherweise nie.

Änderungen gegenüber v4.0:
- **Offline-Betrieb ist keine Anforderung mehr.** Der Nutzer ist unterwegs praktisch durchgehend online. Der Service Worker fällt aus Stufe 1 heraus und wandert in Stufe 4.
- Geteilte Google-Maps-Routen sind aus Stufe 1 in **Stufe 2** verschoben — sie brauchen einen Web-Endpunkt, den Stufe 1 nicht hat.
- Registerdaten sind **Stufe 3**, mit einer neuen kleinen Variante: Nachschlagen technischer Felder statt Vorschlagen ganzer Listen.
- Routen werden wie Ladepunkte über Google-Maps-Links eingetragen, nicht über abgetippte Koordinaten.

---

## 0. Auftrag

Baue **Stufe 1** vollständig, lege das Repo an und veröffentliche über GitHub Pages. Arbeite die Etappen in 4.6 der Reihe nach ab, jede mit ihrer Prüfung. Baue **nichts** aus den Stufen 2 bis 4, auch nicht vorbereitend — außer dort, wo dieses Dokument es ausdrücklich verlangt (Spalten, die schon angelegt werden, damit später kein Umbau nötig ist). Frage nur nach, wenn eine Angabe hier wirklich fehlt.

**Nutzer:** Christof, GitHub-Account `obitusde`, wohnhaft bei Morges am Genfersee. Sein Stack aus anderen Projekten: Apps Script als Backend, Google Sheets als Datenbank, GitHub Pages als Frontend. Er bevorzugt diagnostisch-iteratives Vorgehen — Testfunktion vor Produktivcode —, vollständige Dateien statt Patches, Versionsnummern bei jeder Änderung, deutschsprachige Oberfläche und Kommentare, und ehrlich benannte Unsicherheit statt vorgetäuschter Gewissheit.

**Fahrzeug:** Cupra Born, Baujahr 2021, reale Reichweite 250 bis 350 km.

---

## 1. Was die App leisten soll

Während einer langen Fahrt zeigt sie, **welche Ladepunkte voraus liegen, wie weit entlang der Straße, wie viel Höhenanstieg bis dahin, mit welcher Ladeleistung und was es dort gibt**. Christof entscheidet manuell. Die App navigiert nicht, prüft keine Reichweite und kennt keinen Belegt-Status — das bleibt bei ABRP, der Auto-Software und der EnBW-App.

Drei Stammstrecken, jeweils in beide Richtungen:

| id | Name |
|---|---|
| `neuenrade` | Morges – Neuenrade |
| `ingolstadt` | Morges – Ingolstadt |
| `savona` | Morges – Savona |

Pro Strecke genau eine Route; Hin- und Rückfahrt sind dieselbe Linie, rückwärts gelesen.

---

## 2. Kernalgorithmus — Streckenkilometer-Modell

Das Herzstück, gilt für alle Stufen. Es gibt **keine** Punkt-zu-Punkt-Distanzmatrix.

Der Sinn: aus **einem** Routing-Aufruf ergibt sich die exakte Straßendistanz zu beliebig vielen Stationen — statt für jede Station einzeln eine Distanz abzufragen. Das ist kein Offline-Trick, sondern der Grund, warum die App ohne kostenpflichtige Distanz-API auskommt.

Jede Route liegt als Linie mit Höhenwerten vor. An jedem Stützpunkt sind gespeichert: kumulierte Kilometer ab Start, kumulierter Anstieg in Hinrichtung, kumulierter Anstieg in Rückrichtung. Jeder Ladepunkt bekommt daraus seinen Streckenkilometer.

Unterwegs, rein rechnerisch im Browser:

1. GPS-Position auf die Linie projizieren → eigener Streckenkilometer `s` und Querabstand `q`.
2. Ist `q > 5 km`, greift der Luftlinien-Hinweis (4.4).
3. Distanz zu Punkt P: Hinfahrt `km(P) − s`, Rückfahrt `s − km(P)`. Werte kleiner oder gleich 1 km ausblenden — dort steht man gerade.
4. Anstieg bis P: Differenz der kumulierten Höhenmeter der jeweiligen Richtung.

### Projektion — exakt so implementieren

Lokale äquirektanguläre Projektion um die Referenzbreite `lat0`, den Mittelwert der Routenbreiten:

```
x = lon * 111.320 * cos(lat0 im Bogenmaß)
y = lat * 110.574
```

Für jedes Liniensegment A→B: `t = clamp(((P−A)·(B−A)) / |B−A|², 0, 1)`, Lotfußpunkt `C = A + t·(B−A)`, Abstand `|P−C|`. Das Segment mit dem kleinsten Abstand gewinnt; der Streckenkilometer ist `km(A) + t · (km(B) − km(A))`.

Distanzen zwischen Geokoordinaten mit Haversine, R = 6371.0088 km. Bei vielen Punkten zuerst über das umschließende Rechteck der Route vorfiltern.

---

# STUFE 1 — Minimalversion

Das ist der Bauauftrag. Alles darunter ist Stufe 1, sofern nicht anders vermerkt.

## 4.1 Umfang

**Drin:** Sheet mit zwei Tabellenblättern, vier Apps-Script-Funktionen, eine PWA mit Routenauswahl, Standortabfrage, Liste, Detailansicht mit drei Ausgabewegen, Simulationsmodus.

**Nicht drin:** geteilte Routen, Web-Endpunkt, Registerdaten, Service Worker, Filter, Reichweitenfeld, automatische Trigger.

Kein Backend zur Laufzeit: die App lädt eine statische Datei aus dem Repo und rechnet den Rest selbst.

## 4.2 Google Sheet

### Blatt `Ladepunkte`

| Spalte | Typ | Wer füllt |
|---|---|---|
| `id` | Text, z.B. `p001` | Script |
| `Maps-Link` | URL | Nutzer |
| `Name` | Text | Script, wenn leer |
| `Adresse` | Text | Script, wenn leer |
| `Lat` | Zahl | Script, wenn leer |
| `Lon` | Zahl | Script, wenn leer |
| `Betreiber` | Text | Nutzer |
| `kW` | Zahl | Nutzer |
| `Anzahl` | Zahl | Nutzer |
| `Richtung` | `hin` / `rueck` / `beide` | Nutzer, Vorgabe `beide` |
| `Favorit` | `ja` / leer | Nutzer |
| `Notiz` | Freitext | Nutzer — **das Script fasst diese Spalte nie an** |
| `Status` | Text | Script |

`Richtung` bezieht sich auf die Route, nicht auf Himmelsrichtungen: `hin` heißt „nur auf der Fahrt Morges → Ziel erreichbar".

`Favorit` wird angelegt und exportiert, aber in Stufe 1 nur zur Hervorhebung genutzt, nicht als Filter.

### Blatt `Routen`

| Spalte | Inhalt |
|---|---|
| `id` | `savona` |
| `Name` | Morges – Savona |
| `Start` | Google-Maps-Link **oder** `lat,lon` |
| `Via` | optional, mehrere durch `;` getrennt, Links oder Koordinaten |
| `Ziel` | Google-Maps-Link **oder** `lat,lon` |
| `Länge km` | vom Script |
| `Fahrzeit` | vom Script |
| `Stand` | vom Script |

Start, Via und Ziel dürfen Maps-Links sein — dieselbe Auflösung wie bei Ladepunkten. Der Nutzer soll nirgends Koordinaten abtippen müssen.

**Kontrolle durch den Nutzer:** `Länge km` und `Fahrzeit` sind dazu da, mit Google Maps verglichen zu werden. Weichen sie deutlich ab, hat der Routendienst einen anderen Weg gewählt — typisch bei mautpflichtigen Tunneln, die ein Router zugunsten des Passes meidet. Dann setzt der Nutzer einen Via-Punkt und lässt neu rechnen.

## 4.3 Apps Script

Vier Funktionen, alle über ein eigenes Menü im Sheet. Keine Web-App, kein Endpunkt, keine Trigger.

| Funktion | Aufgabe |
|---|---|
| `setup()` | Legt beide Blätter mit Spaltenköpfen, Datenvalidierung für `Richtung` und `Favorit` sowie einer Beispielzeile an. Idempotent. |
| `aufloeseLinks()` | Für jede Zeile mit `Maps-Link` und leerem `Name` oder `Lat`: Link auflösen, Name, Adresse, Koordinaten eintragen. Gefüllte Felder bleiben unangetastet; nicht auflösbare Zeilen bekommen einen Text in `Status`. Gilt auch für die Link-Felder im Blatt `Routen`. |
| `berechneRouten()` | Holt für jede Zeile in `Routen` die Strecke samt Höhen, rechnet die kumulierten Werte, dünnt aus, schreibt Länge, Fahrzeit und Stand ins Sheet. Wegen der Sechs-Minuten-Grenze pro Route einzeln aufrufbar. |
| `exportJson()` | Ordnet Punkte den Routen zu (Querabstand höchstens 2 km), baut `routes.json`, lädt sie per GitHub-API ins Repo. Reine Rechenarbeit, kein Routing-Aufruf. |

### Routing-Aufruf

`POST https://api.openrouteservice.org/v2/directions/driving-car/geojson`, Body mit `coordinates` als `[lon, lat]`-Paaren in der Reihenfolge Start, Via, Ziel, dazu `"elevation": true`. Die GeoJSON-Geometrie hat dreielementige Koordinaten `[lon, lat, höhe]`.

### GitHub-Upload

`PUT /repos/obitusde/ladeplanung/contents/routes.json`, Inhalt Base64. Beim Aktualisieren muss der `sha` der bestehenden Datei mitgeschickt werden — vorher per `GET` holen.

### Geheimnisse

`ORS_API_KEY` und `GITHUB_TOKEN` in den Script Properties. Nichts davon im Repo, nichts im Frontend.

### `routes.json`

```json
{
  "version": "1.0",
  "erzeugt": "2026-09-14T12:00:00Z",
  "routen": [{
    "id": "savona",
    "name": "Morges – Savona",
    "laenge_km": 482.31,
    "hm_hin": 1980,
    "hm_rueck": 2350,
    "linie": [[46.50930, 6.49830, 0.00, 0, 0], [46.50880, 6.50110, 0.25, 2, 0]]
  }],
  "punkte": [{
    "id": "p001", "name": "Ionity Martigny",
    "adresse": "Route du Levant, 1920 Martigny",
    "lat": 46.10150, "lon": 7.07250,
    "betreiber": "Ionity", "kw": 350, "anzahl": 6,
    "richtung": "beide", "favorit": false,
    "notiz": "Coop, McDonald's",
    "zuordnung": [{"route": "savona", "km": 71.90, "hm_hin": 115, "hm_rueck": 60}]
  }]
}
```

Ein Linien-Stützpunkt ist `[lat, lon, km_kumuliert, hm_kumuliert_hin, hm_kumuliert_rueck]`.

**Ausdünnung:** die kumulierten Werte aus der vollen Auflösung der Routing-Antwort berechnen, danach ausdünnen — einen Stützpunkt behalten, wenn seit dem letzten behaltenen mehr als 250 m zurückgelegt wurden oder sich die Höhe um mehr als 10 m geändert hat; erster und letzter bleiben immer. Runden: Koordinaten 5 Nachkommastellen, Kilometer 2, Höhenmeter 0.

## 4.4 Frontend

Eine `index.html` mit eingebettetem CSS und JavaScript, dazu `manifest.json` (damit sie sich installieren lässt) und `routes.json`. Keine externen Bibliotheken, kein Service Worker. Mobil zuerst, im Auto bei Sonnenlicht lesbar: große Zeilen, hoher Kontrast, Dark Mode über `prefers-color-scheme`.

**Hauptansicht.** Kopfzeile mit Routenauswahl, Umschalter Hin/Rück und Schaltfläche „Standort". Zuletzt gewählte Route und Richtung in `localStorage` merken.

Darunter die Liste der Punkte voraus, aufsteigend nach Distanz. Pro Zeile: **Distanz in Kilometern** groß, darunter `+ Höhenmeter · kW · Betreiber`, darunter die Notiz. Favoriten optisch hervorgehoben, aber nicht umsortiert.

Fußzeile: Restdistanz bis zum Routenziel, Zeitstempel der Daten, gemessene **GPS-Genauigkeit in Metern**.

**Detailansicht.** Alle Felder, dazu drei Schaltflächen:

| Button | Wirkung |
|---|---|
| **Adresse kopieren** | Adresse in die Zwischenablage, zum Einfügen in My CUPRA, von wo aus das Ziel ans Auto geht |
| **Google Maps** | `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>` |
| **ABRP** | `https://abetterrouteplanner.com/?destinations=[{"address":…,"lat":…,"lon":…}]`, URL-kodiert |

Kein `car_model`-Parameter: der Nutzer ist bei ABRP angemeldet und hat dort genau ein Fahrzeug hinterlegt.

**Simulationsmodus.** Umschalter in den Einstellungen: statt echtem GPS eine von Hand gesetzte Position, per Koordinateneingabe oder Auswahlliste — Morges, je ein Punkt in der Mitte jeder Strecke, einer kurz vor dem Ziel, einer weit abseits. Standardmäßig aus. **Festes Feature, kein Wegwerf-Code:** ohne ihn ist die App nur durch echte Fahrten testbar, und die Abnahmekriterien setzen ihn voraus.

**Luftlinien-Hinweis.** Querabstand über 5 km: sichtbarer Hinweis „abseits der Route — Luftlinie, keine Höhendaten", Liste nach Luftlinie sortiert. Das ist ein Notnagel, kein Betriebsmodus; auf einer gewählten Route bekommt der Nutzer immer echte Streckenkilometer.

**GPS** über `getCurrentPosition` auf Knopfdruck, nicht `watchPosition` — der Nutzer lädt an jedem Ladestopp ohnehin neu.

## 4.5 Ladepunkte pflegen

Der Nutzer trägt eine Zeile mit dem Maps-Link ein, dazu Betreiber, kW, Anzahl, gegebenenfalls Richtung, und seine Notiz. `aufloeseLinks()` ergänzt Name, Adresse, Koordinaten. `exportJson()` ordnet den Punkt automatisch jeder Route zu, an der er nah genug liegt — **er muss nirgends angeben, zu welcher Strecke eine Station gehört.**

Größenordnung zum Start: rund zehn Stationen je Strecke.

## 4.6 Etappen

| # | Inhalt | Prüfung |
|---|---|---|
| 1 | Repo `obitusde/ladeplanung` anlegen, GitHub Pages aktivieren, Grundgerüst hochladen | Seite über https erreichbar |
| 2 | Apps-Script-Projekt, `setup()`, Menü | Beide Blätter korrekt angelegt |
| 3 | `aufloeseLinks()` | Kriterien 11 und 12 |
| 4 | `berechneRouten()` für **eine** Route | Länge und Fahrzeit stimmen grob mit Google Maps überein |
| 5 | `berechneRouten()` für alle drei, Ausdünnung, Rundung | Werte monoton steigend, Datei handhabbar groß |
| 6 | `exportJson()` mit Zuordnung und GitHub-Upload | Datei im Repo, plausible Kilometerwerte |
| 7 | PWA: Laden, Projektion, Liste, **Simulationsmodus** | Kriterien 1 bis 7 |
| 8 | Detailansicht, drei Ausgabewege, Manifest | Kriterien 8 bis 10 |

## 4.7 Abnahmekriterien Stufe 1

Alle bis auf 8 bis 10 mit dem Simulationsmodus prüfbar, ohne Auto.

1. Position Morges, Route Savona, Hinfahrt → alle zugeordneten Punkte erscheinen, aufsteigend nach Distanz, keiner mit negativer Distanz.
2. Position mitten auf der Route → bereits passierte Punkte erscheinen nicht.
3. Dieselbe Position, Richtung auf Rückfahrt umgestellt → die Liste dreht sich um.
4. Punkt mit `Richtung = rueck` erscheint in der Hinfahrt-Liste nicht.
5. Position direkt auf einem Ladepunkt → dieser erscheint nicht als „0,3 km voraus".
6. Kumulierter Anstieg von Morges bis zum ersten Punkt hinter dem Alpenpass ist deutlich größer als die reine Höhendifferenz beider Orte.
7. Position 50 km abseits → Luftlinien-Hinweis, kein Absturz, kein Netzwerkaufruf.
8. „Adresse kopieren" legt eine in My CUPRA einfügbare Adresszeile in die Zwischenablage.
9. „Google Maps" und „ABRP" öffnen jeweils das richtige Ziel; ABRP zeigt keine Modellauswahl.
10. Die Seite lässt sich auf dem Handy als App installieren und startet vom Homescreen.
11. Neue Zeile mit nur einem Maps-Kurzlink → nach `aufloeseLinks()` sind Name, Adresse und Koordinaten gefüllt, `Notiz` unverändert.
12. Zweiter Lauf über dieselbe Zeile ändert nichts.

**Nach Stufe 1 wird gefahren, bevor weitergebaut wird.** Erst die Erfahrung aus einer echten Fahrt entscheidet, welche der folgenden Stufen sich lohnt.

---

# STUFE 2 — beliebige Routen

Erst bauen, wenn Stufe 1 im Auto bestanden hat.

Der Nutzer plant eine Strecke in Google Maps, teilt sie an die App, und sie rechnet dafür dieselben echten Streckenkilometer wie für eine Stammstrecke. Dazu eine Schaltfläche **„Route ab hier neu berechnen"**, die von der aktuellen Position zum gewählten Ziel eine frische Route holt.

Beides braucht einen Routing-Aufruf zur Laufzeit und damit einen **Apps-Script-Endpunkt**, weil der Schlüssel nicht in eine öffentliche Seite gehört. Als `doGet(e)` veröffentlicht: nimmt den Link entgegen, löst ihn auf, ruft das Routing, rechnet die kumulierten Werte, dünnt aus, gibt das fertige Routenobjekt als JSON zurück. Abgesichert mit einem einfachen gemeinsamen Kennwort als Parameter — das ist keine echte Sicherheit, es steht im Quelltext der Seite, verhindert aber, dass eine zufällig gefundene URL das Routing-Kontingent verbraucht. Der Endpunkt schreibt nichts und gibt nichts preis.

In der App: `share_target` im Manifest (Methode GET, Parameter `url`, `text`, `title`), damit sie unter Android im Teilen-Menü erscheint. Das setzt eine installierte PWA voraus und funktioniert nur unter Android — deshalb **zusätzlich immer ein Eingabefeld** für einen eingefügten Link. Die geteilte Route wird in `localStorage` gehalten, es gibt immer nur die zuletzt geteilte, eine neue ersetzt sie nach Rückfrage. Punkte werden clientseitig zugeordnet, mit derselben Projektion.

Wird eine geteilte Strecke öfter gefahren, trägt der Nutzer sie als weitere Zeile ins Blatt `Routen` ein — dann ist sie vorberechnet.

**Verifiziert am 14.09.2026:** ein Kurzlink `https://maps.app.goo.gl/…` leitet per 302 weiter auf eine URL der Form

```
https://www.google.com/maps/dir/46.5043239,6.4912739/Neuenrade/
data=…!8m2!3d51.2847342!4d7.7950368999999995…!3e0
```

Zwei Muster reichen zum Auslesen: die Pfadsegmente nach `/dir/` enthalten Start, Zwischenziele und Ziel in Reihenfolge, entweder als `lat,lon` oder als Ortsname; die Paare `!3d<lat>!4d<lon>` im `data`-Block liefern die Koordinaten zu benannten Orten in derselben Reihenfolge. `3e0` steht für Autofahrt. Ein Ortslink (statt Routenlink) sieht analog aus mit `/place/` und `@lat,lon,zoom`.

**Noch ungeprüft:** eine Route mit Zwischenstopps. Dort treten mehr Pfadsegmente und mehr Koordinatenpaare auf, die einander zugeordnet werden müssen. Beim Umsetzen mit einem echten Link testen und lieber sichtbar scheitern als raten.

---

# STUFE 3 — Registerdaten

Erst bauen, wenn die Handpflege spürbar lästig wird.

## 3a — Nachschlagen (klein)

Der Nutzer fügt nur den Maps-Link ein; das Script schlägt die Koordinaten in einer vorbereiteten Registerdatei nach und füllt zusätzlich **Betreiber, Ladeleistung und Anzahl der Ladepunkte**. Er tippt dann nur noch die Notiz.

Voraussetzung ist eine einmalig erzeugte kompakte Nachschlagedatei im Repo — aus dem 51-MB-Register gefiltert auf Gleichstromlader, zusammengefasst pro Standort, reduziert auf Name, Ort, Koordinaten, kW, Anzahl, Betreiber. Erzeugt lokal bei Claude Code, nicht im Apps Script; die Rohdatei sprengt dessen Grenzen.

## 3b — Vorschlagen (groß)

Dieselbe Datei, aber mit Korridorfilter: alle Stationen im 2-km-Streifen einer Route werden als Zeilen mit `Status = Vorschlag` ins Sheet geschrieben, sortiert nach Streckenkilometer. Der Nutzer löscht, was er nicht will, und ergänzt Notizen.

**Regel, die niemals verletzt werden darf:** der Abgleich läuft über gerundete Koordinaten mit etwa 50 m Toleranz. Vorhandene Zeilen werden nur in technischen Feldern aktualisiert, **nie** in `Name`, `Notiz`, `Richtung` oder `Favorit`. Verschwundene Stationen werden markiert, nicht gelöscht. Turnus etwa vierteljährlich, Aufwand rund eine Viertelstunde.

## Quellen

| Quelle | Gebiet | Anmerkung |
|---|---|---|
| Ladesäulenregister der Bundesnetzagentur | Deutschland | Meldepflicht, praktisch vollständig, aber mit Meldeverzug von Wochen. CSV rund 51 MB, Lizenz CC-BY, Bezug über `data.bundesnetzagentur.de`. Enthält Betreiber, Adresse, Koordinaten, Leistung, Steckertypen. |
| ich-tanke-strom.ch über opendata.swiss | Schweiz | Offizielle Open-Data-Infrastruktur des Bundes, Datensatz „Ladestationen für Elektroautos", statische `EVSEData` plus laufende `EVSEStatus`. |
| GoingElectric Stromtankstellen-API | DE, AT, CH, teilweise IT und FR | `api.goingelectric.de/chargepoints/` mit `lat`, `lng`, `radius`, `networks`, `min_power`. Zugang muss beantragt werden, Konditionen nicht verifiziert. Für Italien der einzige brauchbare Weg. |

**Open Charge Map wurde geprüft und verworfen** — crowdsourced, EnBW speist dort keinen Betreiber-Feed ein, die Abdeckung ist lückenhaft. Die interne Schnittstelle der EnBW-eigenen Karte ebenfalls nicht verwenden: nicht offiziell, kann jederzeit brechen. Als Stichprobenkontrolle taugt die EnBW-Karte dagegen gut.

Zur Betreiberzuordnung: die Namen im Register sind Freitext und uneinheitlich geschrieben — mit Teilstring-Suche auf „EnBW" arbeiten, nie mit exaktem Vergleich. Ob eine Station EnBW gehört, steht im Register; ob sie Roaming-Partner ist, nicht. Möglich ist daher nur „EnBW" und „andere". Das ist relevant, weil der Preisunterschied erheblich ist: an EnBW-eigenen Stationen ab etwa 39 ct/kWh, im Roaming zwischen 56 und 89 ct/kWh (Stand September 2026).

---

# STUFE 4 — Komfort

Nur bauen, was sich nach echten Fahrten als Wunsch herausstellt.

- **Filter**: Mindestleistung, „nur Favoriten", „nur Betreiber X", und ein Feld „Restreichweite km", das weiter entfernte Punkte ausgraut — sie bleiben sichtbar, werden nicht eingefärbt. Keine Ampel.
- **Service Worker** für echten Offline-Betrieb. App-Hülle `cache-first`, `routes.json` `network-first` mit Cache-Rückfall. Nicht dringend, weil der Nutzer unterwegs praktisch durchgehend online ist — aber in Alpentunneln und beim Roaming gelegentlich doch nützlich, und aus der bestehenden Architektur fast geschenkt.
- **`onChange`-Trigger** im Sheet, der `exportJson()` anstößt, entprellt über den `CacheService` auf höchstens einen Lauf pro Minute, abgesichert mit `LockService`. Damit landen unterwegs geänderte Notizen ohne Klick in der App.
- **Punkt hier anlegen** direkt in der App, mit der aktuellen GPS-Position. Braucht einen schreibenden Endpunkt.
- **GoingElectric live** entlang der Route abfragen, alle 30 km ein Sampling-Punkt mit 15 km Radius, Duplikate über die Stations-ID entfernen. Macht die vorbereitete Registerdatei überflüssig, hängt aber am Zugang.

---

## 5. Nicht-Ziele

Bewusst verworfen, in keiner Stufe wieder aufnehmen:

- Reichweiten-Ampel oder Farblogik
- Automatische Amenity-Suche über die Places API — die Notizen sind Handarbeit und genau darin liegt der Mehrwert
- Google Distance Matrix, Directions API und Places API, damit auch das Google-Cloud-Projekt mit Kreditkarte
- Ziel automatisch ans Auto senden: es gibt keine offizielle Schnittstelle. Die inoffizielle Cupra-WeConnect-Bibliothek wurde im Juli 2026 archiviert und kennt keinen Zielversand; der aktivere Seat/Cupra-Connector dokumentiert nur Laden und Klimatisierung. Der Weg ans Auto ist die Zwischenablage nach My CUPRA.
- Eigene Verbrauchsformel, Chargetrip, reine Höhendifferenz Start–Ziel
- Mehrere Varianten je Stammstrecke — das Schema erlaubt es, gebaut wird eine Route pro Strecke

---

## 6. Bekannte Stolpersteine

- **Zwischenablage** braucht eine direkte Nutzergeste und einen sicheren Kontext: `navigator.clipboard.writeText` synchron im Klick-Handler aufrufen, nicht nach einem `await`. Fallback über ein verstecktes `textarea` mit `execCommand('copy')`. Funktioniert nur über https.
- **Maps-Kurzlinks**: `UrlFetchApp` mit `followRedirects: false`, der `Location`-Kopfzeile folgen, gegebenenfalls mehrfach. Muster siehe Stufe 2. Links, die nur eine interne Ortskennung enthalten, sind nicht auflösbar — solche Zeilen markieren, nicht raten.
- **Apps-Script-Laufzeit** liegt bei sechs Minuten. `berechneRouten()` pro Route einzeln laufen lassen.
- **ORS-Freikontingent** reicht bei wenigen Aufrufen problemlos; die genauen Grenzen stehen im HeiGIT-Konto und sind hier nicht verifiziert.
- **GPS-Genauigkeit** im Auto prüfen: liegt sie über einigen hundert Metern, nutzt das Gerät nur die Funkzelle und die Projektion wird unbrauchbar. Deshalb den Genauigkeitswert in der App anzeigen.
- **Web Share Target** (Stufe 2) funktioniert nur unter Android und nur bei installierter PWA. Das Eingabefeld als Rückfall ist Pflicht.

---

## 7. Zugänge

| Was | Woher | Kosten |
|---|---|---|
| OpenRouteService API-Key | openrouteservice.org, Registrierung per E-Mail | kostenlos, keine Kreditkarte |
| GitHub Personal Access Token | Schreibrecht auf `obitusde/ladeplanung` | – |
| Google Sheet | wird von `setup()` erzeugt | – |

---

## 8. Was der Nutzer beisteuert

- ORS-API-Key und GitHub-Token
- Drei Zeilen im Blatt `Routen`, als Maps-Links
- Die Ladepunkte als Maps-Links samt Betreiber, kW, Anzahl, gegebenenfalls Richtung, und Notiz
- Den Blick auf Etappe 4: stimmen Länge und Fahrzeit mit Google Maps überein?
- Eine echte Fahrt, bevor über Stufe 2 entschieden wird
