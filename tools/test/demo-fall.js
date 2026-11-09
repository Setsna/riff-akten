/* ==========================================================
   Riff-Akten – Demo-Fall für Vorschau und Rauchtest

   Ein kleiner, erfundener Fall, der jede Aufgabenart einmal
   benutzt. Er zeigt zugleich das Datenformat:

     faelle/<id>      alles, was das Kind sehen darf
     loesungen/<id>   richtige Antworten, Erklärungen, Musterlösungen
                      (wird erst beim Tippen auf "Prüfen" geladen)

   Echte Fälle liegen NICHT im Repository, sondern nur in Firestore
   (Lösungen!). Entwürfe: Dateien/Faelle-Entwuerfe/ (lokal).

   Aufgabenarten (typ):
     auswahl    eine oder mehrere Antworten (mehrere: true)
     zuordnen   jedes Element bekommt ein Ziel (Hinweise sortieren,
                Dose -> Kind, Wort -> Erklärung)
     merken     Merkfrage: Bedenkzeit, Musterlösung, Selbsteinschätzung
     tisch      Aufgabe ohne Gerät, nur "Erledigt"
     eintrag    Auswahl für das Detektivbuch, ohne richtig/falsch
   zusatz: true  = freiwillige Zusatzfrage für schnelle Kinder
   Text: **fett** ist erlaubt, sonst reiner Text.
   Tabellen: zeilen: [{ zellen: [...] }, ...] – Firestore erlaubt keine
   Listen direkt in Listen.
   ========================================================== */
window.DEMO_FALL = {
  id: 'demo',
  fall: {
    titel: 'Die verschwundene Muschel',
    bild: 'bilder/akten/pausenbrot-titel.webp',
    nr: 1,
    klasse: 3,
    fach: 'Deutsch',
    schwierigkeit: 1,
    geschichte: [
      { absatz: 'Es ist Montag in der Riff-Schule.' },
      { absatz: 'Auf dem Lehrertisch lag eine rosa Muschel. Jetzt ist sie weg!' },
      { bild: 'bilder/akten/pausenbrot-2.webp', alt: 'Ein Hering putzt die Fensterbank.' },
      { liste: ['**Spur 1:** Sand auf dem Boden', '**Spur 2:** ein nasser Fleck am Fenster'] }
    ],
    frage: 'Wo ist die rosa Muschel?',
    hilfe: 'Schau dir die Spuren genau an.\nWas passt zum Fenster?',
    karten: [
      { id: 'K1', titel: 'Plan der Klasse', tabelle: { kopf: ['Platz', 'Was liegt dort?'], zeilen: [{ zellen: ['Fenster', 'Blumentopf'] }, { zellen: ['Tür', 'Jacken'] }] } },
      { id: 'K2', titel: 'Die Möwe erzählt', text: 'Ich habe etwas Rosa im Blumentopf gesehen.', audio: 'audio/pausenbrot-lina.m4a' },
      { id: 'K3', titel: 'Das Wetter', text: 'Heute scheint die Sonne.' }
    ],
    stationen: [
      { id: 'fallakte', titel: 'Die Fallakte', zeige: ['geschichte', 'frage'], aufgaben: [
        { typ: 'auswahl', id: '1.1', frage: 'Was sollst du herausfinden?',
          optionen: [{ id: 'A', text: 'Wo die Muschel ist' }, { id: 'B', text: 'Wie das Wetter ist' }] }
      ] },
      { id: 'hinweise', titel: 'Hinweise ordnen', hilfe: true, aufgaben: [
        { typ: 'zuordnen', id: '2.1', frage: 'Hilft der Hinweis, oder ist er überflüssig?',
          elemente: [{ karte: 'K1' }, { karte: 'K2' }, { karte: 'K3' }],
          ziele: [{ id: 'w', text: 'hilft' }, { id: 'u', text: 'überflüssig' }] }
      ] },
      { id: 'kontrolle', titel: 'Kontrolle', hilfe: true, zeige: ['karten'], aufgaben: [
        { typ: 'auswahl', id: '3.1', frage: 'Wo ist die Muschel?',
          optionen: [{ id: 'A', text: 'Im Blumentopf am Fenster' }, { id: 'B', text: 'Bei den Jacken' }] },
        { typ: 'merken', id: '3.2', frage: 'Warum ist die Muschel im Blumentopf?', bedenkzeit: 15 },
        { typ: 'auswahl', id: '3.3', zusatz: true, mehrere: true, frage: 'Welche Spuren passen zum Fenster? (Mehrere sind richtig.)',
          optionen: [{ id: 'A', text: 'der nasse Fleck' }, { id: 'B', text: 'die Möwe' }, { id: 'C', text: 'die Jacken' }] }
      ] },
      { id: 'woerter', titel: 'Neue Wörter', aufgaben: [
        { typ: 'zuordnen', id: '4.1', frage: 'Welche Erklärung passt?',
          elemente: [{ id: 'spur', text: 'die Spur' }, { id: 'moewe', text: 'die Möwe' }],
          ziele: [{ id: 'a', text: 'ein Zeichen, das jemand hinterlassen hat' }, { id: 'b', text: 'ein Vogel am Meer' }] }
      ] },
      { id: 'tisch', titel: 'Am Tisch', aufgaben: [
        { typ: 'tisch', id: '5.1', text: 'Erzähle einem anderen Kind, wie du den Fall gelöst hast.' }
      ] },
      { id: 'eintrag', titel: 'Mein Eintrag', aufgaben: [
        { typ: 'eintrag', id: '6.1', frage: 'Welcher Hinweis hat dir am meisten geholfen?', optionen: [{ karte: 'K1' }, { karte: 'K2' }] },
        { typ: 'eintrag', id: '6.2', frage: 'Wie war der Fall für dich?',
          optionen: [{ id: 'leicht', text: 'leicht' }, { id: 'gut', text: 'genau richtig' }, { id: 'schwer', text: 'schwer' }] }
      ] }
    ]
  },
  loesung: {
    aufgaben: {
      '1.1': { richtig: ['A'], erklaerung: 'In der Detektivfrage steht: „Wo ist die rosa Muschel?“' },
      '2.1': { richtig: { K1: 'w', K2: 'w', K3: 'u' }, erklaerung: 'Plan und Möwe führen zum Fenster.',
               erklaerungen: { K1: 'Am Fenster steht ein Blumentopf.', K2: 'Die Möwe hat etwas Rosa gesehen.', K3: 'Das Wetter verrät nichts.' } },
      '3.1': { richtig: ['A'], erklaerung: 'Die Möwe hat Rosa im Blumentopf gesehen, und der Blumentopf steht am Fenster.' },
      '3.2': { muster: 'Die Möwe hat etwas Rosa im Blumentopf gesehen. Der Blumentopf steht am Fenster, dort ist auch der nasse Fleck.' },
      '3.3': { richtig: ['A', 'B'], erklaerung: 'Der Fleck ist am Fenster, und die Möwe schaut durchs Fenster. Die Jacken hängen an der Tür.' },
      '4.1': { richtig: { spur: 'a', moewe: 'b' }, erklaerung: 'Gut gemacht, neue Wörter helfen beim Lesen.' }
    }
  }
};
