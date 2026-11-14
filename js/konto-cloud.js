/* Lernlagune-Konto, Baukasten: Anmeldung mit dem Zugangscode und Abgleich mit Firebase.
   Entstanden aus dem Piloten Zahlenschwarm (js/cloud.js), Vorbild war js/cloud.js des Perlentauchers.
   Alle Plattformen nutzen dasselbe Firebase-Projekt und dieselben Konten.

   Ablauf:
   1. Das Kind gibt seinen Code ein oder scannt den Aufkleber (Adresse endet auf #c=CODE).
   2. Die Seite meldet es unsichtbar bei Firebase an: Benutzername <code>@<authDomain>, Passwort = Code.
   3. Nur Codes, die die Lehrkraft angelegt hat (kinder/<code>), kommen hinein. Von dort kommt der Vorname.
   4. Der Stand liegt unter <sammlung>/<code>. Er wird nie blind überschrieben, sondern mit dem Stand
      auf dem Gerät zusammengeführt (Funktion mische der Plattform).
   5. Geschrieben wird gebündelt, kurz nach der letzten Änderung, beim Verlassen der Seite und beim Abmelden.

   Ohne Netz oder wenn Firebase nicht geladen wurde: Ein Code, den dieses Gerät schon kennt, öffnet den Stand
   auf dem Gerät. Abgeglichen wird, sobald es wieder geht.

   Auf dem eigenen Rechner (localhost) spricht das Modul nie mit dem echten Firebase, nur mit der Attrappe.

   Aufruf:
     const cloud = LagunenKonto.cloud({
       firebase: { apiKey, authDomain, projectId, … },   // dieselben Angaben wie im Perlentaucher
       sammlung: 'xx_stand',                             // Kürzel der Plattform, siehe 02-Datenmodell.md
       speicher: S,                                      // LagunenKonto.speicher(…) oder etwas mit derselben Form
       mische: (basis, lokal, fern) => stand,
       neuanfang: (lokal, jetzt) => stand,               // leerer Stand nach dem Zurücksetzen durch die Lehrkraft
       brauchtAngaben: false                             // true: Beim allerersten Anmelden fragt die Seite etwas ab
     });                                                 //       (z. B. die Klasse) und ruft dann cloud.anlegen(angaben)
   Diese Datei zeigt nichts an. Was das Kind sieht, macht die Plattform. */
(() => {
  'use strict';
  const LK = window.LagunenKonto = window.LagunenKonto || {};
  const A = LK.abgleich;

  /* Texte für das Kind. Eine Plattform kann einzelne über opt.texte ersetzen. */
  const TEXTE = {
    code: 'Dieser Code sieht nicht richtig aus. Schau noch einmal nach.',
    gesperrt: 'Dieser Code ist noch nicht freigeschaltet. Bitte sag deiner Lehrkraft Bescheid.',
    netz: 'Gerade gibt es kein Internet. Versuch es später noch einmal.',
    oft: 'Das waren zu viele Versuche. Warte kurz und versuch es dann noch einmal.',
    sonst: 'Die Anmeldung hat nicht geklappt. Bitte sag deiner Lehrkraft Bescheid.',
    unlesbar: 'Dein gespeicherter Stand konnte nicht gelesen werden. Bitte sag deiner Lehrkraft Bescheid.'
  };

  /* Der Aufkleber führt auf die Seite mit #c=CODE am Ende, wie beim Perlentaucher. */
  const ort = () => location.hash + location.search;
  LK.adresse = {
    code() { const m = /[#&?]c=([A-Za-z0-9]{8})(?![A-Za-z0-9])/.exec(ort()); return m ? m[1].toUpperCase() : null; },
    spur: () => /[#&?]c=/.test(ort()),
    /* Den Code aus der Adresszeile nehmen, damit er nicht im Verlauf oder auf einem Bildschirmfoto bleibt */
    saeubern() { try { if (/[#&?]c=/.test(ort())) history.replaceState(null, '', location.pathname); } catch (e) { /* dann bleibt er stehen */ } }
  };

  LK.cloud = function (opt) {
    const S = opt.speicher;
    const TEXT = { ...TEXTE, ...(opt.texte || {}) };
    const KINDER = opt.sammlungKinder || 'kinder';
    const SCHREIB_PAUSE = () => opt.schreibPauseMs || 2500;   /* so lange nach der letzten Änderung warten */
    const NOCHMAL = () => opt.nochmalMs || 8000;              /* ohne Netz: bis zum nächsten Versuch */
    const LADE_WARTE = opt.ladeWarteMs || 8000;               /* höchstens so lange auf die Firebase-Skripte warten */
    const NAME_MAX = opt.nameMax || 20;

    let auth = null, db = null;
    let aktiv = false;            /* Firebase ist geladen und eingerichtet */
    let kind = null;              /* { code, name }: angemeldet und freigeschaltet */
    let bereit = false;           /* der Stand ist geöffnet, es darf geschrieben werden */
    let wartend = null;           /* { code, name }: angemeldet, aber die Angaben fehlen noch */
    let nachholen = null;         /* Code, der ohne Netz nur auf dem Gerät geöffnet wurde */
    let timer = null, laeuft = null;

    const LOKAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const vorhanden = () => typeof firebase !== 'undefined' && !!opt.firebase.apiKey && (!LOKAL || !!window.ATTRAPPE);
    const mailVon = code => `${code.toLowerCase()}@${opt.firebase.authDomain}`;
    const idVon = code => code.toLowerCase();
    const NETZ_CODES = ['unavailable', 'deadline-exceeded', 'failed-precondition', 'aborted', 'auth/network-request-failed'];
    const istNetzFehler = e => !!e && NETZ_CODES.includes(e.code);

    /* Die Firebase-Skripte stehen in der Seite hinter den eigenen, damit die Seite nicht auf sie wartet. */
    let geladen = null;
    function ladenAbwarten() {
      if (typeof firebase !== 'undefined' || document.readyState === 'complete') return Promise.resolve();
      if (!geladen) geladen = new Promise(ok => { window.addEventListener('load', ok, { once: true }); setTimeout(ok, LADE_WARTE); });
      return geladen;
    }

    /* ---------- Zustand des Abgleichs ---------- */
    /* ok: alles in der Datenbank · wartet: Schreiben unterwegs oder ohne Netz zurückgestellt ·
       lokal: ohne Anmeldung nur auf dem Gerät · fehler: die Datenbank hat abgelehnt */
    let zustand = { art: 'ok', meldung: null };
    const zuhoerer = [], neustartHoerer = [];
    const rufe = (liste, wert) => { for (const f of liste.slice()) { try { f(wert); } catch (e) { /* Anzeige darf den Abgleich nicht stören */ } } };
    function melden(art, meldung = null) {
      if (zustand.art === art && zustand.meldung === meldung) return;
      zustand = { art, meldung };
      rufe(zuhoerer, zustand);
    }
    function fehlerText(e) {
      const c = e && e.code;
      if (c === 'permission-denied') return 'Die Datenbank hat das Speichern abgelehnt.';
      if (c === 'resource-exhausted') return 'Die Datenbank ist für heute ausgelastet.';
      return 'Das Speichern in der Datenbank hat nicht geklappt.';
    }

    /* ---------- Start ---------- */
    let eingerichtet = false;
    function einrichten() {
      if (eingerichtet) return aktiv;
      eingerichtet = true;
      if (S.istVorschau || !vorhanden()) return false;
      try {
        firebase.initializeApp(opt.firebase);
        auth = firebase.auth();
        db = firebase.firestore();
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
        aktiv = true;
      } catch (e) { aktiv = false; }
      return aktiv;
    }

    /* Stellt eine Anmeldung wieder her, die auf dem Gerät noch liegt.
       Ergebnis wie bei anmelden(), oder { ok: false } ohne Text, wenn niemand angemeldet ist. */
    function start() {
      return ladenAbwarten().then(() => einrichten() ? gemerkteAnmeldung() : { ok: false });
    }
    function gemerkteAnmeldung() {
      return new Promise(fertig => {
        let erledigt = false;
        auth.onAuthStateChanged(user => {
          if (erledigt) return;
          erledigt = true;
          const code = user && user.email ? LK.codePruefen(user.email.split('@')[0]) : null;
          if (!code) { fertig({ ok: false }); return; }
          nachAnmeldung(code).then(fertig, e => fertig(ohneNetz(code, e)));
        });
      });
    }

    /* ---------- Anmelden ---------- */
    /* Ergebnis: { ok: true, name, brauchtAngaben, ohneNetz, gespeichert } oder { ok: false, grund }.
       brauchtAngaben: Es gibt noch nirgends einen Stand, die Seite fragt etwas ab und ruft dann anlegen(). */
    function anmelden(roh) {
      const code = LK.codePruefen(roh);
      if (!code) return Promise.resolve({ ok: false, grund: TEXT.code });
      if (S.istVorschau) return Promise.resolve({ ok: false, grund: TEXT.sonst });
      return ladenAbwarten().then(() => einrichten() ? beiFirebaseAnmelden(code).then(() => nachAnmeldung(code)).catch(e => ohneNetz(code, e)) : ohneNetz(code, null));
    }
    function beiFirebaseAnmelden(code) {
      const mail = mailVon(code);
      return auth.signInWithEmailAndPassword(mail, code).catch(e => {
        /* Beim allerersten Anmelden gibt es das Konto noch nicht. */
        if (e && (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential')) return auth.createUserWithEmailAndPassword(mail, code);
        throw e;
      });
    }

    /* Wenn die Anmeldung scheitert: Liegt es am Netz und kennt das Gerät den Code, geht es auf dem Gerät weiter. */
    function ohneNetz(code, e) {
      if (e && auth && (e.kindText || !istNetzFehler(e))) auth.signOut().catch(() => {});
      if (e && e.kindText) return { ok: false, grund: e.kindText };
      if (e && !istNetzFehler(e)) {
        const c = e.code;
        return { ok: false, grund: c === 'auth/too-many-requests' ? TEXT.oft : c === 'auth/wrong-password' || c === 'auth/email-already-in-use' ? TEXT.code : TEXT.sonst };
      }
      if (!S.vorhanden(code)) return { ok: false, grund: TEXT.netz };
      const r = S.oeffnen(code);
      if (!r.kind) return { ok: false, grund: TEXT.unlesbar };
      nachholen = aktiv ? code : null;
      melden('lokal');
      return { ok: true, name: r.kind.name, brauchtAngaben: false, ohneNetz: true, gespeichert: r.ok };
    }

    /* Nach der Anmeldung bei Firebase: Konto prüfen, Stand holen, auf dem Gerät öffnen. */
    function nachAnmeldung(code) {
      const id = idVon(code);
      return db.collection(KINDER).doc(id).get().then(snap => {
        if (!snap.exists) return auth.signOut().catch(() => {}).then(() => { throw { kindText: TEXT.gesperrt }; });
        const name = String((snap.data() || {}).vorname || '').trim().slice(0, NAME_MAX) || 'Taucher';
        return db.collection(opt.sammlung).doc(id).get().then(st => {
          const fern = st.exists ? st.data() : null;
          if (opt.brauchtAngaben && !fern && !S.vorhanden(code)) {
            wartend = { code, name };
            return { ok: true, name, brauchtAngaben: true, ohneNetz: false };
          }
          return oeffnen(code, { name }, fern);
        });
      });
    }

    function oeffnen(code, konto, fern) {
      const r = S.oeffnen(code, konto);
      if (!r.kind) throw { kindText: TEXT.unlesbar };
      kind = { code, name: konto.name };
      wartend = null; nachholen = null;
      bereit = true;
      /* Den fernen Stand sofort einrechnen. Ist er zurückgesetzt worden, erledigt das der Abgleich in schreiben(). */
      if (fern && !A.zurueckgesetzt(S.abgleichsBasis(), fern)) S.fernEinrechnen(fern);
      melden('ok');
      schreiben().catch(() => {});
      return { ok: true, name: konto.name, brauchtAngaben: false, ohneNetz: false, gespeichert: r.ok };
    }

    /* Die Angaben eines ganz neuen Kindes (z. B. { klasse: 3 }). Danach ist der Stand angelegt. */
    function anlegen(angaben) {
      if (!wartend) return { ok: false, grund: TEXT.sonst };
      try { return oeffnen(wartend.code, { ...angaben, name: wartend.name }, null); }
      catch (e) { return { ok: false, grund: (e && e.kindText) || TEXT.sonst }; }
    }

    /* ---------- Schreiben = Zusammenführen ---------- */
    function spaeter(ms = SCHREIB_PAUSE()) {
      if (!bereit) return;
      clearTimeout(timer);
      timer = setTimeout(() => { schreiben().catch(() => {}); }, ms);
    }

    /* Liest in einer Transaktion den fernen Stand, führt zusammen und schreibt nur, wenn sich etwas ändert. */
    function schreiben() {
      if (!bereit || !kind || S.code() !== kind.code) return Promise.resolve(false);
      clearTimeout(timer);
      if (laeuft) return laeuft.then(() => schreiben());
      const ref = db.collection(opt.sammlung).doc(idVon(kind.code));
      const vorher = S.schnappschuss();
      const basis = S.abgleichsBasis();
      const fuer = kind.code;
      let zusammen = null, neustart = false;
      melden('wartet');
      laeuft = db.runTransaction(t => t.get(ref).then(snap => {
        const fern = snap.exists ? snap.data() : null;
        const p = A.plan({ basis, lokal: vorher.stand, fern, jetzt: Date.now(), mische: opt.mische, neuanfang: opt.neuanfang });
        zusammen = p.stand; neustart = p.zurueckgesetzt;
        if (!fern || !A.gleich(zusammen, fern)) t.set(ref, zusammen);
      })).then(() => {
        laeuft = null;
        /* Inzwischen abgemeldet oder ein anderes Kind? Dann nichts mehr anfassen. */
        if (!bereit || !kind || kind.code !== fuer || S.code() !== fuer) return false;
        const nochmal = S.abgleichUebernehmen(zusammen, vorher, neustart);
        melden('ok');
        if (neustart) rufe(neustartHoerer);
        if (nochmal) spaeter();
        return true;
      }, e => {
        laeuft = null;
        if (istNetzFehler(e) || !e || !e.code) { spaeter(NOCHMAL()); return false; }   /* ohne Netz: später noch einmal */
        melden('fehler', fehlerText(e));
        return false;
      });
      return laeuft;
    }

    /* Wieder Netz: Wer nur auf dem Gerät geöffnet war, wird jetzt still angemeldet. */
    function wiederNetz() {
      if (bereit) { spaeter(500); return Promise.resolve(); }
      if (!nachholen || !aktiv) return Promise.resolve();
      const code = nachholen;
      if (S.code() !== code) { nachholen = null; return Promise.resolve(); }
      return beiFirebaseAnmelden(code).then(() => { if (S.code() === code) return nachAnmeldung(code); }).catch(() => { /* beim nächsten Mal wieder */ });
    }

    /* Schreibt vorher noch einmal. Der Stand bleibt auf dem Gerät liegen (für Zeiten ohne Netz). */
    function abmelden() {
      clearTimeout(timer);
      const fertig = () => {
        bereit = false; kind = null; wartend = null; nachholen = null;
        S.abmelden();
        melden('ok');
        return auth ? auth.signOut().catch(() => {}) : undefined;
      };
      return (bereit ? schreiben().catch(() => {}) : Promise.resolve()).then(fertig);
    }

    S.beiAenderung(() => spaeter());
    window.addEventListener('pagehide', () => { schreiben().catch(() => {}); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') schreiben().catch(() => {}); });
    window.addEventListener('online', () => { wiederNetz(); });

    return {
      TEXT, start, anmelden, anlegen, abmelden, schreiben, wiederNetz,
      aktiv: () => aktiv,
      angemeldet: () => bereit,
      kind: () => kind,
      zustand: () => zustand,
      beiZustand(f) { if (!zuhoerer.includes(f)) zuhoerer.push(f); f(zustand); },
      /* f wird gerufen, wenn die Lehrkraft den Stand zurückgesetzt hat und das Gerät leer anfängt */
      beiNeustart(f) { if (!neustartHoerer.includes(f)) neustartHoerer.push(f); }
    };
  };
})();
