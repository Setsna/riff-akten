/* ==========================================================
   Riff-Akten – Kinder-App: Ansichten

   Etappe 1: Laden, Anmelden, Startseite, Speicherleiste.
   Jede Ansicht hat genau ein h1. Alles Anklickbare ist ein button
   oder a. Rückmeldungen gehen zusätzlich in den aria-live-Bereich.

   Gestaltung nach der Lernlagune (Lernlagune/DESIGN.md): gemalter
   Grund, Lichtschacht, Glasfenster, Navy und Weiß.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var C = RA.config;
  var appEl = document.getElementById('app');
  var liveEl = document.getElementById('live');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Für Screenreader ansagen. Leeren und neu setzen, damit auch
  // derselbe Satz zweimal hintereinander gelesen wird.
  function ansagen(text) {
    liveEl.textContent = '';
    setTimeout(function () { liveEl.textContent = text; }, 50);
  }

  // ---------- Bausteine ----------
  // Klaro, der Einsiedlerkrebs (Canva). Schmückend: Sein Name steht
  // immer im Text daneben, deshalb leeres alt.
  function klaro(klasse) {
    return '<img class="klaro ' + (klasse || '') + '" src="bilder/klaro.webp?v=6" alt="" width="600" height="542">';
  }

  // Wortmarke oben mittig (kein h1: das h1 steht im Inhalt).
  // Statt der Welle der Lernlagune eine kleine Lupe als eigenes Zeichen.
  function kopf(zusatz) {
    return '<header class="kopf">' + (zusatz || '') +
      '<p class="wortmarke">Riff-Akten</p>' +
      '<svg class="lupe" viewBox="0 0 40 16" aria-hidden="true" focusable="false">' +
        '<circle cx="15" cy="8" r="5.5"></circle><path d="M19 12l5 3.2M1 8h7M30 8h9"></path></svg>' +
      '</header>';
  }

  function fusszeile() {
    return '<footer class="fuss">' +
      '<a href="datenschutz.html">Datenschutz</a>' +
      '<a href="impressum.html">Impressum</a>' +
      '</footer>';
  }

  function zeigen(html, fokusSel) {
    appEl.innerHTML = html + fusszeile();
    var f = fokusSel && appEl.querySelector(fokusSel);
    if (!f) f = appEl.querySelector('h1');
    if (f) { if (f.tagName === 'H1') f.setAttribute('tabindex', '-1'); f.focus(); }
  }

  // ---------- Ansicht: Laden ----------
  function laden() {
    appEl.innerHTML = kopf() +
      '<main class="inhalt">' +
        '<h1 class="frage">Einen Moment …</h1>' +
        '<p class="hinweis">' + esc(C.maskottchen.name) + ' sucht deine Akten.</p>' +
      '</main>';
  }

  // ---------- Ansicht: Anmelden ----------
  function anmelden(meldung) {
    zeigen(kopf() +
      '<main class="inhalt">' +
        '<h1 class="frage">Wer ermittelt heute?</h1>' +
        '<p class="hinweis">Scanne den QR-Code auf deinem Aufkleber.<br>Oder tippe deinen Code ein.</p>' +
        '<div class="fenster fenster--eingang">' +
          klaro('klaro--fenster') +
          '<form id="anmeldung" class="anmeldung" novalidate>' +
            '<label for="code">Dein Code</label>' +
            '<input id="code" name="code" autocomplete="off" autocapitalize="characters" ' +
              'autocorrect="off" spellcheck="false" inputmode="text" maxlength="12" ' +
              'aria-describedby="code-hilfe' + (meldung ? ' code-fehler' : '') + '">' +
            '<p id="code-hilfe" class="klein">8 Zeichen, zum Beispiel K7PM 4XRT</p>' +
            '<p id="code-fehler" class="meldung fehler" role="alert"' + (meldung ? '' : ' hidden') + '>' +
              esc(meldung || '') + '</p>' +
            '<button type="submit" class="knopf"><span class="knopf__text">Los geht’s</span>' +
              '<svg class="knopf__pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
              '<path d="M5 12h13M13 6l6 6-6 6"></path></svg></button>' +
          '</form>' +
        '</div>' +
      '</main>',
      meldung ? '#code' : null
    );

    var form = document.getElementById('anmeldung');
    var feld = document.getElementById('code');
    var fehlerEl = document.getElementById('code-fehler');
    var knopf = form.querySelector('button');
    var knopfText = knopf.querySelector('.knopf__text');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      knopf.disabled = true;
      knopfText.textContent = 'Einen Moment …';
      fehlerEl.hidden = true;
      ansagen('Anmeldung läuft.');
      RA.cloud.anmelden(feld.value).then(function () {
        weg();
      }, function (text) {
        knopf.disabled = false;
        knopfText.textContent = 'Los geht’s';
        fehlerEl.textContent = text;
        fehlerEl.hidden = false;
        feld.setAttribute('aria-describedby', 'code-hilfe code-fehler');
        feld.focus();
      });
    });
  }

  // ---------- Ansicht: ohne Datenbank ----------
  function offline() {
    zeigen(kopf() +
      '<main class="inhalt">' +
        '<h1 class="frage">Kein Netz</h1>' +
        '<p class="hinweis">Gerade gibt es keine Verbindung zum Akten-Archiv.<br>' +
          'Prüfe, ob das Gerät mit dem Internet verbunden ist.</p>' +
        '<div class="fenster fenster--eingang">' + klaro('klaro--fenster') +
          '<button type="button" class="knopf" id="neu-laden"><span class="knopf__text">Noch einmal versuchen</span></button>' +
        '</div>' +
      '</main>'
    );
    document.getElementById('neu-laden').addEventListener('click', function () { location.reload(); });
  }

  // ---------- Ansicht: Startseite ----------
  function startseite() {
    var k = RA.cloud.kind();
    var name = esc(k.vorname);
    var wer =
      '<div class="wer">' +
        '<p class="wer__name">Angemeldet: <b>' + name + '</b></p>' +
        '<button type="button" class="wer__knopf" id="nicht-ich">Ich bin nicht ' + name + '</button>' +
      '</div>';
    zeigen(kopf(wer) +
      '<main class="inhalt">' +
        '<h1 class="frage">Hallo, ' + name + '!</h1>' +
        '<p class="hinweis">Ich bin ' + esc(C.maskottchen.name) + ', der Riff-Detektiv.<br>' +
          'Zusammen lösen wir knifflige Fälle.</p>' +
        '<div class="buehne">' + klaro('klaro--start') +
        '<section class="akten" aria-labelledby="akten-titel">' +
          '<h2 id="akten-titel" class="akten__titel">Deine Akten</h2>' +
          '<ul class="akten__liste">' +
            '<li class="fenster fenster--bald">' +
              '<svg class="fenster__schloss" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<rect x="5" y="10.5" width="14" height="10" rx="2.5"></rect>' +
                '<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5"></path></svg>' +
              '<p class="fenster__text">Die erste Akte –<br>taucht bald auf</p>' +
            '</li>' +
          '</ul>' +
          '<a class="fenster fenster--buch" href="#buch">' +
            '<svg class="fenster__buch" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
              '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path>' +
              '<path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"></path><circle cx="12" cy="10" r="3"></circle>' +
              '<path d="M14.2 12.2l2.3 2.3"></path></svg>' +
            '<span class="fenster__text">Mein Detektivbuch</span>' +
          '</a>' +
        '</section></div>' +
      '</main>'
    );
    document.getElementById('nicht-ich').addEventListener('click', function () {
      this.disabled = true;
      if (RA.uhr) RA.uhr.stopp();
      RA.cloud.abmelden().then(function () { anmelden(); }, function () { anmelden(); });
    });
  }

  // ---------- Speicherleiste (in jeder Ansicht) ----------
  var leiste = document.getElementById('speicherleiste');
  RA.cloud.onSpeicher(function (sp) {
    if (sp.zustand === 'fehler') {
      leiste.className = 'speicherleiste fehler';
      leiste.textContent = 'Speichern hat nicht geklappt. Bitte sag deiner Lehrkraft Bescheid.';
      leiste.hidden = false;
      ansagen(leiste.textContent);
    } else if (sp.zustand === 'wartet-lange') {
      leiste.className = 'speicherleiste wartet';
      leiste.textContent = 'Gerade kein Internet. Dein Fortschritt ist auf diesem Gerät sicher und wird später gespeichert.';
      leiste.hidden = false;
    } else {
      leiste.hidden = true;
    }
  });

  // ---------- Echte Fensterbreite für den Maßstab --s ----------
  // 100vw zählt unter Windows die Scrollleiste mit; dann entstünde ein
  // waagrechter Scrollbalken (Lösung wie in Lernlagune/js/lagune.js).
  function breiteSetzen() {
    document.documentElement.style.setProperty('--breite', document.documentElement.clientWidth + 'px');
  }
  breiteSetzen();
  window.addEventListener('resize', breiteSetzen);

  // ---------- Bewegung pausieren, wenn die Seite nicht sichtbar ist ----------
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('ruht', document.hidden);
  });

  // ---------- Wege: #buch = Detektivbuch, sonst Startseite ----------
  // Über den Hash, damit auch die Zurück-Geste des iPads funktioniert.
  function weg() {
    if (!RA.cloud.angemeldet()) return;
    if (location.hash === '#buch' && RA.buch) RA.buch.zeigen();
    else startseite();
  }
  window.addEventListener('hashchange', weg);
  // Interne Links (#buch, #) nur den Hash setzen lassen. Sonst würde ein
  // <base href> (lokale Vorschau) daraus einen Seitenwechsel machen.
  appEl.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    ev.preventDefault();
    var ziel = a.getAttribute('href').slice(1);
    if (location.hash.slice(1) === ziel) weg();
    else location.hash = ziel;
  });

  // Bausteine für andere Ansichten (js/buch.js)
  RA.ui = { esc: esc, ansagen: ansagen, kopf: kopf, zeigen: zeigen, klaro: klaro };

  // ---------- Los ----------
  laden();
  RA.cloud.start(function (zustand) {
    if (zustand === 'angemeldet') weg();
    else if (zustand === 'offline') offline();
    else anmelden(RA.cloud.fehler());
  });

  RA.app = { startseite: startseite, anmelden: anmelden, weg: weg };
})();
