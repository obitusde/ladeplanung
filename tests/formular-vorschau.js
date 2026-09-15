// Erzeugt lokale Vorschauen des Apps-Script-Formulars mit einem nachgebauten google.script.run,
// damit Layout und Ablauf ohne Deployment im Browser prüfbar sind.
// Aufruf: node tests/formular-vorschau.js  → tests/fixtures/formular-neu.html, formular-bearbeiten.html
const fs = require('fs');
const path = require('path');

const vorlage = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Formular.html'), 'utf8');

const attrappe = `<script>
  // Nachbau von google.script.run: neu → erst Dublette, mit „trotzdem" Erfolg; bearbeiten → Erfolg
  window.__aufrufe = [];
  window.google = { script: { get run() {
    const r = { ok: null, fehler: null,
      withSuccessHandler(f) { this.ok = f; return this; },
      withFailureHandler(f) { this.fehler = f; return this; },
      speicherePunkt(d) { __aufrufe.push(['speicherePunkt', d]); setTimeout(() => this.ok({ ok: true, meldung: 'Gespeichert: Richtung, Notiz.', warnung: '',
        punkt: { id: 'p023', name: 'EnBW Ladestation Lorsch', zuordnung: [{ route: 'Morges – Neuenrade', km: 468, quer_km: 4.2, strasse: 'A 5', raststaette: false }] } }), 200); },
      legePunktAn(d) { __aufrufe.push(['legePunktAn', d]); setTimeout(() => this.ok(d.trotzdem
        ? { ok: true, meldung: 'Angelegt als p048: EnBW Ladestation Haiger.', warnung: '', punkt: { id: 'p048', name: 'EnBW Ladestation Haiger', zuordnung: [{ route: 'Morges – Neuenrade', km: 626, quer_km: 0.2, strasse: 'A 45', raststaette: true }] } }
        : { ok: false, dublette: { id: 'p010', name: 'EnBW Ladestation Haiger', abstand_m: 12 } }), 200); },
    };
    return r;
  } } };
</script>`;

const modelle = {
  'formular-neu.html': { modus: 'neu', appUrl: 'https://obitusde.github.io/ladeplanung/', formularUrl: 'https://script.google.com/macros/s/TEST/exec', version: '0.11.0', punkt: { link: '', Richtung: 'beide' } },
  'formular-bearbeiten.html': { modus: 'bearbeiten', appUrl: 'https://obitusde.github.io/ladeplanung/', formularUrl: 'https://script.google.com/macros/s/TEST/exec', version: '0.11.0',
    punkt: { id: 'p023', link: 'https://maps.app.goo.gl/dnLiHt5op9KaWodL9', Adresse: 'JHV2+5W, 64653 Lorsch, Deutschland', Name: 'EnBW Ladestation Lorsch', Betreiber: 'EnBW', kW: '', Anzahl: '', Richtung: 'rueck', Favorit: false, Notiz: 'Raststätte </script><b>x</b>' } },
};

for (const [datei, modell] of Object.entries(modelle)) {
  const html = vorlage
    .replace('<base target="_top">', '<base target="_top">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  ' + attrappe)
    .replace('<?!= modellJson ?>', JSON.stringify(modell).replace(/</g, '\\u003c'));
  fs.writeFileSync(path.join(__dirname, 'fixtures', datei), html);
  console.log('geschrieben: tests/fixtures/' + datei);
}
