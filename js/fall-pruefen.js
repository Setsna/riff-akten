/* ==========================================================
   Riff-Akten – Fall-Datei prüfen

   Prüft eine Fall-Datei { id, fall, loesung } (Format siehe
   tools/test/demo-fall.js), bevor sie im Lehrerbereich gespeichert
   wird. Gibt eine Liste von Fehlern zurück; leer = in Ordnung.

   Eigene Datei, damit sich Fall-Entwürfe auch ohne Browser prüfen
   lassen:  node tools/fall_pruefen.js <datei.json>
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var TYPEN = ['auswahl', 'zuordnen', 'merken', 'tisch', 'eintrag'];

  // Gibt eine Liste von Fehlern zurück (leer = in Ordnung).
  function fallPruefen(d) {
    var f = [];
    function fehler(t) { if (f.length < 30) f.push(t); }
    if (!d || typeof d !== 'object') return ['Die Datei enthält kein Objekt.'];
    // Firestore speichert keine Liste direkt in einer Liste ([[...]]).
    var verschachtelt = null;
    (function suche(x, pfad, inListe) {
      if (verschachtelt) return;
      if (Array.isArray(x)) {
        if (inListe) { verschachtelt = pfad; return; }
        x.forEach(function (y, i) { suche(y, pfad + '[' + i + ']', true); });
      } else if (x && typeof x === 'object') {
        Object.keys(x).forEach(function (k) { suche(x[k], pfad + '.' + k, false); });
      }
    })(d, 'datei', false);
    if (verschachtelt) {
      fehler('Bei ' + verschachtelt + ' steht eine Liste direkt in einer Liste. Das kann Firestore nicht ' +
        'speichern. Tabellenzeilen so schreiben: { "zellen": [ ... ] }.');
    }
    if (!/^[a-z0-9-]{2,30}$/.test(d.id || '')) fehler('„id“ fehlt oder ist ungültig (nur a–z, 0–9, Bindestrich).');
    var fall = d.fall, l = d.loesung;
    if (!fall || typeof fall !== 'object') return f.concat('„fall“ fehlt.');
    if (!l || typeof l !== 'object' || !l.aufgaben) return f.concat('„loesung.aufgaben“ fehlt.');
    if (JSON.stringify(fall).indexOf('"richtig"') >= 0 || JSON.stringify(fall).indexOf('"muster"') >= 0) {
      fehler('Im Teil „fall“ steht eine Lösung („richtig“ oder „muster“). Lösungen gehören nur in „loesung“.');
    }
    ['titel', 'frage'].forEach(function (k) { if (!fall[k] || typeof fall[k] !== 'string') fehler('fall.' + k + ' fehlt.'); });
    if (!Array.isArray(fall.geschichte) || !fall.geschichte.length) fehler('fall.geschichte fehlt.');

    var karten = {};
    (fall.karten || []).forEach(function (k, i) {
      if (!k.id) return fehler('Karte ' + (i + 1) + ' hat keine id.');
      if (karten[k.id]) fehler('Karte ' + k.id + ' gibt es doppelt.');
      karten[k.id] = k;
      if (!k.titel) fehler('Karte ' + k.id + ' hat keinen Titel.');
      if (!k.text && !k.tabelle) fehler('Karte ' + k.id + ' hat weder Text noch Tabelle.');
      if (k.tabelle && (!Array.isArray(k.tabelle.kopf) || !Array.isArray(k.tabelle.zeilen) ||
          k.tabelle.zeilen.some(function (z) { return !z || !Array.isArray(z.zellen); }))) {
        fehler('Karte ' + k.id + ': Tabelle braucht „kopf“ und Zeilen der Form { "zellen": [ ... ] }.');
      }
      if (k.audio && !/^audio\/[a-z0-9-]+\.(m4a|mp3)$/.test(k.audio)) fehler('Karte ' + k.id + ': Tonpfad „' + k.audio + '“ ungültig.');
      if (k.audio && !k.text) fehler('Hörkarte ' + k.id + ' braucht den Text zum Mitlesen.');
    });

    if (!Array.isArray(fall.stationen) || !fall.stationen.length) return f.concat('fall.stationen fehlt.');
    var ids = {};
    fall.stationen.forEach(function (s, si) {
      var wo = 'Station ' + (si + 1);
      if (!s.titel) fehler(wo + ' hat keinen Titel.');
      if (!Array.isArray(s.aufgaben) || !s.aufgaben.length) return fehler(wo + ' hat keine Aufgaben.');
      s.aufgaben.forEach(function (a) {
        var w = wo + ', Aufgabe ' + (a.id || '?');
        if (!a.id) return fehler(w + ': id fehlt.');
        if (ids[a.id]) fehler('Aufgaben-id ' + a.id + ' gibt es doppelt.');
        ids[a.id] = true;
        if (TYPEN.indexOf(a.typ) < 0) return fehler(w + ': unbekannter typ „' + a.typ + '“.');
        var L = l.aufgaben[a.id];
        function optIds(liste) {
          return (liste || []).map(function (o) {
            if (o.karte && !karten[o.karte]) fehler(w + ': Karte ' + o.karte + ' gibt es nicht.');
            return o.id || o.karte;
          });
        }
        if (a.typ === 'auswahl' || a.typ === 'eintrag') {
          var o = optIds(a.optionen);
          if (o.length < 2) fehler(w + ': mindestens 2 Antworten nötig.');
          if (a.typ === 'auswahl') {
            if (!L || !Array.isArray(L.richtig) || !L.richtig.length) return fehler(w + ': Lösung („richtig“) fehlt.');
            L.richtig.forEach(function (r) { if (o.indexOf(r) < 0) fehler(w + ': Lösung „' + r + '“ ist keine Antwort.'); });
            if (!a.mehrere && L.richtig.length !== 1) fehler(w + ': genau eine richtige Antwort, oder „mehrere: true“ setzen.');
            if (!L.erklaerung) fehler(w + ': Erklärung fehlt.');
          }
        } else if (a.typ === 'zuordnen') {
          var el2 = optIds(a.elemente), zi = (a.ziele || []).map(function (z) { return z.id; });
          if (!el2.length || zi.length < 2) return fehler(w + ': Elemente oder Ziele fehlen.');
          if (!L || !L.richtig || typeof L.richtig !== 'object') return fehler(w + ': Lösung („richtig“) fehlt.');
          el2.forEach(function (e) { if (zi.indexOf(L.richtig[e]) < 0) fehler(w + ': für „' + e + '“ fehlt das richtige Ziel.'); });
          if (!L.erklaerung) fehler(w + ': Erklärung fehlt.');
        } else if (a.typ === 'merken') {
          if (!L || !L.muster) fehler(w + ': Musterlösung („muster“) fehlt.');
        } else if (a.typ === 'tisch') {
          if (!a.text) fehler(w + ': Text fehlt.');
        }
      });
    });
    Object.keys(l.aufgaben).forEach(function (k) { if (!ids[k]) fehler('Lösung für unbekannte Aufgabe ' + k + '.'); });
    return f;
  }

  RA.fallPruefen = fallPruefen;
})();
