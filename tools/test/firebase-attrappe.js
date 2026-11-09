/* ==========================================================
   Riff-Akten – Firebase-Attrappe für den Rauchtest

   Ersetzt im Test die drei Firebase-Skripte aus index.html.
   Anmeldung und Datenbank laufen nur im Speicher dieser Seite;
   nichts geht an das echte Firebase-Projekt, kein echtes Kind
   wird angefasst.

   Abgebildet ist genau das, was js/cloud.js benutzt:
     auth:      onAuthStateChanged, signInWithEmailAndPassword,
                createUserWithEmailAndPassword, signOut
     firestore: collection().doc().get()/set(), collection().get(),
                where().get(), runTransaction, FieldValue.increment,
                enablePersistence
   Benutzt cloud.js später mehr, fällt das hier als Fehler auf –
   dann die Attrappe ergänzen.

   Die Testseite legt vor dem Laden fest, was in der Datenbank steht:
     window.ATTRAPPE = { daten: { 'kinder/abcd2345': {...} }, konten: {} }
   und liest hinterher daraus, was die App geschrieben hat.
   ========================================================== */
(function () {
  'use strict';

  var A = window.ATTRAPPE = window.ATTRAPPE || {};
  A.daten = A.daten || {};        // 'sammlung/kennung' -> Dokument
  A.konten = A.konten || {};      // mail -> passwort
  A.schreibvorgaenge = [];        // Protokoll: { pfad, daten, merge }

  function kopie(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function bald(f) { return new Promise(function (ok) { setTimeout(ok, 5); }).then(f); }
  function fehler(code) { var e = new Error(code); e.code = code; return e; }

  // ---------- Anmeldung ----------
  var nutzer = null, lauscher = [];
  function melden() { lauscher.forEach(function (f) { setTimeout(function () { f(nutzer); }, 0); }); }

  var auth = {
    get currentUser() { return nutzer; },
    onAuthStateChanged: function (f) {
      lauscher.push(f);
      setTimeout(function () { f(nutzer); }, 0);
      return function () { lauscher = lauscher.filter(function (g) { return g !== f; }); };
    },
    signInWithEmailAndPassword: function (mail, pw) {
      return bald(function () {
        if (!(mail in A.konten)) throw fehler('auth/user-not-found');
        if (A.konten[mail] !== pw) throw fehler('auth/wrong-password');
        nutzer = { email: mail, uid: 'uid-' + mail }; melden();
        return { user: nutzer };
      });
    },
    createUserWithEmailAndPassword: function (mail, pw) {
      return bald(function () {
        if (mail in A.konten) throw fehler('auth/email-already-in-use');
        A.konten[mail] = pw;
        nutzer = { email: mail, uid: 'uid-' + mail }; melden();
        return { user: nutzer };
      });
    },
    signOut: function () { return bald(function () { nutzer = null; melden(); }); },
    // Lehrerbereich: Google-Anmeldung. Welches Konto "ausgewählt" wird,
    // legt der Test in ATTRAPPE.googleKonto fest.
    signInWithPopup: function () {
      return bald(function () {
        if (!A.googleKonto) throw fehler('auth/popup-closed-by-user');
        nutzer = { email: A.googleKonto, uid: 'uid-' + A.googleKonto }; melden();
        return { user: nutzer };
      });
    },
    signInWithRedirect: function () { return this.signInWithPopup(); }
  };

  // Vereinfachte Regeln: Ist ATTRAPPE.lehrer gesetzt (Liste von
  // E-Mail-Adressen), darf nur eine Lehrkraft die ganze Sammlung
  // "kinder" lesen und dort schreiben oder löschen – wie istLehrer()
  // in firebase/firestore.rules.beispiel.
  function lehrerPruefen(sammlung) {
    if (!A.lehrer || sammlung !== 'kinder') return;
    if (!nutzer || A.lehrer.indexOf(nutzer.email) < 0) throw fehler('permission-denied');
  }

  // ---------- Datenbank ----------
  function INC(n) { this.n = n; }

  function schnappschuss(pfad) {
    var d = A.daten[pfad];
    return { id: pfad.split('/')[1], exists: d !== undefined, data: function () { return kopie(d); } };
  }

  function schreiben(pfad, neu, opt) {
    var merge = !!(opt && opt.merge);
    var alt = merge ? (A.daten[pfad] || {}) : {};
    var erg = kopie(alt);
    Object.keys(neu).forEach(function (k) {
      erg[k] = neu[k] instanceof INC ? (Number(alt[k]) || 0) + neu[k].n : kopie(neu[k]);
    });
    A.daten[pfad] = erg;
    A.schreibvorgaenge.push({ pfad: pfad, daten: kopie(erg), merge: merge });
  }

  function dokRef(sammlung, id) {
    var pfad = sammlung + '/' + id;
    return {
      id: id, pfad: pfad,
      sammlung: sammlung,
      get: function () { return bald(function () { return schnappschuss(pfad); }); },
      set: function (d, opt) { return bald(function () { lehrerPruefen(sammlung); schreiben(pfad, d, opt); }); },
      delete: function () {
        return bald(function () {
          lehrerPruefen(sammlung);
          delete A.daten[pfad];
          A.schreibvorgaenge.push({ pfad: pfad, geloescht: true });
        });
      }
    };
  }

  function abfrage(sammlung, filter) {
    return {
      get: function () {
        return bald(function () {
          lehrerPruefen(sammlung);
          var docs = Object.keys(A.daten)
            .filter(function (p) { return p.split('/')[0] === sammlung; })
            .map(schnappschuss)
            .filter(function (s) { return !filter || s.data()[filter.feld] === filter.wert; });
          return { size: docs.length, docs: docs, forEach: function (f) { docs.forEach(f); } };
        });
      }
    };
  }

  var db = {
    enablePersistence: function () { return Promise.resolve(); },
    collection: function (sammlung) {
      var q = abfrage(sammlung);
      return {
        doc: function (id) { return dokRef(sammlung, id); },
        get: q.get,
        where: function (feld, op, wert) {
          if (op !== '==') throw new Error('Attrappe kennt nur where(..., "==", ...)');
          return abfrage(sammlung, { feld: feld, wert: wert });
        }
      };
    },
    batch: function () {
      var schritte = [];
      return {
        set: function (ref, d, opt) { schritte.push(function () { lehrerPruefen(ref.sammlung); schreiben(ref.pfad, d, opt); }); },
        commit: function () { return bald(function () { schritte.forEach(function (s) { s(); }); }); }
      };
    },
    runTransaction: function (f) {
      return bald(function () {
        return f({
          get: function (ref) { return ref.get(); },
          set: function (ref, d, opt) { schreiben(ref.pfad, d, opt); }
        });
      });
    }
  };

  var firestore = function () { return db; };
  firestore.FieldValue = { increment: function (n) { return new INC(n); } };

  var authFn = function () { return auth; };
  authFn.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };

  window.firebase = {
    initializeApp: function (cfg) { A.config = cfg; return {}; },
    auth: authFn,
    firestore: firestore
  };
})();
