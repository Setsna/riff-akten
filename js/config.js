/* ==========================================================
   Riff-Akten – alle Einstellungen an einem Ort

   Wer hier etwas ändert, zählt danach die Versionsnummer ?v=N
   in allen HTML-Dateien um eins hoch (siehe README).
   ========================================================== */
window.RA = window.RA || {};

RA.config = {
  // Name der Plattform und des Maskottchens
  name: 'Riff-Akten',
  maskottchen: { name: 'Klaro', tier: 'Einsiedlerkrebs' },

  // Firebase: das gemeinsame Projekt der Lernlagune (Perlentaucher,
  // "lernplattform-44aa1"), seit dem Konto-Umbau am 14.11.2026.
  // Die Kinder melden sich mit ihrem Perlentaucher-Code an.
  // Diese Werte sind nicht geheim: Sie stehen in jeder Web-App im
  // Quelltext. Geschützt wird die Datenbank durch die Firestore-Regeln.
  firebase: {
    apiKey: 'AIzaSyBX3MUJq69uFyejbEiJimGeAtHMER3OCdE',
    authDomain: 'lernplattform-44aa1.firebaseapp.com',
    projectId: 'lernplattform-44aa1',
    storageBucket: 'lernplattform-44aa1.firebasestorage.app',
    messagingSenderId: '213839225177',
    appId: '1:213839225177:web:4cf676269e50c708466c48'
  },

  // Sammlungen in der Datenbank (Namen siehe Lernlagune-Konto, 02-Datenmodell.md)
  //   kinder        gehört dem Perlentaucher: Vorname, von der Lehrkraft angelegt
  //   stand         ra_stand/<code>: Fortschritt eines Kindes in den Riff-Akten
  //   faelle        ra_faelle/<akte>: was die Kinder sehen
  //   loesungen     ra_loesungen/<akte>: erst beim Prüfen geladen
  sammlung: {
    kinder: 'kinder',
    stand: 'ra_stand',
    faelle: 'ra_faelle',
    loesungen: 'ra_loesungen'
  },

  // Zugangscodes: acht Zeichen, ohne leicht verwechselbare Zeichen
  // (keine 0, 1, I, L, O). Gleiches Alphabet wie tools/qr_aufkleber.py.
  code: {
    laenge: 8,
    alphabet: '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  },

  // Speichern: so lange nach einer Änderung warten, bevor geschrieben wird
  speichernNachMs: 2500,
  // Ohne Netz: so oft einen neuen Versuch starten
  wiederholenNachMs: 8000,
  // Ab dann die sandfarbene Leiste "wartet auf Netz" zeigen
  wartenHinweisNachMs: 25000,

  // Abzeichen für den Detektivausweis. Das Kind wählt eins davon.
  // Die Kennung (id) wird gespeichert, höchstens 20 Zeichen.
  abzeichen: [
    { id: 'seepferdchen', name: 'Seepferdchen' },
    { id: 'seestern', name: 'Seestern' },
    { id: 'muschel', name: 'Muschel' },
    { id: 'clownfisch', name: 'Clownfisch' },
    { id: 'qualle', name: 'Qualle' },
    { id: 'kugelfisch', name: 'Kugelfisch' }
  ],

  // Merkfrage: so viele Sekunden warten, bis die Musterlösung kommt.
  // Steht in einer Akte mehr (z. B. 15), gilt trotzdem höchstens dieser Wert.
  bedenkzeitMax: 10,

  // Lernzeit: ein einzelnes Stück zählt höchstens so lange (Sekunden).
  // Bleibt ein iPad offen liegen, läuft die Uhr sonst ewig weiter.
  lernzeitMaxStueck: 1800
};
