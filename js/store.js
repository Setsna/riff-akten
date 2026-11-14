/* ==========================================================
   Riff-Akten – Fortschritt im Browser (seit dem Konto-Umbau,
   14.11.2026, auf dem Baukasten js/konto-speicher.js)

   Je Zugangscode ein Eintrag im localStorage:
     riff-akten-v2.<CODE>            der Stand samt Vorname
     riff-akten-v2.<CODE>.abgleich   zuletzt mit der Datenbank abgeglichen
   Aufbau des Stands und Zusammenführen: js/merge.js.

   Die Ansichten arbeiten synchron gegen diesen Speicher. Den
   Abgleich mit ra_stand/<code> macht js/cloud.js nebenher.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var M = RA.mische;
  var S = window.LagunenKonto.speicher({
    schluessel: 'riff-akten-v2',
    nameMax: 20,
    leer: M.leer,
    normalisiere: M.normalisiere,
    mische: M.mische
  });

  function stand() { return S.aktiv(); }

  // Lernzeit dazuzählen (Sekunden), z. B. für eine Akte.
  function zeitDazu(id, sek) {
    var s = stand();
    sek = Math.round(sek);
    if (!s || !id || !(sek > 0)) return;
    s.zeit[id] = (s.zeit[id] || 0) + sek;
    S.speichern();
  }

  // Abzeichen auf dem Detektivausweis (Kennung aus RA.config.abzeichen).
  function abzeichenSetzen(id) {
    var s = stand();
    if (!s || typeof id !== 'string' || id.length > 20 || id === s.abzeichen) return;
    s.abzeichen = id;
    S.speichern();
  }

  // Fortschritt in einer Akte: eintraege[<akte>] = { station, eintrag, selbst, ts }
  //   station  bis zu welcher Station das Kind gekommen ist (0 … 6)
  //   eintrag  Auswahl in "Mein Eintrag" (Kennungen, kein Freitext)
  //   selbst   Selbsteinschätzung bei Merkfragen (0, 1, 2)
  // Der jüngere Eintrag gewinnt beim Abgleich (js/merge.js).
  function akteMerken(id, aenderung) {
    var s = stand();
    if (!s || !id) return;
    var neu = JSON.parse(JSON.stringify(s.eintraege[id] || {}));
    Object.keys(aenderung).forEach(function (k) {
      var v = aenderung[k];
      if (v && typeof v === 'object') neu[k] = Object.assign({}, neu[k] || {}, v);
      else if (k === 'station') neu.station = Math.max(neu.station || 0, v);
      else neu[k] = v;
    });
    neu.ts = Date.now();
    s.eintraege[id] = neu;
    S.speichern();
  }

  // Akte fertig: einmal erledigt, ein Stempel (der erste Zeitpunkt bleibt).
  function akteAbschliessen(id, stationen) {
    var s = stand();
    if (!s) return;
    var jetzt = Date.now();
    if (!s.erledigt[id]) s.erledigt[id] = jetzt;
    if (!s.stempel[id]) s.stempel[id] = jetzt;
    akteMerken(id, { station: stationen });
  }

  // Kopie des Stands für die Anzeige. Ohne Anmeldung ein leerer Stand.
  function snapshot() {
    var s = stand();
    return s ? JSON.parse(JSON.stringify(s)) : Object.assign(M.leer(), { geaendert: 0 });
  }

  RA.store = {
    S: S,
    akteMerken: akteMerken,
    akteAbschliessen: akteAbschliessen,
    snapshot: snapshot,
    zeitDazu: zeitDazu,
    abzeichenSetzen: abzeichenSetzen,
    // Testhilfe für den Rauchtest
    _schluessel: function () { return S.code() ? S.schluesselFuer(S.code()) : null; }
  };
})();
