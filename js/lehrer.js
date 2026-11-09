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
    auswertungBinden();
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
      eintr.map(function (a) { return '<th scope="col">' + esc(a.frage) + '</th>'; }).join('') + '</tr>';

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

  // Testhilfe für den Rauchtest
  window.RA.lehrer = { frage: frage };
})();
