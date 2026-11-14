/* ==========================================================
   Riff-Akten – der Stand eines Kindes und wie zwei Stände
   zusammengeführt werden (seit dem Konto-Umbau, 14.11.2026)

   Der Stand liegt im Browser (js/konto-speicher.js) und in der
   Datenbank unter ra_stand/<code> (js/konto-cloud.js).

     erledigt   { akte: Zeitpunkt }  Vereinigung, der frühere gilt
     stempel    { akte: Zeitpunkt }  Vereinigung, der frühere gilt
     zeit       { akte: Sekunden }   je Akte: fern + eigener Zuwachs
     eintraege  { akte: { station, eintrag, selbst, ts } }
                                     je Akte gewinnt der jüngere (ts)
     abzeichen  Kennung              hier geändert gewinnt, sonst fern
     angelegt   Zeitpunkt            der frühere ("Im Dienst seit")
     geaendert  Zeitpunkt            der spätere

   Der Vorname steht nie in der Datenbank, nur im Browser.
   Bausteine aus js/konto-abgleich.js (Lernlagune-Konto, Baukasten).
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var A = window.LagunenKonto.abgleich;
  var ABZEICHEN_MAX = 20;

  function abzeichenOk(x) { return typeof x === 'string' && x.length <= ABZEICHEN_MAX; }

  // Karte akte -> Zeitpunkt oder Sekunden: nur positive Zahlen
  function zahlen(roh) {
    var raus = {}, k = A.karte(roh);
    Object.keys(k).forEach(function (id) { var n = A.zahl(k[id]); if (n) raus[id] = n; });
    return raus;
  }
  // Einträge: nur Objekte
  function eintraege(roh) {
    var raus = {}, k = A.karte(roh);
    Object.keys(k).forEach(function (id) { if (A.istObjekt(k[id])) raus[id] = A.kopie(k[id]); });
    return raus;
  }

  function leer() {
    return { erledigt: {}, stempel: {}, zeit: {}, eintraege: {}, abzeichen: '' };
  }

  function normalisiere(roh) {
    roh = A.karte(roh);
    return {
      erledigt: zahlen(roh.erledigt),
      stempel: zahlen(roh.stempel),
      zeit: zahlen(roh.zeit),
      eintraege: eintraege(roh.eintraege),
      abzeichen: abzeichenOk(roh.abzeichen) ? roh.abzeichen : ''
    };
  }

  // Lernzeit je Akte: für jede Akte fern + Zuwachs seit dem letzten Abgleich
  function zeitMischen(basis, lokal, fern) {
    var b = A.karte(basis), l = A.karte(lokal), f = A.karte(fern), raus = {};
    var ids = {};
    [b, l, f].forEach(function (m) { Object.keys(m).forEach(function (k) { ids[k] = 1; }); });
    Object.keys(ids).forEach(function (id) {
      var n = A.zuwachs(b[id], l[id], f[id]);
      if (n) raus[id] = n;
    });
    return raus;
  }

  function mische(basis, lokal, fern) {
    var b = A.karte(basis), l = A.karte(lokal), f = A.karte(fern);
    var aus = {
      erledigt: A.vereinigeFrueh(l.erledigt, f.erledigt),
      stempel: A.vereinigeFrueh(l.stempel, f.stempel),
      zeit: zeitMischen(b.zeit, l.zeit, f.zeit),
      eintraege: A.neuererGewinnt(l.eintraege, f.eintraege, 'ts'),
      abzeichen: A.hierGeaendert(b.abzeichen, l.abzeichen, f.abzeichen, abzeichenOk) || '',
      geaendert: A.spaeter(l.geaendert, f.geaendert)
    };
    var angelegt = A.frueher(l.angelegt, f.angelegt);
    if (angelegt) aus.angelegt = angelegt;
    return aus;
  }

  // Die Lehrkraft hat den Stand im Perlentaucher zurückgesetzt:
  // Das Gerät fängt leer an. Das Abzeichen bleibt (keine Leistung).
  function neuanfang(lokal, jetzt) {
    var s = leer();
    s.abzeichen = abzeichenOk(A.karte(lokal).abzeichen) ? lokal.abzeichen : '';
    s.angelegt = jetzt;
    s.geaendert = jetzt;
    return s;
  }

  RA.mische = { leer: leer, normalisiere: normalisiere, mische: mische, neuanfang: neuanfang, spielstand: mische };
})();
