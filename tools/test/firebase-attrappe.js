/* ==========================================================
   Riff-Akten – Firebase-Attrappe für den Rauchtest

   Ersetzt im Test die drei Firebase-Skripte aus index.html.
   Seit dem Konto-Umbau (14.11.2026) ahmt sie die Regeln des
   gemeinsamen Projekts nach (Blöcke ra_stand, ra_faelle,
   ra_loesungen, siehe Ausgaben/Regel-Block … und
   firebase/firestore.rules.beispiel). Regeln und diese Attrappe
   werden immer zusammen geändert.
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
  A.gelesen = [];                 // Protokoll: gelesene Dokumente (Pfade)

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

  // ---------- Regeln (Nachbau) ----------
  // Lehrkraft: Ist ATTRAPPE.lehrer gesetzt (Liste von E-Mail-Adressen),
  // darf nur eine Lehrkraft die ganze Sammlung "kinder" lesen und dort
  // schreiben, und nur sie darf Akten schreiben – wie istLehrer().
  // Kind: meldet sich mit <code>@<authDomain> an (wie istKind()).
  function istLehrer() { return !!(A.lehrer && nutzer && A.lehrer.indexOf(nutzer.email) >= 0); }
  function mailCode() {
    var dom = '@' + ((A.config && A.config.authDomain) || 'lernplattform-44aa1.firebaseapp.com');
    var m = nutzer && nutzer.email;
    return m && m.slice(-dom.length) === dom ? m.slice(0, -dom.length) : null;
  }
  function istKind(code) { return mailCode() === code; }
  function freigeschaltet(code) { return !!code && A.daten['kinder/' + code] !== undefined; }

  // Wie raStandGueltig() im Regel-Block: nur diese Felder, Typen, Obergrenzen
  var RA_FELDER = ['erledigt', 'stempel', 'zeit', 'eintraege', 'abzeichen', 'angelegt', 'geaendert'];
  function ganzzahl(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function karte200(x) { return !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length <= 200; }
  function gueltig(d) {
    if (!d || typeof d !== 'object') return false;
    var k = Object.keys(d);
    if (k.some(function (f) { return RA_FELDER.indexOf(f) < 0; })) return false;          // hasOnly
    if (RA_FELDER.some(function (f) { return k.indexOf(f) < 0; })) return false;          // hasAll
    if (!ganzzahl(d.geaendert) || !ganzzahl(d.angelegt)) return false;
    if (!(typeof d.abzeichen === 'string' && d.abzeichen.length <= 20)) return false;
    return karte200(d.erledigt) && karte200(d.stempel) && karte200(d.zeit) && karte200(d.eintraege);
  }
  A.gueltig = gueltig;

  // op: 'get', 'list', 'write' (set und delete)
  function lehrerPruefen(sammlung, schreiben, id, daten) {
    var op = schreiben ? 'write' : (id === undefined ? 'list' : 'get');
    var nein = function () { throw fehler('permission-denied'); };
    if (sammlung === 'ra_stand') {
      if (istLehrer()) return;
      if (op === 'list' || !istKind(id)) nein();
      if (op === 'write' && !(freigeschaltet(id) && (daten === null || gueltig(daten)))) nein();
      if (op === 'write' && daten === null) nein();         // löschen nur die Lehrkraft
      return;
    }
    if (sammlung === 'ra_faelle' || sammlung === 'ra_loesungen') {
      if (istLehrer()) return;
      if (op === 'write') { if (A.lehrer) nein(); return; }
      if (!freigeschaltet(mailCode())) nein();
      return;
    }
    if (sammlung === 'kinder') {
      if (!A.lehrer) return;
      if (istLehrer()) return;
      if (op === 'get' && istKind(id)) return;
      nein();
    }
  }

  // ---------- Datenbank ----------
  function INC(n) { this.n = n; }

  function schnappschuss(pfad) {
    var d = A.daten[pfad];
    return { id: pfad.split('/')[1], exists: d !== undefined, data: function () { return kopie(d); } };
  }

  // Wie Firestore: keine Liste direkt in einer Liste.
  function formatPruefen(x, inListe) {
    if (Array.isArray(x)) {
      if (inListe) throw new Error('Function DocumentReference.set() called with invalid data. Nested arrays are not supported');
      x.forEach(function (y) { formatPruefen(y, true); });
    } else if (x && typeof x === 'object' && !(x instanceof INC)) {
      Object.keys(x).forEach(function (k) { formatPruefen(x[k], false); });
    }
  }

  // So sähe das Dokument nach dem Schreiben aus (für die Regeln, wie request.resource.data)
  function nachher(pfad, neu, opt) {
    var erg = (opt && opt.merge) ? kopie(A.daten[pfad] || {}) : {};
    Object.keys(neu).forEach(function (k) { erg[k] = neu[k] instanceof INC ? 0 : kopie(neu[k]); });
    return erg;
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
      get: function () { return bald(function () { lehrerPruefen(sammlung, false, id); A.gelesen.push(pfad); return schnappschuss(pfad); }); },
      set: function (d, opt) { formatPruefen(d, false); return bald(function () { lehrerPruefen(sammlung, true, id, nachher(pfad, d, opt)); schreiben(pfad, d, opt); }); },
      delete: function () {
        return bald(function () {
          lehrerPruefen(sammlung, true, id, null);
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
        set: function (ref, d, opt) { formatPruefen(d, false); schritte.push(function () { lehrerPruefen(ref.sammlung, true, ref.id, nachher(ref.pfad, d, opt)); schreiben(ref.pfad, d, opt); }); },
        commit: function () { return bald(function () { schritte.forEach(function (s) { s(); }); }); }
      };
    },
    runTransaction: function (f) {
      return bald(function () {
        return f({
          get: function (ref) { return ref.get(); },
          set: function (ref, d, opt) { formatPruefen(d, false); lehrerPruefen(ref.sammlung, true, ref.id, nachher(ref.pfad, d, opt)); schreiben(ref.pfad, d, opt); }
        });
      });
    }
  };

  var firestore = function () { return db; };
  firestore.FieldValue = { increment: function (n) { return new INC(n); } };

  var authFn = function () { return auth; };
  authFn.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };

  // Im Testrahmen wird die Seite mit document.write eingesetzt. Dann kommt
  // kein load-Ereignis mehr, und js/konto-cloud.js wartete 8 s auf die
  // Firebase-Skripte. Hier sind sie "geladen": Bescheid geben.
  setTimeout(function () { window.dispatchEvent(new Event('load')); }, 0);

  window.firebase = {
    initializeApp: function (cfg) { A.config = cfg; return {}; },
    auth: authFn,
    firestore: firestore
  };
})();
