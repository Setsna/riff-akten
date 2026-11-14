/* ==========================================================
   Riff-Akten – Lehrerbereich

   Seit dem Konto-Umbau (14.11.2026) nutzen die Riff-Akten das
   Firebase-Projekt und die Kinderliste des Perlentauchers.
   Hier bleiben:
   - Anmeldung mit Google. Ob jemand Lehrkraft ist, entscheiden
     allein die Firestore-Regeln (istLehrer()).
   - Kinderliste (nur lesen): Vorname, Code, zuletzt in den Riff-Akten.
   - Auswertung je Akte.
   - Akten hochladen, ein- und ausblenden, als Fall-Datei
     herunterladen, löschen (ra_faelle, ra_loesungen).
   Kinder anlegen, löschen, Auskunft, Sicherung und "Riff-Akten
   zurücksetzen" laufen im Lehrerbereich des Perlentauchers: Ein
   Löschen in "kinder" träfe dort auch den Perlentaucher.
   ========================================================== */
(function () {
  'use strict';

  var C = window.RA.config;
  var appEl = document.getElementById('app');
  var liveEl = document.getElementById('live');
  var auth = null, db = null, nutzer = null;
  var kinder = [];
  var akten = [];
  var SA = C.sammlung;
  // Kinderkonten melden sich mit <code>@<authDomain> an: keine Lehrkraft
  var KINDERKONTO = new RegExp('@' + C.firebase.authDomain.replace(/[.]/g, '[.]') + '$', 'i');

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
    if (!u || !u.email || KINDERKONTO.test(u.email)) { anmeldung(); return; }
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
    return db.collection(SA.kinder).get().then(function (snap) {
      kinder = [];
      snap.forEach(function (d) { kinder.push(Object.assign({ id: d.id }, d.data())); });
      kinder.sort(function (a, b) { return String(a.vorname).localeCompare(String(b.vorname), 'de'); });
      return Promise.all(kinder.map(function (k) {
        return db.collection(SA.stand).doc(k.id).get()
          .then(function (f) { k.stand = f.exists ? f.data() : null; })
          .catch(function () { k.stand = null; });
      }));
    }).then(function () {
      return db.collection(SA.faelle).get().then(function (snap) {
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
    if (!t) return 'noch nie';
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
        '</tr>';
    }).join('');

    zeigen(kopf() +
      '<section class="lkarte" aria-labelledby="t-kinder">' +
        '<h2 id="t-kinder">Kinder (' + kinder.length + ')</h2>' +
        '<p class="lhinweis">Die Riff-Akten nutzen die Kinderliste des Perlentauchers: dieselben Codes, ' +
          'dieselben Aufkleber. <b>Kinder anlegen, löschen, Auskunft, Sicherung und Zurücksetzen</b> ' +
          'gehen im <b>Lehrerbereich des Perlentauchers</b>. Hier kannst du die Liste nur ansehen.</p>' +
        '<div class="tabelle-rahmen"><table class="tabelle">' +
          '<caption class="unsichtbar">Kinder</caption>' +
          '<thead><tr><th scope="col">Vorname</th><th scope="col">Code</th>' +
          '<th scope="col">Zuletzt in den Riff-Akten</th></tr></thead>' +
          '<tbody>' + (zeilen || '<tr><td colspan="3">Noch keine Kinder. Sie werden im Perlentaucher angelegt.</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</section>' +

      auswertungHtml() +

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
          'ersetzt; der Fortschritt der Kinder bleibt. Gespeichert wird in <code>ra_faelle</code> und ' +
          '<code>ra_loesungen</code> im Projekt des Perlentauchers.</p>' +
        '<label class="ldatei" for="akte-datei">Fall-Datei wählen</label>' +
        '<input type="file" id="akte-datei" accept=".json,application/json">' +
        '<label for="akte-json">Inhalt der Fall-Datei</label>' +
        '<textarea id="akte-json" rows="5" spellcheck="false"></textarea>' +
        '<button type="button" class="lknopf" id="akte-hochladen">Akte prüfen und hochladen</button>' +
        '<div id="akte-ergebnis" aria-live="polite"></div>' +
      '</section>');

    bindeKopf();
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
      batch.set(db.collection(SA.faelle).doc(d.id), fall);
      batch.set(db.collection(SA.loesungen).doc(d.id), d.loesung);
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

  // ---------- Dateien herunterladen ----------
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

  // ==========================================================
  // Akten verwalten (Etappe 4d)
  // ==========================================================
  function akteVon(id) { return akten.filter(function (a) { return a.id === id; })[0]; }

  function akteSichtbar(id, knopf) {
    var a = akteVon(id);
    if (!a) return;
    var neu = a.aktiv === false;
    knopf.disabled = true;
    db.collection(SA.faelle).doc(id).set({ aktiv: neu }, { merge: true }).then(function () {
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
    db.collection(SA.loesungen).doc(id).get().then(function (s) {
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
        Promise.all([db.collection(SA.faelle).doc(id).delete(), db.collection(SA.loesungen).doc(id).delete()])
          .then(function () { laden(); ansagen('Akte „' + a.titel + '“ gelöscht.'); },
                function (e) { frage('Löschen fehlgeschlagen', e.message || String(e), 'OK'); });
      });
  }

  // Testhilfe für den Rauchtest
  window.RA.lehrer = { frage: frage, letzterDownload: function () { return letzterDownload; } };
})();
