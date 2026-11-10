# Riff-Akten

Lernplattform für die Klassen 3 und 4. Die Kinder lösen kleine Kriminalfälle („Akten“):
Sie lesen eine Fallakte, sammeln Hinweise, ordnen sie und beantworten die Detektivfrage.
Lernziele sind Lesen, Hören und vernetztes Denken (Deutsch, Sachunterricht, Lehrplan Thüringen).
Begleiter ist Klaro, ein Einsiedlerkrebs. Es gibt keine Punkte, keinen Zeitdruck und keine Ranglisten.

**Kinder-App:** https://setsna.github.io/riff-akten/
**Lehrerbereich:** https://setsna.github.io/riff-akten/lehrer.html

Schwesterseite der [Lernlagune](https://lernlagune.de); die Gestaltung folgt deren `DESIGN.md`.

## Aufbau einer Akte

Jede Akte hat sechs Stationen: Fallakte, Hinweise ordnen, Kontrolle, Neue Wörter, Am Tisch
(Aufgabe ohne Gerät) und Mein Eintrag. Nach jeder Antwort kommt eine Erklärung, auch wenn sie richtig war.
Für Kinder, die nicht weiterkommen, gibt es eine Hilfekarte. Schnelle Kinder bekommen eine Zusatzfrage.
Das Detektivbuch enthält den Ausweis, die Stempel und die Lernzeit. Sind alle Akten gelöst,
gibt es eine Urkunde als PDF. Ausweis und Urkunde entstehen direkt im Browser.

Akten sind **Daten, kein Code**. Eine neue Akte braucht keine Programmänderung.

## Was liegt wo?

| Datei | Inhalt |
|---|---|
| `index.html` | Kinder-App mit Startseite, Akten, Detektivbuch und Bereich „Für Erwachsene“ |
| `lehrer.html` | Lehrerbereich: Kinder freischalten und sperren, Akten hochladen und verwalten, Auswertung, Sicherung und Wiederherstellen, Auskunft, Löschen, Aufräumen |
| `datenschutz.html`, `impressum.html` | Rechtstexte (Datenschutz kurz für Kinder und ausführlich) |
| `js/config.js` | **Alle Einstellungen**, auch die Firebase-Zugangsdaten (nicht geheim) |
| `js/cloud.js` | Anmeldung per Code und Speichern in Firebase |
| `js/store.js` | Fortschritt im Browser (je Kind ein Speicherplatz) |
| `js/merge.js` | Führt den Fortschritt von zwei Geräten zusammen |
| `js/app.js` | Ansichten der Kinder-App (Anmeldung, Startseite) |
| `js/akten.js` | Akten-Liste, Stationen und Aufgabenarten, Hilfekarte |
| `js/buch.js` | Detektivbuch, Lernzeit-Uhr, Ausweis und Urkunde als PDF |
| `js/fall-pruefen.js` | Prüft eine Akte vor dem Hochladen |
| `js/lehrer.js` | Lehrerbereich |
| `css/riff-akten.css` | Aussehen (Maßstab, Glas, Navy und Weiß wie die Lernlagune) |
| `css/lehrer.css`, `css/recht.css` | Zusätze für Lehrerbereich und Rechtstexte |
| `bilder/` | Klaro, Riffgrund, `abzeichen/` und `akten/` (mit Canva erstellt) |
| `audio/` | Hörkarten der Akten (KI-Stimmen von ElevenLabs, siehe unten) |
| `schriften/` | Andika und Libre Caslon Text mit Lizenztexten (SIL OFL) |
| `firebase/firestore.rules.beispiel` | Zugriffsregeln mit Platzhalter statt E-Mail-Adresse |
| `tools/server.ps1` | Kleiner Webserver für Vorschau und Rauchtest |
| `tools/vorschau.html` | Kinder-App mit Firebase-Attrappe und Testkind „Mila“ (`?neu`, `?login`, `?offline`) |
| `tools/rauchtest.html` | Automatischer Rauchtest von Kinder-App, Lehrerbereich und Rechtstexten |
| `tools/fall_pruefen.js` | Prüft eine Akte ohne Browser: `node tools/fall_pruefen.js akte.json` |
| `tools/test/firebase-attrappe.js` | Ersetzt Firebase im Test; nichts geht an die echte Datenbank |
| `tools/test/demo-fall.js` | Erfundene Übungsakte nur für Vorschau und Rauchtest |
| `tools/qr_aufkleber.py` | Druckbogen mit QR-Aufklebern, `zugangscodes.csv` und `kinder.json` |

## Nach einer Änderung: Versionsnummer hochzählen

Hinter jeder lokalen `js`- und `css`-Datei steht `?v=N`. Wer etwas ändert, zählt die Zahl überall
um eins hoch: in allen HTML-Dateien (`index`, `lehrer`, `datenschutz`, `impressum`) und in
`js/app.js`, `js/akten.js`, `js/buch.js` und `css/riff-akten.css`, weil dort Bilder
mit Versionsnummer geladen werden. Der Rauchtest prüft, dass überall dieselbe Nummer steht.

## Firestore-Regeln

Die echten Regeln enthalten die E-Mail-Adresse der Lehrkraft und liegen deshalb **nicht** im
Repository (`firebase/firestore.rules` steht in `.gitignore`). Im Repo liegt nur
`firebase/firestore.rules.beispiel`. Die echte Fassung wird von Hand in die Firebase-Konsole eingefügt.

## Bilder, Stimmen und Schriften

- Bilder: mit Canva erstellt.
- Stimmen der Hörkarten: mit KI erzeugt mit [ElevenLabs](https://elevenlabs.io). Der Text jeder
  Hörkarte steht zum Mitlesen auch auf der Seite.
- Schriften: Andika und Libre Caslon Text, SIL Open Font License (Lizenztexte in `schriften/`).

## Technik

Reines HTML, CSS und JavaScript ohne Framework und ohne Build-Schritt, gehostet auf GitHub Pages.
Anmeldung und Fortschritt über Firebase (Authentication und Firestore, Region europe-west3).
Außer Firebase werden keine fremden Dienste eingebunden.
