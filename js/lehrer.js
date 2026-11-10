/* ==========================================================
   Riff-Akten – Lehrerbereich (Etappe 1: Mini-Fassung)

   - Anmeldung mit Google. Ob jemand Lehrkraft ist, entscheiden
     allein die Firestore-Regeln (istLehrer()). Lehnt die Datenbank
     ab, steht hier, welches Konto eingetragen werden muss.
   - Kinderliste: Vorname, Code, zuletzt aktiv.
   - Kinder freischalten: kinder.json aus tools/qr_aufkleber.py.
   - Sperren: löscht nur kinder/<code>. Der Fortschritt bleibt
     liegen und ist wieder da, wenn derselbe Code neu freigeschaltet
     wird.

   Etappe 4: Auswertung (4a); Auskunft als Datei, endgültig Löschen,
   Aufräumen lange inaktiver Kinder, Kind einzeln anlegen (4b);
   Sicherung herunterladen und wiederherstellen (4c); Akten ein- und
   ausblenden, als Fall-Datei herunterladen, löschen (4d).
   ========================================================== */
(function () {
  'use strict';

  var C = window.RA.config;
  var appEl = document.getElementById('app');
  var liveEl = document.getElementById('live');
  var auth = null, db = null, nutzer = null;
  var kinder = [];
  var akten = [];
  var CODE_RE = new RegExp('^[' + C.code.alphabet + ']{' + C.code.laenge + '}$');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function ansagen(text) { liveEl.textContent = ''; setTimeout(function () { liveEl.textContent = text; }, 50); }
  function fmtCode(id) { var c = String(id).toUpperCase(); return c.slice(0, 4) + '-' + c.slice(4); }

  function fuss() {
    return '<footer class="fuss"><a href="index.html">Zur Kinder-App</a>' +
      '<a href="datenschutz.html">Datenschutz</a><a href="impressum.html">Impressum</a></footer>';
  }

  function zeigen(html) {
    appEl.innerHTML = '<main class="lehrer">' + html + '</main>' + fuss();
    var h = appEl.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }

  // ---------- Dialog (echter Dialog: Fokus hinein, Tab im Kreis,
  //            Escape schließt, Fokus zurück) ----------
  // zurueck: das Element, das den Dialog geöffnet hat. Ausdrücklich
  // übergeben, weil Safari Knöpfe beim Antippen nicht fokussiert und
  // document.activeElement dann nur body wäre.
  function frage(titel, text, jaText, zurueck) {
    var d = el('dialog'), vorher = zurueck || document.activeElement;
    el('dialog-titel').textContent = titel;
    el('dialog-text').textContent = text;
    el('dialog-ja').textContent = jaText || 'OK';
    return new Promise(function (fertig) {
      function zu(antwort) {
        el('dialog-ja').onclick = el('dialog-nein').onclick = null;
        d.onclose = d.oncancel = null;
        if (d.open) d.close();
        if (vorher && vorher.focus) vorher.focus();
        fertig(antwort);
      }
      el('dialog-ja').onclick = function () { zu(true); };
      el('dialog-nein').onclick = function () { zu(false); };
      // Escape: "cancel" kommt sofort, "close" in manchen Browsern verspätet
      d.oncancel = function (ev) { ev.preventDefault(); zu(false); };
      d.onclose = function () { zu(false); };
      d.showModal();
      el('dialog-nein').focus();
    });
  }

  // ---------- Start ----------
  if (typeof firebase === 'undefined') {
    zeigen('<h1>Lehrerbereich</h1><p class="lmeldung fehler">Firebase konnte nicht geladen werden. ' +
      'Bitte die Internetverbindung prüfen.</p>');
    return;
  }
  firebase.initializeApp(C.firebase);
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged(function (u) {
    nutzer = u;
    // Ein Kinderkonto (Code-Anmeldung auf diesem Gerät) ist keine Lehrkraft.
    if (!u || !u.email || /@riff-akten\.firebaseapp\.com$/i.test(u.email)) { anmeldung(); return; }
    laden();
  });

  // ---------- Anmeldung ----------
  function anmeldung(meldung) {
    zeigen('<section class="lkarte lkarte--schmal">' +
      '<h1>Lehrerbereich</h1>' +
      '<p>Melde dich mit dem Google-Konto an, das in den Firestore-Regeln als Lehrkraft eingetragen ist.</p>' +
      (meldung ? '<p class="lmeldung fehler" role="alert">' + esc(meldung) + '</p>' : '') +
      '<button type="button" class="lknopf" id="google">Mit Google anmelden</button>' +
      '</section>');
    el('google').addEventListener('click', function () {
      var p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      auth.signInWithPopup(p).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          return auth.signInWithRedirect(p);
        }
        if (e && e.code === 'auth/popup-closed-by-user') return;
        anmeldung('Anmeldung nicht möglich: ' + ((e && e.message) || e));
      });
    });
  }

  // ---------- Laden ----------
  function laden() {
    zeigen('<h1>Lehrerbereich</h1><p>Daten werden geladen …</p>');
    return db.collection('kinder').get().then(function (snap) {
      kinder = [];
      snap.forEach(function (d) { kinder.push(Object.assign({ id: d.id }, d.data())); });
      kinder.sort(function (a, b) { return String(a.vorname).localeCompare(String(b.vorname), 'de'); });
      return Promise.all(kinder.map(function (k) {
        return db.collection('fortschritt').doc(k.id).get()
          .then(function (f) { k.stand = f.exists ? f.data() : null; })
          .catch(function () { k.stand = null; });
      }));
    }).then(function () {
      return db.collection('faelle').get().then(function (snap) {
        akten = [];
        snap.forEach(function (d) { akten.push(Object.assign({ id: d.id }, d.data())); });
        akten.sort(function (a, b) { return (a.nr || 99) - (b.nr || 99); });
      });
    }).then(zeichnen, function (e) {
      var keinZugriff = e && e.code === 'permission-denied';
      zeigen(kopf() +
        '<p class="lmeldung fehler" role="alert">' + (keinZugriff
          ? 'Das Konto ' + esc(nutzer && nutzer.email) + ' ist in den Firestore-Regeln nicht als Lehrkraft ' +
            'eingetragen. Trag die Adresse in istLehrer() ein und veröffentliche die Regeln in der Firebase-Konsole.'
          : 'Fehler beim Laden: ' + esc(e && e.message)) + '</p>');
      bindeKopf();
    });
  }

  function kopf() {
    return '<header class="lkopf"><h1>Lehrerbereich</h1>' +
      '<p class="lkopf__wer">' + esc(nutzer && nutzer.email) +
      ' <button type="button" class="lknopf leise klein" id="abmelden">Abmelden</button></p></header>';
  }
  function bindeKopf() { el('abmelden').addEventListener('click', function () { auth.signOut(); }); }

  function zuletzt(k) {
    var t = k.stand && k.stand.geaendert;
    if (!t) return 'noch nie angemeldet';
    var tage = Math.floor((Date.now() - t) / 86400000);
    var datum = new Date(t).toLocaleDateString('de-DE');
    return tage <= 0 ? 'heute' : (tage === 1 ? 'gestern' : 'vor ' + tage + ' Tagen') + ' (' + datum + ')';
  }

  // ---------- Hauptansicht ----------
  function zeichnen() {
    var zeilen = kinder.map(function (k) {
      return '<tr><th scope="row">' + esc(k.vorname) + '</th>' +
        '<td class="code">' + esc(fmtCode(k.id)) + '</td>' +
        '<td>' + esc(zuletzt(k)) + '</td>' +
        '<td class="aktionen">' +
          '<button type="button" class="lknopf leise klein" data-auskunft="' + esc(k.id) + '" ' +
            'aria-label="Auskunft über ' + esc(k.vorname) + ' als Datei">Auskunft</button>' +
          '<button type="button" class="lknopf leise klein" data-sperren="' + esc(k.id) + '" ' +
            'aria-label="Zugang von ' + esc(k.vorname) + ' sperren">Sperren</button>' +
          '<button type="button" class="lknopf leise klein gefahr" data-loeschen="' + esc(k.id) + '" ' +
            'aria-label="' + esc(k.vorname) + ' endgültig löschen">Löschen</button>' +
        '</td></tr>';
    }).join('');

    zeigen(kopf() +
      '<section class="lkarte" aria-labelledby="t-kinder">' +
        '<h2 id="t-kinder">Freigeschaltete Kinder (' + kinder.length + ')</h2>' +
        '<p class="lhinweis"><b>Auskunft</b> lädt alles, was zu einem Kind gespeichert ist, als Datei herunter. ' +
          '<b>Sperren</b> macht nur den Aufkleber unbrauchbar; der Fortschritt bleibt und ist wieder da, wenn du ' +
          'denselben Code erneut freischaltest. <b>Löschen</b> entfernt Vorname, Code und Lernstand endgültig. ' +
          'Das unsichtbare Anmeldekonto (Kennung = Code, ohne Namen) bleibt in Firebase und lässt sich bei Bedarf ' +
          'in der Firebase-Konsole unter Authentication von Hand löschen.</p>' +
        '<div class="tabelle-rahmen"><table class="tabelle">' +
          '<caption class="unsichtbar">Freigeschaltete Kinder</caption>' +
          '<thead><tr><th scope="col">Vorname</th><th scope="col">Code</th><th scope="col">Zuletzt aktiv</th>' +
          '<th scope="col"><span class="unsichtbar">Aktionen</span></th></tr></thead>' +
          '<tbody>' + (zeilen || '<tr><td colspan="4">Noch keine Kinder freigeschaltet.</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</section>' +

      auswertungHtml() +

      '<section class="lkarte" aria-labelledby="t-frei">' +
        '<h2 id="t-frei">Kinder freischalten</h2>' +
        '<p class="lhinweis">Lade die Datei <b>kinder.json</b>, die zusammen mit dem Aufkleberbogen entsteht ' +
          '(<code>tools/qr_aufkleber.py</code>), oder füge ihren Inhalt ein. Vorhandene Kinder werden nicht ' +
          'doppelt angelegt, ihr Fortschritt bleibt erhalten.</p>' +
        '<label class="ldatei" for="datei">Datei kinder.json wählen</label>' +
        '<input type="file" id="datei" accept=".json,application/json">' +
        '<label for="json">Inhalt von kinder.json</label>' +
        '<textarea id="json" rows="5" spellcheck="false"></textarea>' +
        '<button type="button" class="lknopf" id="freischalten">Kinder freischalten</button>' +
        '<div id="ergebnis" aria-live="polite"></div>' +
      '</section>' +

      '<section class="lkarte" aria-labelledby="t-neu">' +
        '<h2 id="t-neu">Ein Kind anlegen</h2>' +
        '<p class="lhinweis">Für ein neues Kind im laufenden Schuljahr. Der Code wird zufällig erzeugt.</p>' +
        '<label for="neu-vorname">Vorname</label>' +
        '<input type="text" id="neu-vorname" maxlength="40" autocomplete="off">' +
        '<button type="button" class="lknopf" id="neu-anlegen">Code erzeugen und freischalten</button>' +
        '<div id="neu-ergebnis" aria-live="polite"></div>' +
      '</section>' +

      '<section class="lkarte" aria-labelledby="t-aufraeumen">' +
        '<h2 id="t-aufraeumen">Aufräumen</h2>' +
        '<p class="lhinweis">Laut Datenschutzerklärung werden Daten gelöscht, sobald sie nicht mehr gebraucht ' +
          'werden. Hier findest du Kinder, die lange nicht aktiv waren. Gelöscht wird erst nach einer Rückfrage.</p>' +
        '<label for="aufraeumen-monate">Nicht aktiv seit mindestens</label>' +
        '<select id="aufraeumen-monate"><option value="6">6 Monaten</option>' +
          '<option value="12" selected>12 Monaten</option><option value="24">24 Monaten</option></select> ' +
        '<button type="button" class="lknopf leise" id="aufraeumen-suchen">Inaktive Kinder suchen</button>' +
        '<div id="aufraeumen-ergebnis" aria-live="polite"></div>' +
      '</section>' +

      '<section class="lkarte" aria-labelledby="t-sicherung">' +
        '<h2 id="t-sicherung">Sicherung</h2>' +
        '<p class="lhinweis">Eine Datei mit allen Kindern, Lernständen, Akten und Lösungen. ' +
          'Sie enthält Namen und Lösungen: sicher aufbewahren, nicht weitergeben, nicht ins Repository legen.</p>' +
        '<button type="button" class="lknopf" id="sicherung-laden">Sicherung herunterladen</button>' +
        '<div id="sicherung-ergebnis" aria-live="polite"></div>' +
        '<h3>Wiederherstellen</h3>' +
        '<p class="lhinweis">Normalerweise wird nur ergänzt, was fehlt (zum Beispiel versehentlich gelöschte Kinder). ' +
          'Gelöscht wird nie etwas.</p>' +
        '<label class="ldatei" for="wieder-datei">Sicherungsdatei wählen</label>' +
        '<input type="file" id="wieder-datei" accept=".json,application/json">' +
        '<p class="lcheck"><input type="checkbox" id="wieder-ueberschreiben"> ' +
          '<label for="wieder-ueberschreiben">Vorhandene Einträge überschreiben (setzt neueren Fortschritt zurück)</label></p>' +
        '<button type="button" class="lknopf" id="wieder-start" disabled>Wiederherstellen</button>' +
        '<div id="wieder-ergebnis" aria-live="polite"></div>' +
      '</section>' +

      '<section class="lkarte" aria-labelledby="t-akten">' +
        '<h2 id="t-akten">Akten (' + akten.length + ')</h2>' +
        '<div class="tabelle-rahmen"><table class="tabelle">' +
          '<caption class="unsichtbar">Vorhandene Akten</caption>' +
          '<thead><tr><th scope="col">Nr.</th><th scope="col">Titel</th><th scope="col">Kennung</th>' +
          '<th scope="col">Klasse</th><th scope="col">Für Kinder sichtbar</th>' +
          '<th scope="col"><span class="unsichtbar">Aktionen</span></th></tr></thead>' +
          '<tbody>' + (akten.map(function (a) {
            var an = a.aktiv !== false;
            return '<tr><td>' + esc(a.nr || '') + '</td><th scope="row">' + esc(a.titel) + '</th>' +
              '<td class="code">' + esc(a.id) + '</td><td>' + esc(a.klasse || '') + '</td>' +
              '<td>' + (an ? 'ja' : 'nein (ausgeblendet)') + '</td>' +
              '<td class="aktionen">' +
                '<button type="button" class="lknopf leise klein" data-akte-sichtbar="' + esc(a.id) + '">' +
                  (an ? 'Ausblenden' : 'Einblenden') + '<span class="unsichtbar"> „' + esc(a.titel) + '“</span></button>' +
                '<button type="button" class="lknopf leise klein" data-akte-laden="' + esc(a.id) + '">' +
                  'Herunterladen<span class="unsichtbar"> „' + esc(a.titel) + '“</span></button>' +
                '<button type="button" class="lknopf leise klein gefahr" data-akte-loeschen="' + esc(a.id) + '">' +
                  'Löschen<span class="unsichtbar"> „' + esc(a.titel) + '“</span></button>' +
              '</td></tr>';
          }).join('') || '<tr><td colspan="6">Noch keine Akten.</td></tr>') + '</tbody>' +
        '</table></div>' +
        '<h3>Akte hochladen</h3>' +
        '<p class="lhinweis">Lade eine Fall-Datei (<b>.json</b> mit <code>id</code>, <code>fall</code> und ' +
          '<code>loesung</code>). Die Datei wird vorher geprüft. Gibt es die Kennung schon, wird die Akte ' +
          'ersetzt; der Fortschritt der Kinder bleibt.</p>' +
        '<label class="ldatei" for="akte-datei">Fall-Datei wählen</label>' +
        '<input type="file" id="akte-datei" accept=".json,application/json">' +
        '<label for="akte-json">Inhalt der Fall-Datei</label>' +
        '<textarea id="akte-json" rows="5" spellcheck="false"></textarea>' +
        '<button type="button" class="lknopf" id="akte-hochladen">Akte prüfen und hochladen</button>' +
        '<div id="akte-ergebnis" aria-live="polite"></div>' +
      '</section>');

    bindeKopf();
    el('datei').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { el('json').value = String(r.result || ''); ansagen('Datei geladen. Jetzt „Kinder freischalten“ wählen.'); };
      r.readAsText(f, 'utf-8');
    });
    el('freischalten').addEventListener('click', freischalten);
    el('akte-datei').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { el('akte-json').value = String(r.result || ''); ansagen('Datei geladen. Jetzt „Akte prüfen und hochladen“ wählen.'); };
      r.readAsText(f, 'utf-8');
    });
    el('akte-hochladen').addEventListener('click', aktenHochladen);
    Array.prototype.forEach.call(document.querySelectorAll('[data-akte-sichtbar]'), function (b) {
      b.addEventListener('click', function () { akteSichtbar(b.getAttribute('data-akte-sichtbar'), b); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-akte-laden]'), function (b) {
      b.addEventListener('click', function () { akteHerunterladen(b.getAttribute('data-akte-laden'), b); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-akte-loeschen]'), function (b) {
      b.addEventListener('click', function () { akteLoeschen(b.getAttribute('data-akte-loeschen'), b); });
    });
    auswertungBinden();
    Array.prototype.forEach.call(document.querySelectorAll('[data-sperren]'), function (b) {
      b.addEventListener('click', function () { sperren(b.getAttribute('data-sperren'), b); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-loeschen]'), function (b) {
      b.addEventListener('click', function () { loeschen(b.getAttribute('data-loeschen'), b); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-auskunft]'), function (b) {
      b.addEventListener('click', function () { auskunft(b.getAttribute('data-auskunft')); });
    });
    el('neu-anlegen').addEventListener('click', einzelnAnlegen);
    el('neu-vorname').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') einzelnAnlegen(); });
    el('aufraeumen-suchen').addEventListener('click', inaktiveSuchen);
    el('sicherung-laden').addEventListener('click', function () { sicherungErstellen(this); });
    el('wieder-datei').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { wiederLesen(String(rd.result || '')); };
      rd.readAsText(f, 'utf-8');
    });
    el('wieder-start').addEventListener('click', function () { wiederherstellen(this); });
  }

  // ---------- Freischalten ----------
  function freischalten() {
    var erg = el('ergebnis'), liste;
    try {
      liste = JSON.parse(el('json').value.trim());
      if (!Array.isArray(liste)) throw new Error('Es wird eine Liste erwartet.');
    } catch (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Die Datei konnte nicht gelesen werden: ' + esc(e.message) + '</p>';
      return;
    }
    var gut = [], schlecht = [];
    liste.forEach(function (k, i) {
      var code = String(k && k.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var name = String(k && k.vorname || '').trim();
      if (!CODE_RE.test(code) || !name) schlecht.push(i + 1);
      else gut.push({ id: code.toLowerCase(), vorname: name });
    });
    if (schlecht.length) {
      erg.innerHTML = '<p class="lmeldung fehler">Fehlerhafte Einträge an Position ' + schlecht.join(', ') +
        '. Es wurde nichts gespeichert.</p>';
      return;
    }
    if (!gut.length) { erg.innerHTML = '<p class="lmeldung fehler">Die Liste ist leer.</p>'; return; }

    erg.innerHTML = '<p class="lmeldung">Wird gespeichert …</p>';
    var batch = db.batch();
    gut.forEach(function (k) {
      // "angelegt" nur beim ersten Mal (steht als "Detektiv seit" auf dem Ausweis)
      var neu = !kinder.some(function (x) { return x.id === k.id; });
      batch.set(db.collection('kinder').doc(k.id),
        neu ? { vorname: k.vorname, angelegt: Date.now() } : { vorname: k.vorname }, { merge: true });
    });
    batch.commit().then(function () {
      laden();
      ansagen(gut.length + ' Kinder freigeschaltet.');
    }, function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Speichern fehlgeschlagen: ' + esc(e.message) + '</p>';
    });
  }

  // ---------- Sperren ----------
  function sperren(id, knopf) {
    var k = kinder.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    frage('Zugang sperren?',
      'Der Aufkleber von ' + k.vorname + ' funktioniert danach nicht mehr. Der Fortschritt bleibt gespeichert ' +
      'und ist wieder da, wenn du denselben Code erneut freischaltest.', 'Sperren', knopf)
      .then(function (ja) {
        if (!ja) return;
        db.collection('kinder').doc(id).delete().then(function () {
          laden();
          ansagen('Zugang von ' + k.vorname + ' gesperrt.');
        }, function (e) {
          frage('Sperren fehlgeschlagen', e.message || String(e), 'OK');
        });
      });
  }


  // ==========================================================
  // Akten hochladen (Etappe 3; der richtige Fall-Editor kommt in Etappe 4)
  //
  // Datei: { "id": "pausenbrot", "fall": {...}, "loesung": {...} }
  // Format: siehe tools/test/demo-fall.js. Gespeichert wird in zwei
  // Dokumente: faelle/<id> (sehen die Kinder) und loesungen/<id>
  // (wird erst beim Prüfen geladen).
  // ==========================================================
  function aktenHochladen() {
    var erg = el('akte-ergebnis'), d;
    try { d = JSON.parse(el('akte-json').value.trim()); } catch (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Die Datei konnte nicht gelesen werden: ' + esc(e.message) + '</p>';
      return;
    }
    var fehlerliste = RA.fallPruefen(d);
    if (fehlerliste.length) {
      erg.innerHTML = '<div class="lmeldung fehler"><p>Es wurde nichts gespeichert. Bitte korrigieren:</p><ul>' +
        fehlerliste.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
      return;
    }
    var fall = Object.assign({ aktiv: true }, d.fall);
    var vorhanden = akten.some(function (a) { return a.id === d.id; });
    erg.innerHTML = '<p class="lmeldung">Wird gespeichert …</p>';
    var batch;
    try {
      // Firestore prüft das Format schon hier und wirft sofort einen Fehler
      batch = db.batch();
      batch.set(db.collection('faelle').doc(d.id), fall);
      batch.set(db.collection('loesungen').doc(d.id), d.loesung);
    } catch (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Speichern nicht möglich: ' + esc(e.message) + '</p>';
      return;
    }
    batch.commit().then(function () {
      laden();
      ansagen('Akte „' + fall.titel + '“ ' + (vorhanden ? 'ersetzt.' : 'gespeichert.'));
    }, function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Speichern fehlgeschlagen: ' + esc(e.message) + '</p>';
    });
  }

  // ==========================================================
  // Auswertung (Etappe 4a)
  // Zeigt nur, was ohnehin gespeichert wird: erreichte Station,
  // gelöst, Lernzeit, Selbsteinschätzung bei Merkfragen und die
  // Auswahl in "Mein Eintrag". Keine Einzelantworten.
  // ==========================================================
  var STUFEN = ['auch so', 'teilweise', 'anders'];
  var gewaehlteAkte = null;

  function minuten(sek) {
    sek = Math.round(sek || 0);
    if (!sek) return '–';
    var m = Math.round(sek / 60);
    return m < 1 ? 'unter 1 min' : (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');
  }

  function aufgabenVon(fall, typ) {
    var raus = [];
    (fall.stationen || []).forEach(function (s) {
      (s.aufgaben || []).forEach(function (a) { if (a.typ === typ) raus.push(a); });
    });
    return raus;
  }

  function optionText(fall, a, wert) {
    var o = (a.optionen || []).filter(function (x) { return (x.id || x.karte) === wert; })[0];
    if (!o) return wert == null ? '–' : String(wert);
    if (o.karte) {
      var k = (fall.karten || []).filter(function (x) { return x.id === o.karte; })[0];
      return k ? k.titel : o.karte;
    }
    return o.text;
  }

  function auswertungInhalt(fall) {
    var n = (fall.stationen || []).length;
    var merk = aufgabenVon(fall, 'merken');
    var eintr = aufgabenVon(fall, 'eintrag');
    var geloest = 0, begonnen = 0, zeitGeloest = [];
    var zaehler = {};   // eintrag-id -> wert -> anzahl
    eintr.forEach(function (a) { zaehler[a.id] = {}; });

    var zeilen = kinder.map(function (k) {
      var st = k.stand || {};
      var e = (st.eintraege || {})[fall.id] || {};
      var stempel = (st.stempel || {})[fall.id];
      var zeit = (st.zeit || {})[fall.id] || 0;
      var stand;
      if (stempel) { geloest++; zeitGeloest.push(zeit); stand = 'gelöst am ' + new Date(stempel).toLocaleDateString('de-DE'); }
      else if (e.station || zeit) { begonnen++; stand = 'Station ' + Math.min((e.station || 0) + 1, n) + ' von ' + n; }
      else stand = 'noch nicht geöffnet';
      eintr.forEach(function (a) {
        var w = (e.eintrag || {})[a.id];
        if (w != null) zaehler[a.id][w] = (zaehler[a.id][w] || 0) + 1;
      });
      return '<tr><th scope="row">' + esc(k.vorname) + '</th>' +
        '<td>' + esc(stand) + '</td><td>' + esc(minuten(zeit)) + '</td>' +
        merk.map(function (a) {
          var s = (e.selbst || {})[a.id];
          return '<td>' + (s == null ? '–' : esc(STUFEN[s] || s)) + '</td>';
        }).join('') +
        eintr.map(function (a) { return '<td>' + esc(optionText(fall, a, (e.eintrag || {})[a.id])) + '</td>'; }).join('') +
      '</tr>';
    }).join('');

    var schnitt = zeitGeloest.length
      ? minuten(zeitGeloest.reduce(function (s, x) { return s + x; }, 0) / zeitGeloest.length) : '–';
    var zusammen = '<ul class="auswertung__zahlen">' +
      '<li><b>' + geloest + '</b> von ' + kinder.length + ' Kindern haben die Akte gelöst</li>' +
      '<li><b>' + begonnen + '</b> sind noch dabei</li>' +
      '<li>Lernzeit bis zum Lösen im Schnitt: <b>' + esc(schnitt) + '</b></li>' +
      eintr.map(function (a) {
        var z = zaehler[a.id], teile = Object.keys(z).sort(function (x, y) { return z[y] - z[x]; })
          .map(function (w) { return esc(optionText(fall, a, w)) + ': ' + z[w]; });
        return '<li>' + esc(a.frage) + ' ' + (teile.length ? teile.join(' · ') : '–') + '</li>';
      }).join('') +
    '</ul>';

    var kopf = '<tr><th scope="col">Vorname</th><th scope="col">Stand</th><th scope="col">Lernzeit</th>' +
      merk.map(function (a, i) {
        return '<th scope="col"><abbr title="' + esc(a.frage) + '">Merkfrage' + (merk.length > 1 ? ' ' + (i + 1) : '') + '</abbr></th>';
      }).join('') +
      eintr.map(function (a, i) {
        // Paket E: kurze Spaltenköpfe, voller Fragetext im title
        var kurz = (a.optionen && a.optionen[0] && a.optionen[0].karte) ? 'Bester Hinweis'
          : (/wie war/i.test(a.frage || '') ? 'Wie war der Fall?' : 'Eintrag ' + (i + 1));
        return '<th scope="col"><abbr title="' + esc(a.frage) + '">' + kurz + '</abbr></th>';
      }).join('') + '</tr>';

    return zusammen +
      '<div class="tabelle-rahmen"><table class="tabelle">' +
        '<caption class="unsichtbar">Auswertung „' + esc(fall.titel) + '“</caption>' +
        '<thead>' + kopf + '</thead><tbody>' +
        (zeilen || '<tr><td colspan="' + (3 + merk.length + eintr.length) + '">Noch keine Kinder.</td></tr>') +
      '</tbody></table></div>' +
      (merk.length ? '<p class="lhinweis">Merkfrage = Selbsteinschätzung des Kindes nach der Musterlösung ' +
        '(„auch so“, „teilweise“, „anders“). Sie wird nicht geprüft.</p>' : '');
  }

  function auswertungHtml() {
    if (!akten.length) {
      return '<section class="lkarte" aria-labelledby="t-auswertung"><h2 id="t-auswertung">Auswertung</h2>' +
        '<p>Noch keine Akten.</p></section>';
    }
    if (!gewaehlteAkte || !akten.some(function (a) { return a.id === gewaehlteAkte; })) gewaehlteAkte = akten[0].id;
    var fall = akten.filter(function (a) { return a.id === gewaehlteAkte; })[0];
    return '<section class="lkarte" aria-labelledby="t-auswertung">' +
      '<h2 id="t-auswertung">Auswertung</h2>' +
      (akten.length > 1
        ? '<label for="auswertung-akte">Akte</label><select id="auswertung-akte">' +
            akten.map(function (a) {
              return '<option value="' + esc(a.id) + '"' + (a.id === gewaehlteAkte ? ' selected' : '') + '>' +
                esc((a.nr ? a.nr + ' – ' : '') + a.titel) + '</option>';
            }).join('') + '</select>'
        : '<p class="lhinweis">Akte ' + esc(fall.nr || '') + ': <b>' + esc(fall.titel) + '</b></p>') +
      '<div id="auswertung-inhalt">' + auswertungInhalt(fall) + '</div>' +
    '</section>';
  }

  function auswertungBinden() {
    var s = el('auswertung-akte');
    if (!s) return;
    s.addEventListener('change', function () {
      gewaehlteAkte = s.value;
      var fall = akten.filter(function (a) { return a.id === gewaehlteAkte; })[0];
      el('auswertung-inhalt').innerHTML = auswertungInhalt(fall);
      ansagen('Auswertung für „' + fall.titel + '“.');
    });
  }

  // ==========================================================
  // Datenschutz (Etappe 4b): Auskunft, Löschen, Aufräumen,
  // Kind einzeln anlegen
  // ==========================================================
  var letzterDownload = null;   // für den Rauchtest

  function heute() { return new Date().toISOString().slice(0, 10); }
  function dateiname(s) { return String(s).replace(/[^\wäöüÄÖÜß-]+/g, '_'); }

  function herunterladen(name, daten) {
    var text = JSON.stringify(daten, null, 2);
    letzterDownload = { name: name, daten: daten };
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // Alles, was zu einem Kind gespeichert ist (Art. 15 und 20 DSGVO)
  function auskunftDaten(k) {
    var titel = {};
    akten.forEach(function (a) { titel[a.id] = a.titel; });
    return {
      art: 'Auskunft über gespeicherte Daten (Art. 15 DSGVO), Riff-Akten',
      erstellt: new Date().toISOString(),
      verantwortlich: 'Ingo H., Lehrkraft, setsna@gmail.com',
      hinweise: [
        'Gespeichert sind nur Vorname, Zugangscode und Lernstand. Keine Nachnamen, Fotos, Adressen oder Antworttexte.',
        'Für die Anmeldung gibt es bei Google Firebase ein Konto mit der Kennung ' +
          String(k.id).toLowerCase() + '@' + C.firebase.authDomain + ' (nur der Code, kein Name).',
        'Zeitangaben sind Millisekunden seit 1.1.1970 (UTC); Lernzeit in Sekunden.'
      ],
      kind: { vorname: k.vorname, code: fmtCode(k.id), freigeschaltet_am: k.angelegt ? new Date(k.angelegt).toISOString() : null },
      akten_titel: titel,
      lernstand: k.stand || null
    };
  }

  function auskunft(id) {
    var k = kinder.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    herunterladen('Auskunft-' + dateiname(k.vorname) + '-' + heute() + '.json', auskunftDaten(k));
    ansagen('Auskunft für ' + k.vorname + ' wurde heruntergeladen.');
  }

  // Kind und Fortschritt löschen (ohne Rückfrage, die steht davor)
  function kinderLoeschen(ids) {
    return Promise.all(ids.map(function (id) {
      return Promise.all([
        db.collection('kinder').doc(id).delete(),
        db.collection('fortschritt').doc(id).delete()
      ]);
    }));
  }

  var LOESCH_HINWEIS = ' Vorname, Code und Lernstand werden gelöscht und lassen sich nicht wiederherstellen ' +
    '(außer aus einer Sicherung). Der Aufkleber funktioniert danach nicht mehr.';

  function loeschen(id, knopf) {
    var k = kinder.filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    frage('Endgültig löschen?', k.vorname + ' (' + fmtCode(id) + ') endgültig löschen?' + LOESCH_HINWEIS,
      'Endgültig löschen', knopf).then(function (ja) {
      if (!ja) return;
      kinderLoeschen([id]).then(function () {
        laden();
        ansagen(k.vorname + ' wurde endgültig gelöscht.');
      }, function (e) { frage('Löschen fehlgeschlagen', e.message || String(e), 'OK'); });
    });
  }

  // ---------- Aufräumen: lange inaktive Kinder ----------
  function zuletztAktiv(k) { return (k.stand && k.stand.geaendert) || k.angelegt || 0; }

  function inaktiveSuchen() {
    var monate = Number(el('aufraeumen-monate').value) || 12;
    var grenze = Date.now() - monate * 30.44 * 86400000;
    var treffer = kinder.filter(function (k) { return zuletztAktiv(k) < grenze; });
    var erg = el('aufraeumen-ergebnis');
    if (!treffer.length) {
      erg.innerHTML = '<p class="lmeldung">Kein Kind war länger als ' + monate + ' Monate inaktiv.</p>';
      ansagen('Keine inaktiven Kinder.');
      return;
    }
    erg.innerHTML = '<p>' + treffer.length + (treffer.length === 1 ? ' Kind war' : ' Kinder waren') +
      ' länger als ' + monate + ' Monate nicht aktiv:</p><ul>' +
      treffer.map(function (k) { return '<li>' + esc(k.vorname) + ' (' + esc(fmtCode(k.id)) + ') – ' + esc(zuletzt(k)) + '</li>'; }).join('') +
      '</ul><button type="button" class="lknopf" id="aufraeumen-loeschen">Diese ' + treffer.length +
      (treffer.length === 1 ? ' Kind' : ' Kinder') + ' endgültig löschen</button>';
    ansagen(treffer.length + ' inaktive Kinder gefunden.');
    var b = el('aufraeumen-loeschen');
    b.addEventListener('click', function () {
      frage('Endgültig löschen?', treffer.length + (treffer.length === 1 ? ' Kind' : ' Kinder') +
        ' endgültig löschen: ' + treffer.map(function (k) { return k.vorname; }).join(', ') + '.' + LOESCH_HINWEIS,
        'Endgültig löschen', b).then(function (ja) {
        if (!ja) return;
        kinderLoeschen(treffer.map(function (k) { return k.id; })).then(function () {
          laden();
          ansagen(treffer.length + ' Kinder wurden gelöscht.');
        }, function (e) { frage('Löschen fehlgeschlagen', e.message || String(e), 'OK'); });
      });
    });
  }

  // ---------- Ein Kind einzeln anlegen ----------
  function neuerCode() {
    var A = C.code.alphabet, z = new Uint32Array(C.code.laenge), c;
    do {
      crypto.getRandomValues(z);
      c = Array.prototype.map.call(z, function (n) { return A[n % A.length]; }).join('');
    } while (kinder.some(function (k) { return k.id === c.toLowerCase(); }));
    return c;
  }

  function einzelnAnlegen() {
    var name = el('neu-vorname').value.trim();
    var erg = el('neu-ergebnis');
    if (!name || name.length > 40) {
      erg.innerHTML = '<p class="lmeldung fehler">Bitte einen Vornamen eingeben (höchstens 40 Zeichen).</p>';
      el('neu-vorname').focus();
      return;
    }
    var code = neuerCode();
    var link = location.href.replace(/lehrer\.html.*$/, '') + '#c=' + code;
    db.collection('kinder').doc(code.toLowerCase()).set({ vorname: name, angelegt: Date.now() }).then(function () {
      // laden() zeichnet alles neu; das Ergebnis danach wieder einblenden
      return laden().then(function () {
        var e2 = el('neu-ergebnis');
        if (!e2) return;
        e2.innerHTML = '<div class="lmeldung"><p><b>' + esc(name) + '</b> ist freigeschaltet.</p>' +
          '<p>Code: <b class="code">' + esc(fmtCode(code)) + '</b></p>' +
          '<p>Link: <code>' + esc(link) + '</code></p>' +
          '<p>Einen QR-Aufkleber erzeugst du mit <code>tools/qr_aufkleber.py</code>. ' +
          'Bis dahin kann das Kind den Code auch eintippen.</p></div>';
        ansagen(name + ' ist freigeschaltet. Code ' + fmtCode(code) + '.');
      });
    }, function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Speichern fehlgeschlagen: ' + esc(e.message) + '</p>';
    });
  }

  // ==========================================================
  // Sicherung (Etappe 4c)
  // Eine Datei mit allen Sammlungen. Wiederherstellen ergänzt
  // standardmäßig nur, was fehlt; Überschreiben nur auf Wunsch.
  // ==========================================================
  var SAMMLUNGEN = ['kinder', 'fortschritt', 'faelle', 'loesungen', 'einstellungen'];
  var wiederDaten = null;

  function sammlungLesen(name) {
    return db.collection(name).get().then(function (snap) {
      var raus = {};
      snap.forEach(function (d) { raus[d.id] = d.data(); });
      return raus;
    });
  }

  function sicherungErstellen(knopf) {
    knopf.disabled = true;
    var erg = el('sicherung-ergebnis');
    erg.innerHTML = '<p class="lmeldung">Sicherung wird erstellt …</p>';
    Promise.all(SAMMLUNGEN.map(sammlungLesen)).then(function (teile) {
      var daten = {};
      SAMMLUNGEN.forEach(function (n, i) { daten[n] = teile[i]; });
      var datei = {
        art: 'Riff-Akten Sicherung', format: 1, erstellt: new Date().toISOString(),
        hinweis: 'Enthält Vornamen, Zugangscodes, Lernstände und die Lösungen aller Akten. ' +
          'Sicher aufbewahren und nicht weitergeben.',
        daten: daten
      };
      herunterladen('Riff-Akten-Sicherung-' + heute() + '.json', datei);
      erg.innerHTML = '<p class="lmeldung">Sicherung heruntergeladen: ' + zaehlung(daten) + '.</p>';
      ansagen('Sicherung heruntergeladen.');
    }, function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Sicherung fehlgeschlagen: ' + esc(e.message) + '</p>';
    }).then(function () { knopf.disabled = false; });
  }

  function zaehlung(daten) {
    var n = function (s) { return Object.keys(daten[s] || {}).length; };
    return n('kinder') + ' Kinder, ' + n('fortschritt') + ' Lernstände, ' + n('faelle') + ' Akten, ' +
      n('loesungen') + ' Lösungen';
  }

  function sicherungPruefen(d) {
    if (!d || d.art !== 'Riff-Akten Sicherung' || d.format !== 1 || !d.daten || typeof d.daten !== 'object') {
      return 'Das ist keine Sicherung der Riff-Akten.';
    }
    var fremd = Object.keys(d.daten).filter(function (s) { return SAMMLUNGEN.indexOf(s) < 0; });
    if (fremd.length) return 'Unbekannte Bereiche in der Sicherung: ' + fremd.join(', ');
    var kaputt = null;
    SAMMLUNGEN.forEach(function (s) {
      var teil = d.daten[s] || {};
      if (typeof teil !== 'object' || Array.isArray(teil)) kaputt = s;
      Object.keys(teil).forEach(function (id) {
        if (!/^[a-z0-9-]{1,40}$/.test(id) || !teil[id] || typeof teil[id] !== 'object') kaputt = s + '/' + id;
      });
    });
    return kaputt ? 'Fehlerhafter Eintrag in der Sicherung: ' + kaputt : null;
  }

  function wiederLesen(text) {
    var erg = el('wieder-ergebnis'), d;
    wiederDaten = null;
    el('wieder-start').disabled = true;
    try { d = JSON.parse(text); } catch (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Die Datei konnte nicht gelesen werden: ' + esc(e.message) + '</p>';
      return;
    }
    var f = sicherungPruefen(d);
    if (f) { erg.innerHTML = '<p class="lmeldung fehler">' + esc(f) + '</p>'; return; }
    wiederDaten = d;
    erg.innerHTML = '<p class="lmeldung">Sicherung vom ' + esc(new Date(d.erstellt).toLocaleString('de-DE')) +
      ': ' + zaehlung(d.daten) + '.</p>';
    el('wieder-start').disabled = false;
    ansagen('Sicherung gelesen. Jetzt „Wiederherstellen“ wählen.');
  }

  function wiederherstellen(knopf) {
    if (!wiederDaten) return;
    var ueber = el('wieder-ueberschreiben').checked;
    var erg = el('wieder-ergebnis');
    // Was steht schon in der Datenbank?
    Promise.all(SAMMLUNGEN.map(sammlungLesen)).then(function (jetzt) {
      var schreiben = [], uebersprungen = 0;
      SAMMLUNGEN.forEach(function (s, i) {
        var teil = wiederDaten.daten[s] || {};
        Object.keys(teil).forEach(function (id) {
          if (jetzt[i][id] && !ueber) { uebersprungen++; return; }
          schreiben.push({ s: s, id: id, d: teil[id] });
        });
      });
      if (!schreiben.length) {
        erg.innerHTML = '<p class="lmeldung">Nichts zu tun: Alle ' + uebersprungen +
          ' Einträge sind schon vorhanden. Zum Überschreiben das Kästchen ankreuzen.</p>';
        return null;
      }
      return frage('Wiederherstellen?',
        schreiben.length + ' Einträge werden ' + (ueber ? 'geschrieben; vorhandene werden überschrieben' :
          'ergänzt; ' + uebersprungen + ' vorhandene bleiben unverändert') + '. Gelöscht wird nichts.',
        'Wiederherstellen', knopf).then(function (ja) {
        if (!ja) return null;
        erg.innerHTML = '<p class="lmeldung">Wird wiederhergestellt …</p>';
        // Firestore erlaubt höchstens 500 Schreibvorgänge je Batch
        var stuecke = [];
        for (var i = 0; i < schreiben.length; i += 400) stuecke.push(schreiben.slice(i, i + 400));
        return stuecke.reduce(function (p, stueck) {
          return p.then(function () {
            var b = db.batch();
            stueck.forEach(function (w) { b.set(db.collection(w.s).doc(w.id), w.d); });
            return b.commit();
          });
        }, Promise.resolve()).then(function () {
          return laden().then(function () {
            var e2 = el('wieder-ergebnis');
            if (e2) e2.innerHTML = '<p class="lmeldung">' + schreiben.length + ' Einträge wiederhergestellt.</p>';
            ansagen(schreiben.length + ' Einträge wiederhergestellt.');
          });
        });
      });
    }).catch(function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Wiederherstellen fehlgeschlagen: ' + esc(e.message || e) + '</p>';
    });
  }

  // ==========================================================
  // Akten verwalten (Etappe 4d)
  // ==========================================================
  function akteVon(id) { return akten.filter(function (a) { return a.id === id; })[0]; }

  function akteSichtbar(id, knopf) {
    var a = akteVon(id);
    if (!a) return;
    var neu = a.aktiv === false;
    knopf.disabled = true;
    db.collection('faelle').doc(id).set({ aktiv: neu }, { merge: true }).then(function () {
      return laden();
    }).then(function () {
      ansagen('„' + a.titel + '“ ist jetzt ' + (neu ? 'für die Kinder sichtbar.' : 'ausgeblendet.'));
      var b = document.querySelector('[data-akte-sichtbar="' + id + '"]');
      if (b) b.focus();
    }, function (e) {
      knopf.disabled = false;
      frage('Ändern fehlgeschlagen', e.message || String(e), 'OK', knopf);
    });
  }

  // Im selben Format wie beim Hochladen: { id, fall, loesung }
  function akteHerunterladen(id, knopf) {
    var a = akteVon(id);
    if (!a) return;
    db.collection('loesungen').doc(id).get().then(function (s) {
      var fall = JSON.parse(JSON.stringify(a));
      delete fall.id;
      herunterladen('Akte-' + dateiname(id) + '-' + heute() + '.json',
        { id: id, fall: fall, loesung: s.exists ? s.data() : { aufgaben: {} } });
      ansagen('Akte „' + a.titel + '“ heruntergeladen.');
    }, function (e) { frage('Herunterladen fehlgeschlagen', e.message || String(e), 'OK', knopf); });
  }

  function akteLoeschen(id, knopf) {
    var a = akteVon(id);
    if (!a) return;
    frage('Akte löschen?', '„' + a.titel + '“ und ihre Lösungen werden gelöscht. Die Kinder sehen die Akte ' +
      'danach nicht mehr. Stempel und Lernzeit in den Detektivbüchern bleiben erhalten. Tipp: Vorher ' +
      '„Herunterladen“, dann kannst du die Akte später wieder hochladen.', 'Akte löschen', knopf)
      .then(function (ja) {
        if (!ja) return;
        Promise.all([db.collection('faelle').doc(id).delete(), db.collection('loesungen').doc(id).delete()])
          .then(function () { laden(); ansagen('Akte „' + a.titel + '“ gelöscht.'); },
                function (e) { frage('Löschen fehlgeschlagen', e.message || String(e), 'OK'); });
      });
  }

  // Testhilfe für den Rauchtest
  window.RA.lehrer = { frage: frage, letzterDownload: function () { return letzterDownload; } };
})();
