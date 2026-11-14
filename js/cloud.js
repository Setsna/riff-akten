/* ==========================================================
   Riff-Akten – Anmeldung und Speicherung in Firebase
   (seit dem Konto-Umbau, 14.11.2026)

   Die Riff-Akten nutzen das gemeinsame Konto der Lernlagune:
   dasselbe Firebase-Projekt und dieselben Codes wie der Perlentaucher.
   Die eigentliche Arbeit macht der Baukasten js/konto-cloud.js
   (Anmelden mit dem Code, Abgleich mit ra_stand/<code>, ohne Netz
   weiter, Zurücksetzen durch die Lehrkraft erkennen). Diese Datei
   übersetzt ihn in die Form, die app.js, akten.js und buch.js kennen,
   und liest die Akten aus ra_faelle und ra_loesungen.

   Ablauf beim Start:
   1. Steht #c=CODE in der Adresse (QR-Aufkleber des Perlentauchers),
      hat dieser Code Vorrang vor einem Kind, das noch angemeldet ist.
   2. Kam der QR-Code nur halb an, wird niemand still angemeldet.
   3. Sonst wird eine Anmeldung wiederhergestellt, die auf dem Gerät liegt.

   Kann Firebase nicht geladen werden, meldet start() "offline":
   Ohne Datenbank gibt es keine Akten. Auf dem eigenen Rechner
   (localhost) spricht die Seite nie mit dem echten Firebase, nur mit
   der Attrappe aus tools/test/.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var C = RA.config;
  var LK = window.LagunenKonto;
  var M = RA.mische;
  var S = RA.store.S;

  // Texte für das Kind (ersetzen die allgemeinen Texte des Baukastens)
  var TEXTE = {
    code: 'Dieser Code sieht nicht richtig aus. Er hat 8 Zeichen. Schau noch einmal auf deinen Aufkleber.',
    gesperrt: 'Dieser Code ist noch nicht freigeschaltet. Bitte sag deiner Lehrkraft Bescheid.',
    netz: 'Gerade gibt es kein Internet. Versuch es gleich noch einmal.',
    oft: 'Das waren viele Versuche. Warte kurz und versuch es dann noch einmal.',
    sonst: 'Die Anmeldung hat nicht geklappt. Bitte sag deiner Lehrkraft Bescheid.',
    unlesbar: 'Dein gespeicherter Fortschritt konnte nicht gelesen werden. Bitte sag deiner Lehrkraft Bescheid.'
  };
  var HALBER_SCAN = 'Der QR-Code wurde nicht ganz gelesen. Tippe den Code von deinem Aufkleber ein.';

  var K = LK.cloud({
    firebase: C.firebase,
    sammlung: C.sammlung.stand,
    sammlungKinder: C.sammlung.kinder,
    speicher: S,
    mische: M.mische,
    neuanfang: M.neuanfang,
    brauchtAngaben: false,
    schreibPauseMs: C.speichernNachMs,
    nochmalMs: C.wiederholenNachMs,
    nameMax: 20,
    texte: TEXTE
  });

  var offen = false;          // ein Kind ist angemeldet (oder ohne Netz auf dem Gerät geöffnet)
  var letzterFehler = null;

  // ---------- Start ----------
  // fertig(zustand) mit zustand = 'angemeldet' | 'anmelden' | 'offline'
  function start(fertig) {
    var LA = LK.adresse;
    var qr = LA.code(), spur = LA.spur();
    LA.saeubern();

    function ende(r) {
      if (!K.aktiv()) { offen = false; fertig('offline'); return; }
      if (r && r.ok) { offen = true; fertig('angemeldet'); return; }
      offen = false;
      if (r && r.grund) letzterFehler = r.grund;
      fertig('anmelden');
    }
    function schiefgegangen() { ende({ ok: false, grund: TEXTE.sonst }); }

    if (qr) {
      if (S.aktiv() && S.code() !== qr) S.abmelden();
      K.anmelden(qr).then(ende, schiefgegangen);
      return;
    }
    if (spur) {
      // Halber Scan: lieber neu anmelden lassen als still beim vorigen Kind bleiben
      K.start().then(function () { return K.abmelden(); }).then(function () {
        ende({ ok: false, grund: HALBER_SCAN });
      }, schiefgegangen);
      return;
    }
    var gemerkt = S.code();
    K.start().then(function (r) {
      if (r.ok || r.grund) return r;
      // Firebase kennt niemanden, dieser Tab aber schon: mit dem gemerkten Code anmelden
      return gemerkt && S.code() === gemerkt ? K.anmelden(gemerkt) : r;
    }).then(function (r) {
      // Die Lehrkraft hat den Code gesperrt: nicht auf dem Gerät weiterarbeiten
      if (!r.ok && r.grund === TEXTE.gesperrt) S.abmelden();
      ende(r);
    }, schiefgegangen);
  }

  // ---------- Anmelden mit Code (eingetippt) ----------
  // Promise: erfüllt, wenn das Kind drin ist, sonst abgelehnt mit einem kindgerechten Satz.
  function anmelden(roh) {
    letzterFehler = null;
    return K.anmelden(roh).then(function (r) {
      if (r.ok) { offen = true; return true; }
      throw r.grund || TEXTE.sonst;
    }, function () { throw TEXTE.sonst; });
  }

  // "Ich bin nicht …": erst sichern, dann abmelden. Der Stand bleibt auf dem Gerät.
  function abmelden() {
    offen = false;
    return K.abmelden();
  }

  function kind() {
    var s = S.aktiv();
    if (!offen || !s) return null;
    return { code: S.code(), vorname: s.name || 'Detektiv', angelegt: s.angelegt || null };
  }

  // ---------- Speicherzustand, sichtbar für das Kind ----------
  //   ok            alles in der Datenbank
  //   wartet        Schreibvorgang unterwegs
  //   wartet-lange  seit 25 s unterwegs oder ohne Netz auf dem Gerät geöffnet
  //   fehler        die Datenbank hat abgelehnt
  var speicher = { zustand: 'ok', meldung: null };
  var speicherLauscher = [];
  var uhr = null;
  function setzen(z, meldung) {
    if (speicher.zustand === z && speicher.meldung === (meldung || null)) return;
    speicher = { zustand: z, meldung: meldung || null };
    speicherLauscher.forEach(function (f) { try { f(speicher); } catch (e) {} });
  }
  K.beiZustand(function (z) {
    if (z.art === 'wartet') {
      if (speicher.zustand !== 'wartet-lange') setzen('wartet');
      if (!uhr) uhr = setTimeout(function () {
        uhr = null;
        if (K.zustand().art === 'wartet') setzen('wartet-lange');
      }, C.wartenHinweisNachMs);
      return;
    }
    clearTimeout(uhr); uhr = null;
    if (z.art === 'fehler') setzen('fehler', z.meldung);
    else if (z.art === 'lokal') setzen('wartet-lange');
    else setzen('ok');
  });

  // ---------- Lesen für die Akten (js/akten.js) ----------
  // name: 'faelle' oder 'loesungen' (Sammlungsnamen in RA.config.sammlung).
  // Firestore hält gelesene Dokumente im Gerätespeicher, deshalb klappt
  // ein zweites Öffnen auch ohne Netz.
  function db() {
    if (!K.aktiv()) throw new Error('keine Datenbank');
    return firebase.firestore();
  }
  function lesen(name, id) {
    return Promise.resolve().then(function () {
      return db().collection(C.sammlung[name]).doc(id).get();
    }).then(function (s) { return s.exists ? s.data() : null; });
  }
  function liste(name) {
    return Promise.resolve().then(function () {
      return db().collection(C.sammlung[name]).get();
    }).then(function (q) {
      var raus = [];
      q.forEach(function (s) { var d = s.data() || {}; d.id = s.id; raus.push(d); });
      return raus;
    });
  }

  RA.cloud = {
    lesen: lesen,
    liste: liste,
    start: start,
    anmelden: anmelden,
    abmelden: abmelden,
    schreiben: function () { return K.schreiben(); },
    codeSaeubern: LK.codePruefen,
    kind: kind,
    angemeldet: function () { return offen && !!S.aktiv(); },
    speicher: function () { return speicher; },
    onSpeicher: function (f) {
      if (speicherLauscher.indexOf(f) < 0) speicherLauscher.push(f);
      f(speicher);
    },
    // f wird gerufen, wenn die Lehrkraft den Stand zurückgesetzt hat und das Gerät leer anfängt
    onNeustart: function (f) { K.beiNeustart(f); },
    fehler: function () { return letzterFehler; },
    fehlerLoeschen: function () { letzterFehler = null; },
    TEXTE: TEXTE,
    // für die Tests
    _konto: K
  };
})();
