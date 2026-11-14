/* Lernlagune-Konto, Baukasten: Bausteine für den Abgleich zwischen Gerät und Datenbank.
   Entstanden aus dem Piloten Zahlenschwarm (js/mische.js), dort gegen Tests und das echte Firebase geprüft.

   Jede Plattform schreibt ihre eigene Funktion  mische(basis, lokal, fern)  aus diesen Bausteinen:
     lokal  der Stand auf diesem Gerät
     fern   der Stand aus der Datenbank (null, wenn es keinen gibt)
     basis  der Stand, den dieses Gerät zuletzt abgeglichen hat (null beim ersten Mal)
   Sie muss ohne Seiteneffekte sein, kaputte Werte aushalten und auch mit lokal = null laufen
   (dann kommt der ferne Stand bereinigt heraus).

   Welcher Baustein für welches Feld?
     neuererGewinnt   Einträge mit eigenem Zeitstempel (z. B. Lernstand je Aufgabe)
     vereinigeFrueh   Dinge, die nie verloren gehen sollen (Stempel, Fische, erledigte Stationen)
     zuwachs          Zähler und Summen (Lernzeit): fern plus das, was hier seit dem letzten Abgleich dazukam
     hierGeaendert    einzelne Werte (Klasse, Einstellung): hier geändert gewinnt, sonst fern

   Pflicht in jedem Stand: angelegt und geaendert (Zeitpunkte als ganze Zahlen).
   Daran erkennt ein Gerät, dass die Lehrkraft den Stand gelöscht hat (zurueckgesetzt). */
(() => {
  'use strict';
  const LK = window.LagunenKonto = window.LagunenKonto || {};

  const istObjekt = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const karte = x => istObjekt(x) ? x : {};
  const zahl = x => (typeof x === 'number' && isFinite(x) && x > 0) ? x : 0;
  const kopie = x => JSON.parse(JSON.stringify(x));
  /* frühester gültiger Zeitpunkt, 0 wenn keiner gültig ist */
  const frueher = (a, b) => { const x = zahl(a), y = zahl(b); return x && y ? Math.min(x, y) : x || y; };
  const spaeter = (a, b) => Math.max(zahl(a), zahl(b));

  /* Karte von Einträgen mit Zeitstempel: Der ganze Eintrag mit dem späteren Zeitpunkt gewinnt.
     Bei Gleichstand bleibt der ferne (dann ändert der Abgleich nichts). */
  function neuererGewinnt(lokal, fern, zeitFeld = 'zuletzt') {
    const l = karte(lokal), f = karte(fern), aus = {};
    for (const id of new Set([...Object.keys(l), ...Object.keys(f)])) {
      const a = istObjekt(l[id]) ? l[id] : null, b = istObjekt(f[id]) ? f[id] : null;
      if (!a || !b) { if (a || b) aus[id] = kopie(a || b); continue; }
      aus[id] = kopie(zahl(a[zeitFeld]) > zahl(b[zeitFeld]) ? a : b);
    }
    return aus;
  }

  /* Karte id -> Zeitpunkt: Vereinigung, es gilt der frühere Zeitpunkt. Nichts geht verloren. */
  function vereinigeFrueh(lokal, fern) {
    const l = karte(lokal), f = karte(fern), aus = {};
    for (const id of new Set([...Object.keys(l), ...Object.keys(f)])) {
      const t = frueher(l[id], f[id]);
      if (t) aus[id] = t;
    }
    return aus;
  }

  /* Summe: ferner Wert plus eigener Zuwachs seit dem letzten Abgleich. Nichts wird doppelt gezählt. */
  const zuwachs = (basis, lokal, fern) => zahl(fern) + Math.max(0, zahl(lokal) - zahl(basis));

  /* Einzelner Wert: Wurde er hier seit dem letzten Abgleich geändert, gilt der lokale, sonst der ferne.
     gueltig(x) sagt, ob ein Wert überhaupt erlaubt ist. */
  function hierGeaendert(basis, lokal, fern, gueltig = x => x !== undefined && x !== null) {
    const l = gueltig(lokal) ? lokal : undefined, f = gueltig(fern) ? fern : undefined, b = gueltig(basis) ? basis : undefined;
    if (l !== undefined && b !== undefined && l !== b) return l;
    return f !== undefined ? f : l;
  }

  /* Hat die Lehrkraft den Stand gelöscht, seit dieses Gerät zuletzt abgeglichen hat?
     - Es gab einen Abgleich (basis), aber das Dokument ist weg.
     - Oder es steht ein später angelegtes Dokument da: Ein anderes Gerät hat schon neu angefangen.
     Ohne basis lässt sich das nicht erkennen, dann wird normal zusammengeführt. */
  function zurueckgesetzt(basis, fern) {
    if (!istObjekt(basis)) return false;
    if (!istObjekt(fern)) return true;
    const b = zahl(basis.angelegt), f = zahl(fern.angelegt);
    return b > 0 && f > b;
  }

  /* Ein Abgleich: zusammenführen oder, nach dem Zurücksetzen, den Stand des Geräts verwerfen.
     mische und neuanfang(lokal, jetzt) kommen von der Plattform. Ergebnis: { stand, zurueckgesetzt }. */
  function plan({ basis, lokal, fern, jetzt, mische, neuanfang }) {
    if (!zurueckgesetzt(basis, fern)) return { stand: mische(basis, lokal, fern), zurueckgesetzt: false };
    return { stand: istObjekt(fern) ? mische(null, null, fern) : neuanfang(lokal, jetzt), zurueckgesetzt: true };
  }

  /* Gleicher Inhalt, egal in welcher Reihenfolge die Schlüssel stehen? */
  function sortiert(x) {
    if (Array.isArray(x)) return x.map(sortiert);
    if (!istObjekt(x)) return x;
    const aus = {};
    for (const k of Object.keys(x).sort()) aus[k] = sortiert(x[k]);
    return aus;
  }
  const gleich = (a, b) => JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));

  LK.abgleich = { istObjekt, karte, zahl, kopie, frueher, spaeter, neuererGewinnt, vereinigeFrueh, zuwachs, hierGeaendert, zurueckgesetzt, plan, gleich };
})();
