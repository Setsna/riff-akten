/* ==========================================================
   Riff-Akten – Anmeldung und Speicherung in Firebase
   (übernommen und gekürzt aus Perlentaucher, js/cloud.js)

   Ablauf:
   1. Kind scannt den QR-Code. Die Adresse endet dann auf  #c=K7PM4XRT
   2. Die App meldet das Kind unsichtbar bei Firebase an:
        Benutzername  k7pm4xrt@riff-akten.firebaseapp.com
        Passwort      K7PM4XRT
      Beim allerersten Mal wird dieses Konto angelegt.
   3. Nur Codes, die im Lehrerbereich angelegt wurden (Dokument
      kinder/<code>), kommen weiter. Alle anderen werden abgemeldet.
   4. Ein gescannter Code hat Vorrang vor einer Anmeldung, die auf
      dem Gerät noch liegt. Auf geteilten iPads ist sonst noch das
      vorige Kind angemeldet und der Scan bliebe wirkungslos.
   5. Der Fortschritt liegt unter  fortschritt/<code>  und wird beim
      Speichern zusammengeführt, nicht überschrieben (js/merge.js).

   Kann Firebase nicht geladen werden (kein Netz), meldet start()
   den Zustand "offline". Ohne Datenbank gibt es keine Akten, weil
   die Lösungen nur dort liegen.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var C = RA.config;
  var app = null, auth = null, db = null;
  var kind = null;          // { code, vorname }
  var bereit = false;       // angemeldet und Fortschritt geladen
  var schreibTimer = null;
  var onReady = null;
  var letzterFehler = null;

  function vorhanden() { return typeof firebase !== 'undefined' && !!(C.firebase && C.firebase.apiKey); }
  function mailVon(code) { return code.toLowerCase() + '@' + C.firebase.authDomain; }

  // ---------- Code prüfen ----------
  // Großschreiben, Leerzeichen und Striche weg. Gibt den sauberen Code
  // zurück oder null, wenn er nicht aus dem erlaubten Alphabet besteht.
  function codeSaeubern(roh) {
    var c = String(roh || '').toUpperCase().replace(/[\s\-]/g, '');
    if (c.length !== C.code.laenge) return null;
    for (var i = 0; i < c.length; i++) if (C.code.alphabet.indexOf(c[i]) < 0) return null;
    return c;
  }

  function codeAusAdresse() {
    var m = /[#&?]c=([A-Za-z0-9]+)/.exec(location.hash + location.search);
    return m ? m[1] : null;
  }

  // Stand ein "c=" in der Adresse, aber ohne brauchbaren Code?
  // Dann kam der QR-Code nur halb an.
  function scanSpur() { return /[#&?]c=/.test(location.hash + location.search); }

  // Code aus der Adresszeile entfernen (Screenshots, Verlauf).
  // Andere Wege wie #buch oder #akte/... bleiben stehen, damit ein
  // Neuladen in derselben Ansicht landet.
  function adresseSaeubern() {
    try {
      if (scanSpur()) history.replaceState(null, '', location.pathname);
    } catch (e) {}
  }

  function fehlerMelden(f) {
    letzterFehler = (typeof f === 'string') ? f : 'Anmeldung nicht möglich.';
    if (typeof f !== 'string') console.warn('Riff-Akten:', f);
  }

  // ==========================================================
  //  Start
  //  fertig(zustand) mit zustand = 'angemeldet' | 'anmelden' | 'offline'
  // ==========================================================
  function start(fertig) {
    onReady = fertig || function () {};
    if (!vorhanden()) { onReady('offline'); return; }

    try {
      app = firebase.initializeApp(C.firebase);
      auth = firebase.auth();
      db = firebase.firestore();
      db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
    } catch (e) {
      console.warn('Firebase nicht verfügbar:', e);
      app = null; onReady('offline'); return;
    }

    var roh = codeAusAdresse();
    var code = roh ? codeSaeubern(roh) : null;
    var inArbeit = false, erledigt = false;

    // Firebase meldet den Anmeldezustand mehrfach. Nur das erste Mal zählt.
    auth.onAuthStateChanged(function (user) {
      if (erledigt || inArbeit) return;
      inArbeit = true;

      var angemeldeterCode = (user && user.email && user.email.indexOf('@') > 0)
        ? user.email.split('@')[0].toUpperCase() : null;

      var p;
      if (code && code === angemeldeterCode) {
        p = nachAnmeldung(code);
      } else if (code) {
        p = (angemeldeterCode ? auth.signOut().catch(function () {}) : Promise.resolve())
          .then(function () { return anmelden(code); });
      } else if (scanSpur()) {
        // Halber Scan: lieber neu anmelden lassen als still beim
        // vorigen Kind bleiben.
        fehlerMelden('Der QR-Code wurde nicht ganz gelesen. Tippe den Code von deinem Aufkleber ein.');
        p = (angemeldeterCode ? auth.signOut().catch(function () {}) : Promise.resolve())
          .then(function () { return false; });
      } else if (angemeldeterCode) {
        p = nachAnmeldung(angemeldeterCode);
      } else {
        p = Promise.resolve(false);
      }

      p.then(function (ok) {
        adresseSaeubern();
        erledigt = true; inArbeit = false;
        onReady(ok ? 'angemeldet' : 'anmelden');
      }, function (f) {
        adresseSaeubern();
        fehlerMelden(f);
        erledigt = true; inArbeit = false;
        onReady('anmelden');
      });
    });
  }

  // ==========================================================
  //  Anmelden mit Code (QR oder eingetippt)
  //  Liefert ein Promise; bei Fehler ein kindgerechter Satz.
  // ==========================================================
  function anmelden(roh) {
    var code = codeSaeubern(roh);
    if (!code) {
      return Promise.reject('Dieser Code sieht nicht richtig aus. Er hat 8 Zeichen. Schau noch einmal auf deinen Aufkleber.');
    }
    if (!auth) return Promise.reject('Gerade gibt es keine Verbindung. Versuch es gleich noch einmal.');
    var mail = mailVon(code);
    letzterFehler = null;
    return auth.signInWithEmailAndPassword(mail, code)
      .catch(function (e) {
        // Beim allerersten Anmelden gibt es das Konto noch nicht.
        if (e && (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' ||
                  e.code === 'auth/invalid-login-credentials')) {
          return auth.createUserWithEmailAndPassword(mail, code);
        }
        throw e;
      })
      .then(function () { return nachAnmeldung(code); })
      .catch(function (e) {
        var c = e && e.code;
        if (c === 'auth/email-already-in-use' || c === 'auth/wrong-password') {
          throw 'Mit diesem Code klappt es gerade nicht. Bitte sag deiner Lehrkraft Bescheid.';
        }
        if (c === 'auth/network-request-failed') throw 'Gerade gibt es kein Internet. Versuch es gleich noch einmal.';
        if (c === 'auth/too-many-requests') throw 'Das waren viele Versuche. Warte kurz und versuch es dann noch einmal.';
        throw (typeof e === 'string') ? e : 'Die Anmeldung hat nicht geklappt. Bitte sag deiner Lehrkraft Bescheid.';
      });
  }

  // Nach erfolgreicher Anmeldung: freigeschaltet? Dann Fortschritt laden.
  function nachAnmeldung(code) {
    var id = code.toLowerCase();
    return db.collection('kinder').doc(id).get()
      .then(function (snap) {
        if (!snap.exists) {
          return auth.signOut().then(function () {
            throw 'Dieser Code ist noch nicht freigeschaltet. Bitte sag deiner Lehrkraft Bescheid.';
          });
        }
        var d = snap.data() || {};
        kind = { code: code, vorname: d.vorname || 'Detektiv',
                 angelegt: typeof d.angelegt === 'number' ? d.angelegt : null };
        RA.store.useProfile(id);
        bereit = true;
        RA.store.onChange(spaeterSchreiben);
        // Ohne "return": Der Fortschritt liegt lokal sicher, das
        // Abgleichen darf nebenher laufen. So erscheint die Startseite
        // sofort und nicht erst nach einer weiteren Netzrunde.
        schreiben().catch(function () {});
        return true;
      }, function (e) {
        // "kinder" nicht lesbar: meist fehlen die Firestore-Regeln.
        if (e && e.code === 'permission-denied') {
          return auth.signOut().catch(function () {}).then(function () {
            throw 'Die Datenbank lässt dich gerade nicht herein. Bitte sag deiner Lehrkraft Bescheid.';
          });
        }
        throw e;
      });
  }

  // "Ich bin das nicht": erst sichern, dann abmelden.
  function abmelden() {
    if (!auth) return Promise.resolve();
    return schreiben().catch(function () {}).then(function () {
      bereit = false; kind = null;
      return auth.signOut();
    });
  }

  // ==========================================================
  //  Speicherzustand, sichtbar für das Kind
  //    ok            zuletzt erfolgreich gespeichert
  //    wartet        Schreibvorgang unterwegs
  //    wartet-lange  seit 25 s unterwegs (fast immer: kein Netz)
  //    fehler        die Datenbank hat abgelehnt
  // ==========================================================
  var speicher = { zustand: 'ok', meldung: null };
  var speicherLauscher = [];
  var wartUhr = null;

  function speicherMelden(zustand, meldung) {
    if (speicher.zustand === zustand && speicher.meldung === (meldung || null)) return;
    if (zustand !== 'wartet-lange') { clearTimeout(wartUhr); wartUhr = null; }
    speicher = { zustand: zustand, meldung: meldung || null };
    speicherLauscher.forEach(function (f) { try { f(speicher); } catch (e) {} });
  }

  // Läuft die Uhr schon, nicht neu starten – sonst käme der Hinweis nie.
  function wartenBeobachten() {
    if (wartUhr) return;
    wartUhr = setTimeout(function () {
      wartUhr = null;
      if (speicher.zustand === 'wartet') speicherMelden('wartet-lange');
    }, C.wartenHinweisNachMs);
  }

  function schreibFehlerText(e) {
    var c = e && e.code;
    if (c === 'permission-denied') return 'Die Datenbank hat das Speichern abgelehnt.';
    if (c === 'resource-exhausted') return 'Die Datenbank ist für heute ausgelastet.';
    return 'Beim Speichern ist ein Fehler passiert.';
  }

  // ==========================================================
  //  Speichern = Zusammenführen (Transaktion)
  // ==========================================================
  function spaeterSchreiben(verzug) {
    if (!bereit) return;
    clearTimeout(schreibTimer);
    schreibTimer = setTimeout(schreiben, typeof verzug === 'number' ? verzug : C.speichernNachMs);
  }

  function schreiben() {
    if (!bereit || !kind) return Promise.resolve();
    clearTimeout(schreibTimer);
    var ref = db.collection('fortschritt').doc(kind.code.toLowerCase());
    var lokal = RA.store.snapshot();
    var basis = RA.store.basis();
    var zusammen = null;

    speicherMelden('wartet');
    wartenBeobachten();

    return db.runTransaction(function (t) {
      return t.get(ref).then(function (snap) {
        zusammen = RA.mische.spielstand(basis, lokal, snap.exists ? snap.data() : null);
        if (!zusammen.geaendert) zusammen.geaendert = Date.now();
        t.set(ref, zusammen);
      });
    }).then(function () {
      RA.store.abgleichUebernehmen(zusammen);
      speicherMelden('ok');
    }, function (e) {
      // Ohne Netz kommt keine Transaktion zustande. Kein Fehler:
      // Der Stand liegt lokal, gleich noch einmal versuchen.
      if (!e || e.code === 'unavailable' || e.code === 'deadline-exceeded' ||
          e.code === 'failed-precondition' || e.code === 'aborted') {
        spaeterSchreiben(C.wiederholenNachMs);
        return;
      }
      console.warn('Riff-Akten: Speichern abgelehnt', e);
      speicherMelden('fehler', schreibFehlerText(e));
    });
  }

  window.addEventListener('pagehide', function () { schreiben(); });
  window.addEventListener('online', function () { spaeterSchreiben(500); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') schreiben();
  });

  // ==========================================================
  //  Lesen für die Akten (js/akten.js)
  //  Firestore hält gelesene Dokumente im Gerätespeicher
  //  (enablePersistence), deshalb klappt ein zweites Öffnen auch
  //  ohne Netz.
  // ==========================================================
  function lesen(sammlung, id) {
    if (!db) return Promise.reject(new Error('keine Datenbank'));
    return db.collection(sammlung).doc(id).get().then(function (s) {
      return s.exists ? s.data() : null;
    });
  }
  function liste(sammlung) {
    if (!db) return Promise.reject(new Error('keine Datenbank'));
    return db.collection(sammlung).get().then(function (q) {
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
    schreiben: schreiben,
    codeSaeubern: codeSaeubern,
    kind: function () { return kind; },
    angemeldet: function () { return bereit; },
    speicher: function () { return speicher; },
    onSpeicher: function (f) {
      if (speicherLauscher.indexOf(f) < 0) speicherLauscher.push(f);
      f(speicher);
    },
    fehler: function () { return letzterFehler; },
    fehlerLoeschen: function () { letzterFehler = null; }
  };
})();
