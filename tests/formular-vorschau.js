// Erzeugt lokale Vorschauen der Apps-Script-Seiten mit einem nachgebauten google.script.run,
// damit Layout und Ablauf ohne Deployment im Browser prüfbar sind.
// Aufruf: node tests/formular-vorschau.js → tests/fixtures/formular-neu.html, formular-bearbeiten.html, wartung.html
const fs = require('fs');
const path = require('path');

const ordner = path.join(__dirname, '..', 'apps-script');
const basis = { appUrl: 'https://obitusde.github.io/ladeplanung/', formularUrl: 'https://script.google.com/macros/s/TEST/exec', version: '0.12.0' };

// Nachbau: neu → 1. Aufruf Nähe-Warnung (240 m), mit „trotzdem" Erfolg; Link mit „doppelt" → Dublette.
const attrappe = `<script>
  window.__aufrufe = [];
  const antwort = (r, wert) => setTimeout(() => r.ok(wert), 200);
  window.google = { script: { get run() {
    const r = { ok: null, fehler: null,
      withSuccessHandler(f) { this.ok = f; return this; },
      withFailureHandler(f) { this.fehler = f; return this; },
      speicherePunkt(d) { __aufrufe.push(['speicherePunkt', d]); antwort(this, { ok: true, meldung: 'Gespeichert: Richtung, Notiz.', warnung: '',
        punkt: { id: 'p023', name: 'EnBW Ladestation Lorsch', zuordnung: [{ route: 'Morges – Neuenrade', km: 468, quer_km: 4.2, strasse: 'A 5', raststaette: false }] } }); },
      loeschePunkt(id) { __aufrufe.push(['loeschePunkt', id]); antwort(this, { ok: true, meldung: 'Gelöscht: p023 EnBW Ladestation Lorsch.\\nDie Zeile liegt im Blatt „Gelöscht" und kann von dort zurückkopiert werden.', warnung: '' }); },
      legePunktAn(d) { __aufrufe.push(['legePunktAn', d]);
        if (d.trotzdem) return antwort(this, { ok: true, meldung: 'Angelegt als p048: EnBW Ladestation Appenweier.', warnung: '', punkt: { id: 'p048', name: 'EnBW Ladestation Appenweier', zuordnung: [{ route: 'Morges – Neuenrade', km: 330, quer_km: 0.1, strasse: 'A 5', raststaette: true }] } });
        if (/doppelt/.test(d.link)) return antwort(this, { ok: false, dublette: { id: 'p010', name: 'EnBW Ladestation Haiger', abstand_m: 12 } });
        antwort(this, { ok: false, naehe: { id: 'p011', name: 'EnBW Ladestation Appenweier', abstand_m: 240 } }); },
      speichereFahrt(d) { __aufrufe.push(['speichereFahrt', d]); antwort(this, { ok: true, warnung: '',
        meldung: 'Fahrt gespeichert: 212 km, Ø 12 °C, 118 km/h (Bordcomputer).\\nErwartet waren 31 %, tatsächlich 27 % (-4).\\n\\nVerbrauchsmodell: Gesamtfaktor aus 1 Fahrt(en).\\nKorrektur: gesamt 1.09, Fahrt 1, Höhe 1, Heizung 1\\nØ Abweichung: 0 % Akku je Fahrt.' }); },
      speichereVergleich(d) { __aufrufe.push(['speichereVergleich', d]); antwort(this, { ok: true, warnung: '',
        meldung: d.quelle + ': 35 % Akku für 205 km.', kalibrierung: 'Verbrauchsmodell: Gesamtfaktor aus 1 Fahrt(en).\\nABRP: 1 × Ø 0 % Abweichung (Modell im Schnitt +0 %)',
        zeile: { von: d.von, nach: d.nach, km: 205, referenz: d.start_soc - d.ende_soc, modell: 38, quelle: d.quelle } }); },
      preiseVorschlagen() { __aufrufe.push(['preiseVorschlagen']);
        const alt = window.__preise.anbieter;
        antwort(this, { ok: true, modell: 'google/gemini-3.8-flash', vorschlaege: alt.map((a, i) => i === 0
          ? { alt: a, neu: { tarife: [{ name: 'S', kwh: 0.59, grund_monat: 0 }, { name: 'M', kwh: 0.49, grund_monat: 5.99 }, { name: 'L', kwh: 0.42, grund_monat: 11.99 }], hinweis: 'ab 1.10.2026', quelle: 'https://www.enbw.com', sicher: true } }
          : i === 1 ? { alt: a, fehler: 'OpenRouter HTTP 429: Rate limit' } : { alt: a, neu: { tarife: a.tarife, hinweis: a.hinweis, quelle: '', sicher: true } }) }); },
      preiseSpeichern(anbieter) { __aufrufe.push(['preiseSpeichern', anbieter]); antwort(this, { ok: true, text: 'Gespeichert – in der App nach 1–2 Minuten sichtbar.', preise: { stand: '2026-09-20', anbieter } }); },
      wartungAusfuehren(aktion) { __aufrufe.push(['wartungAusfuehren', aktion]);
        const texte = { bereinigen_vorschau: 'Punkte bereinigen v0.12.0 — Vorschau, nichts geändert\\nZusammenführen: p032 → p010 (EnBW Ladestation Haiger)', routen: 'Routen berechnen v0.12.0\\nneuenrade: unverändert, übersprungen\\n\\nExport v0.12.0\\nneuenrade: 26 Punkte, 716.36 km' };
        antwort(this, { ok: true, text: texte[aktion] || 'Export v0.12.0\\n41 Punkte exportiert', status: Object.assign({}, window.__status, { routen: window.__status.routen.map(x => Object.assign({}, x, { aktuell: true, stand: '15.09.2026 11:40' })) }) }); },
    };
    return r;
  } } };
</script>`;

const status = {
  modell: { gespeichert: 3, kalibrierung: { fahrten: 3, abweichung_prozent: 2.4, methode: 'Gesamtfaktor aus 3 Fahrt(en)' } },
  punkte: 41, ohneKoordinaten: 1, nichtAufloesbar: 0, ohneRoute: ['p019 EnBW Ladestation Lörrach'], letzterExport: '2026-09-15T09:35:21.521Z',
  routen: [
    { id: 'neuenrade', name: 'Morges – Neuenrade', laenge: '716.4', stand: '15.09.2026 09:34', aktuell: false },
    { id: 'savona_simplon', name: 'Morges – Savona (Simplon)', laenge: '478.2', stand: 'Fehler: ORS HTTP 403: Quota exceeded', aktuell: false },
    { id: 'ingolstadt', name: 'Morges – Ingolstadt', laenge: '620.7', stand: '15.09.2026 09:34', aktuell: true },
  ],
};

// Auswahllisten wie auf dem Server: vergleichsRouten_ aus Code.js mit der echten routes.json
const gsCode = fs.readFileSync(path.join(ordner, 'Code.js'), 'utf8');
const { vergleichsRouten_ } = new Function(gsCode + '; return { vergleichsRouten_ };')();
const vergleichsRouten = vergleichsRouten_(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'routes.json'), 'utf8')));

const seiten = {
  'vergleich.html': ['Vergleich.html', Object.assign({ routen: vergleichsRouten, vorwahl: { route: 'neuenrade', richtung: 'hin', nach: '' } }, basis)],
  'formular-neu.html': ['Formular.html', Object.assign({ modus: 'neu', punkt: { link: '', Richtung: 'beide' } }, basis)],
  'formular-bearbeiten.html': ['Formular.html', Object.assign({ modus: 'bearbeiten',
    punkt: { id: 'p023', link: 'https://maps.app.goo.gl/dnLiHt5op9KaWodL9', Adresse: 'JHV2+5W, 64653 Lorsch, Deutschland', Name: 'EnBW Ladestation Lorsch', Betreiber: 'EnBW', kW: '', Anzahl: '', Richtung: 'rueck', Favorit: false, Notiz: 'Raststätte </script><b>x</b>' } }, basis)],
  'wartung.html': ['Wartung.html', Object.assign({ status: status }, basis)],
  'preise.html': ['Preise.html', Object.assign({ preise: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'preise.json'), 'utf8')), schluessel: true }, basis)],
  'kalibrieren.html': ['Kalibrieren.html', Object.assign({ fahrt: {
    route: 'neuenrade', route_name: 'Morges – Neuenrade', richtung: 'hin', start_zeit: '2026-09-15T08:05:00Z', ende_zeit: '2026-09-15T10:20:00Z',
    start_lat: 46.50432, start_lon: 6.49127, ende_lat: 47.59857, ende_lon: 7.60339, start_soc: 82, km: 205.3, hm_auf: 640, hm_ab: 590,
    erwartet: 31.4, geschwindigkeit: 120, zusatzgewicht: 0, quer_warnung: false } }, basis)],
};

for (const [ziel, [quelle, modell]] of Object.entries(seiten)) {
  const html = fs.readFileSync(path.join(ordner, quelle), 'utf8')
    .replace('<base target="_top">', '<base target="_top">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <script>window.__status = ' + JSON.stringify(status) + '; window.__preise = ' + fs.readFileSync(path.join(__dirname, '..', 'preise.json'), 'utf8').replace(/\s+/g, ' ') + ';</script>\n  ' + attrappe)
    .replace('<?!= modellJson ?>', JSON.stringify(modell).replace(/</g, '\\u003c'));
  fs.writeFileSync(path.join(__dirname, 'fixtures', ziel), html);
  console.log('geschrieben: tests/fixtures/' + ziel);
}
