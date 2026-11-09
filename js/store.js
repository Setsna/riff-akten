/* ==========================================================
   Riff-Akten – Fortschritt im Browser

   Jedes Kind hat auf jedem Gerät einen eigenen Speicherplatz:
     riff-akten.v1.<code>          der Fortschritt
     riff-akten.v1.<code>.basis    der zuletzt abgeglichene Stand
                                   (für js/merge.js, nur lokal)

   Die Datenbank ist das Gedächtnis über Geräte hinweg, der Browser
   die Arbeitskopie. So geht ohne Netz nichts verloren.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var PRAEFIX = 'riff-akten.v1';
  var KEY = null;          // erst nach der Anmeldung gesetzt
  var s = fresh();
  var lauscher = [];

  function fresh() {
    return { erledigt: {}, stempel: {}, zeit: {}, eintraege: {}, geaendert: 0 };
  }

  function lesen(k) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function schreibenLokal(k, wert) {
    try { localStorage.setItem(k, JSON.stringify(wert)); } catch (e) {}
  }

  function useProfile(code) {
    KEY = PRAEFIX + '.' + String(code).toLowerCase();
    s = Object.assign(fresh(), lesen(KEY) || {});
  }

  function ablegen() { if (KEY) schreibenLokal(KEY, s); }

  // Jede Änderung geht über diese Funktion: lokal sichern, dann die
  // Lauscher (js/cloud.js) benachrichtigen, die später hochladen.
  function geaendert() {
    s.geaendert = Date.now();
    ablegen();
    lauscher.forEach(function (f) { try { f(); } catch (e) {} });
  }

  function basis() { return KEY ? lesen(KEY + '.basis') : null; }

  // Ergebnis des Abgleichs übernehmen: Stand und Basis sind danach gleich.
  function abgleichUebernehmen(zusammen) {
    s = Object.assign(fresh(), JSON.parse(JSON.stringify(zusammen)));
    ablegen();
    if (KEY) schreibenLokal(KEY + '.basis', s);
  }

  // Lernzeit dazuzählen (Sekunden), z. B. für eine Akte.
  function zeitDazu(id, sek) {
    sek = Math.round(sek);
    if (!id || !(sek > 0)) return;
    s.zeit[id] = (s.zeit[id] || 0) + sek;
    geaendert();
  }

  RA.store = {
    useProfile: useProfile,
    snapshot: function () { return JSON.parse(JSON.stringify(s)); },
    basis: basis,
    abgleichUebernehmen: abgleichUebernehmen,
    onChange: function (f) { if (lauscher.indexOf(f) < 0) lauscher.push(f); },
    zeitDazu: zeitDazu,
    // Testhilfe für den Rauchtest
    _schluessel: function () { return KEY; }
  };
})();
