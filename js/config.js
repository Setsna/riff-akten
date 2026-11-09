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

  // Firebase-Projekt "riff-akten" (privates Google-Konto der Lehrkraft).
  // Diese Werte sind nicht geheim: Sie stehen in jeder Web-App im
  // Quelltext. Geschützt wird die Datenbank durch die Firestore-Regeln.
  firebase: {
    apiKey: 'AIzaSyBXIUIuPcIbCJlBWxLuE9ld2EqS-uEo1_I',
    authDomain: 'riff-akten.firebaseapp.com',
    projectId: 'riff-akten',
    storageBucket: 'riff-akten.firebasestorage.app',
    messagingSenderId: '902428130393',
    appId: '1:902428130393:web:e06d2bdfe369b89cc28548'
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

  // Lernzeit: ein einzelnes Stück zählt höchstens so lange (Sekunden).
  // Bleibt ein iPad offen liegen, läuft die Uhr sonst ewig weiter.
  lernzeitMaxStueck: 1800
};
