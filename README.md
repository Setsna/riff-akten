# Riff-Akten

Lernplattform für die Klassen 3 und 4. Die Kinder lösen kleine Kriminalfälle („Akten“):
Sie lesen eine Fallakte, sammeln Hinweise, ordnen sie und beantworten die Detektivfrage.
Lernziele sind Lesen, Hören und vernetztes Denken. Begleiter ist Klaro, ein Einsiedlerkrebs.

**Adresse (geplant):** https://setsna.github.io/riff-akten/
**Lehrerbereich:** https://setsna.github.io/riff-akten/lehrer.html

Schwesterseite der [Lernlagune](https://lernlagune.de); die Gestaltung folgt deren `DESIGN.md`.

## Was liegt wo?

| Datei | Inhalt |
|---|---|
| `index.html` | Kinder-App |
| `lehrer.html` | Lehrerbereich: Kinder freischalten, sperren, zuletzt aktiv |
| `datenschutz.html`, `impressum.html` | Rechtstexte (Datenschutz kurz für Kinder und ausführlich) |
| `js/config.js` | **Alle Einstellungen**, auch die Firebase-Zugangsdaten (nicht geheim) |
| `js/cloud.js` | Anmeldung per Code und Speichern in Firebase |
| `js/store.js` | Fortschritt im Browser (je Kind ein Speicherplatz) |
| `js/merge.js` | Führt den Fortschritt von zwei Geräten zusammen |
| `js/app.js` | Ansichten der Kinder-App |
| `js/lehrer.js` | Lehrerbereich |
| `css/riff-akten.css` | Aussehen (Maßstab, Glas, Navy und Weiß wie die Lernlagune) |
| `css/lehrer.css`, `css/recht.css` | Zusätze für Lehrerbereich und Rechtstexte |
| `bilder/` | Klaro und der Riffgrund (mit Canva erstellt) |
| `schriften/` | Andika und Libre Caslon Text mit Lizenztexten (SIL OFL) |
| `firebase/firestore.rules.beispiel` | Zugriffsregeln mit Platzhalter statt E-Mail-Adresse |
| `tools/server.ps1` | Kleiner Webserver für Vorschau und Rauchtest |
| `tools/vorschau.html` | Kinder-App mit Firebase-Attrappe und Testkind „Mila“ (`?neu`, `?login`, `?offline`) |
| `tools/rauchtest.html` | Automatischer Rauchtest von Kinder-App, Lehrerbereich und Rechtstexten |
| `tools/test/firebase-attrappe.js` | Ersetzt Firebase im Test; nichts geht an die echte Datenbank |
| `tools/qr_aufkleber.py` | Druckbogen mit QR-Aufklebern, `zugangscodes.csv` und `kinder.json` |

## Vorschau und Rauchtest

```
powershell -ExecutionPolicy Bypass -File tools\server.ps1 -Port 8124
```

Dann `http://localhost:8124/tools/vorschau.html` oder `http://localhost:8124/tools/rauchtest.html`.
Der Seitentitel des Rauchtests beginnt mit OK oder FEHLER.

## Kinder freischalten

1. Vornamen in eine Textdatei schreiben, einer pro Zeile.
2. `py repo\tools\qr_aufkleber.py --namen Dateien\namen.txt` (aus dem Projektordner).
   Die Ausgabe landet in `Dateien\Zugangscodes\`, nie im Repository.
3. Im Lehrerbereich unter „Kinder freischalten“ die Datei `kinder.json` wählen.
4. `aufkleber.pdf` drucken und ausschneiden.

## Nach einer Änderung: Versionsnummer hochzählen

Hinter jeder lokalen `js`- und `css`-Datei steht `?v=N`. Wer etwas ändert, zählt die Zahl in
**allen** HTML-Dateien (`index`, `lehrer`, `datenschutz`, `impressum`) um eins hoch.
Der Rauchtest prüft, dass überall dieselbe Nummer steht.

## Firestore-Regeln

Die echten Regeln enthalten die E-Mail-Adresse der Lehrkraft und liegen deshalb **nicht** im
Repository (`firebase/firestore.rules` steht in `.gitignore`). Im Repo liegt nur
`firebase/firestore.rules.beispiel`. Die echte Fassung wird von Hand in die Firebase-Konsole eingefügt.

## Technik

Reines HTML, CSS und JavaScript ohne Framework und ohne Build-Schritt, gehostet auf GitHub Pages.
Anmeldung und Fortschritt über Firebase (Authentication und Firestore, Region europe-west3).
Außer Firebase werden keine fremden Dienste eingebunden.
