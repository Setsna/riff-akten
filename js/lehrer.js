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

   Auskunft, Löschen, Aufräumen, Auswertung und Sicherung kommen in
   Etappe 4.
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
    db.collection('kinder').get().then(function (snap) {
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
        '<td><button type="button" class="lknopf leise klein" data-sperren="' + esc(k.id) + '" ' +
          'aria-label="Zugang von ' + esc(k.vorname) + ' sperren">Sperren</button></td></tr>';
    }).join('');

    zeigen(kopf() +
      '<section class="lkarte" aria-labelledby="t-kinder">' +
        '<h2 id="t-kinder">Freigeschaltete Kinder (' + kinder.length + ')</h2>' +
        '<p class="lhinweis"><b>Sperren</b> macht nur den Aufkleber unbrauchbar. Der Fortschritt bleibt ' +
          'gespeichert und ist wieder da, wenn du denselben Code erneut freischaltest. ' +
          'Endgültiges Löschen und Auskunft kommen später.</p>' +
        '<div class="tabelle-rahmen"><table class="tabelle">' +
          '<caption class="unsichtbar">Freigeschaltete Kinder</caption>' +
          '<thead><tr><th scope="col">Vorname</th><th scope="col">Code</th><th scope="col">Zuletzt aktiv</th>' +
          '<th scope="col"><span class="unsichtbar">Aktion</span></th></tr></thead>' +
          '<tbody>' + (zeilen || '<tr><td colspan="4">Noch keine Kinder freigeschaltet.</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</section>' +

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

      '<section class="lkarte" aria-labelledby="t-akten">' +
        '<h2 id="t-akten">Akten (' + akten.length + ')</h2>' +
        '<div class="tabelle-rahmen"><table class="tabelle">' +
          '<caption class="unsichtbar">Vorhandene Akten</caption>' +
          '<thead><tr><th scope="col">Nr.</th><th scope="col">Titel</th><th scope="col">Kennung</th>' +
          '<th scope="col">Klasse</th><th scope="col">Sichtbar</th></tr></thead>' +
          '<tbody>' + (akten.map(function (a) {
            return '<tr><td>' + esc(a.nr || '') + '</td><th scope="row">' + esc(a.titel) + '</th>' +
              '<td class="code">' + esc(a.id) + '</td><td>' + esc(a.klasse || '') + '</td>' +
              '<td>' + (a.aktiv === false ? 'nein' : 'ja') + '</td></tr>';
          }).join('') || '<tr><td colspan="5">Noch keine Akten.</td></tr>') + '</tbody>' +
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-sperren]'), function (b) {
      b.addEventListener('click', function () { sperren(b.getAttribute('data-sperren'), b); });
    });
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
    var batch = db.batch();
    batch.set(db.collection('faelle').doc(d.id), fall);
    batch.set(db.collection('loesungen').doc(d.id), d.loesung);
    batch.commit().then(function () {
      laden();
      ansagen('Akte „' + fall.titel + '“ ' + (vorhanden ? 'ersetzt.' : 'gespeichert.'));
    }, function (e) {
      erg.innerHTML = '<p class="lmeldung fehler">Speichern fehlgeschlagen: ' + esc(e.message) + '</p>';
    });
  }

  // Testhilfe für den Rauchtest
  window.RA.lehrer = { frage: frage };
})();
