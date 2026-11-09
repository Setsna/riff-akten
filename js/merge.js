/* ==========================================================
   Riff-Akten – Fortschritt von zwei Geräten zusammenführen

   Ein Kind arbeitet nachmittags zu Hause und am nächsten Morgen auf
   dem Schul-iPad, das noch offen lag. Der zweite Stand darf den
   ersten nicht einfach ersetzen.

   Dreiwege-Vergleich (Idee aus Perlentaucher, js/merge.js):
     BASIS   der Stand, den dieses Gerät zuletzt abgeglichen hat
     LOKAL   was dieses Gerät seitdem daraus gemacht hat
     FERN    was gerade in der Datenbank steht

   Regeln je Feld:
     erledigt, stempel   Vereinigung, der frühere Zeitpunkt gilt
                         (was einmal geschafft ist, bleibt geschafft)
     zeit                Zähler: FERN + (LOKAL − BASIS)
     eintraege           je Eintrag gewinnt der jüngere (Feld ts)
     geaendert           das Maximum

   Bewusst ohne Firebase, damit es sich ohne Netz testen lässt.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  function zahl(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

  function alleSchluessel(maps) {
    var s = {};
    maps.forEach(function (m) { Object.keys(obj(m)).forEach(function (k) { s[k] = 1; }); });
    return Object.keys(s);
  }

  // Vereinigung, der frühere Zeitpunkt gilt.
  function vereinigt(lokal, fern) {
    lokal = obj(lokal); fern = obj(fern);
    var raus = {};
    alleSchluessel([lokal, fern]).forEach(function (k) {
      var a = zahl(lokal[k]), b = zahl(fern[k]);
      raus[k] = (a && b) ? Math.min(a, b) : (a || b);
    });
    return raus;
  }

  // Zähler: eigenen Zuwachs auf den fernen Stand legen, nie unter null.
  function zaehler(basis, lokal, fern) {
    basis = obj(basis); lokal = obj(lokal); fern = obj(fern);
    var raus = {};
    alleSchluessel([basis, lokal, fern]).forEach(function (k) {
      var n = Math.max(0, zahl(fern[k]) + (zahl(lokal[k]) - zahl(basis[k])));
      if (n) raus[k] = n;
    });
    return raus;
  }

  // Einträge: je Schlüssel der jüngere.
  function juengere(lokal, fern) {
    lokal = obj(lokal); fern = obj(fern);
    var raus = {};
    alleSchluessel([lokal, fern]).forEach(function (k) {
      var a = lokal[k], b = fern[k];
      if (!a) raus[k] = b;
      else if (!b) raus[k] = a;
      else raus[k] = zahl(a.ts) >= zahl(b.ts) ? a : b;
    });
    return raus;
  }

  function spielstand(basis, lokal, fern) {
    basis = obj(basis); lokal = obj(lokal); fern = obj(fern);
    return {
      erledigt: vereinigt(lokal.erledigt, fern.erledigt),
      stempel: vereinigt(lokal.stempel, fern.stempel),
      zeit: zaehler(basis.zeit, lokal.zeit, fern.zeit),
      eintraege: juengere(lokal.eintraege, fern.eintraege),
      geaendert: Math.max(zahl(lokal.geaendert), zahl(fern.geaendert))
    };
  }

  RA.mische = { spielstand: spielstand };
})();
