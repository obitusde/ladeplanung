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
      wartungAusfuehren(aktion) { __aufrufe.push(['wartungAusfuehren', aktion]);
        const texte = { bereinigen_vorschau: 'Punkte bereinigen v0.12.0 — Vorschau, nichts geändert\\nZusammenführen: p032 → p010 (EnBW Ladestation Haiger)', routen: 'Routen berechnen v0.12.0\\nneuenrade: unverändert, übersprungen\\n\\nExport v0.12.0\\nneuenrade: 26 Punkte, 716.36 km' };
        antwort(this, { ok: true, text: texte[aktion] || 'Export v0.12.0\\n41 Punkte exportiert', status: Object.assign({}, window.__status, { routen: window.__status.routen.map(x => Object.assign({}, x, { aktuell: true, stand: '15.09.2026 11:40' })) }) }); },
    };
    return r;
  } } };
</script>`;

const status = {
  punkte: 41, ohneKoordinaten: 1, nichtAufloesbar: 0, ohneRoute: ['p019 EnBW Ladestation Lörrach'], letzterExport: '2026-09-15T09:35:21.521Z',
  routen: [
    { id: 'neuenrade', name: 'Morges – Neuenrade', laenge: '716.4', stand: '15.09.2026 09:34', aktuell: false },
    { id: 'savona_simplon', name: 'Morges – Savona (Simplon)', laenge: '478.2', stand: 'Fehler: ORS HTTP 403: Quota exceeded', aktuell: false },
    { id: 'ingolstadt', name: 'Morges – Ingolstadt', laenge: '620.7', stand: '15.09.2026 09:34', aktuell: true },
  ],
};

const seiten = {
  'formular-neu.html': ['Formular.html', Object.assign({ modus: 'neu', punkt: { link: '', Richtung: 'beide' } }, basis)],
  'formular-bearbeiten.html': ['Formular.html', Object.assign({ modus: 'bearbeiten',
    punkt: { id: 'p023', link: 'https://maps.app.goo.gl/dnLiHt5op9KaWodL9', Adresse: 'JHV2+5W, 64653 Lorsch, Deutschland', Name: 'EnBW Ladestation Lorsch', Betreiber: 'EnBW', kW: '', Anzahl: '', Richtung: 'rueck', Favorit: false, Notiz: 'Raststätte </script><b>x</b>' } }, basis)],
  'wartung.html': ['Wartung.html', Object.assign({ status: status }, basis)],
};

for (const [ziel, [quelle, modell]] of Object.entries(seiten)) {
  const html = fs.readFileSync(path.join(ordner, quelle), 'utf8')
    .replace('<base target="_top">', '<base target="_top">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <script>window.__status = ' + JSON.stringify(status) + ';</script>\n  ' + attrappe)
    .replace('<?!= modellJson ?>', JSON.stringify(modell).replace(/</g, '\\u003c'));
  fs.writeFileSync(path.join(__dirname, 'fixtures', ziel), html);
  console.log('geschrieben: tests/fixtures/' + ziel);
}
