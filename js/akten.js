/* ==========================================================
   Riff-Akten – Akten (Etappe 3)

   Ein Fall besteht aus Daten, nicht aus Code (Format: siehe
   tools/test/demo-fall.js). Zwei Dokumente in Firestore:
     faelle/<id>      Geschichte, Hinweiskarten, Stationen, Aufgaben
     loesungen/<id>   richtige Antworten und Erklärungen
   Die Lösung wird erst geladen, wenn ein Kind auf "Prüfen" tippt.
   Grenze (bewusst, siehe projektstand.md): Wer am PC die
   Entwicklerwerkzeuge öffnet, sieht die geladene Lösung.

   Wege:  #akte/<id>      Akte, zuletzt erreichte Station
          #akte/<id>/<n>  Station n (1 … 6)

   Keine Punkte, kein Zeitdruck. Nach jeder Antwort kommt eine
   Erklärung, auch wenn sie richtig war.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var faelle = {};       // id -> Fall (Zwischenspeicher)
  var loesungen = {};    // id -> Lösung
  var listeGeladen = null;

  function esc(s) { return RA.ui.esc(s); }
  // **fett** erlaubt, sonst reiner Text
  function txt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function absaetze(s) {
    return String(s || '').split('\n').filter(Boolean).map(function (z) { return '<p>' + txt(z) + '</p>'; }).join('');
  }

  // ==========================================================
  // Daten
  // ==========================================================
  function liste() {
    if (!listeGeladen) {
      listeGeladen = RA.cloud.liste('faelle').then(function (l) {
        l.forEach(function (f) { faelle[f.id] = f; });
        return l.filter(function (f) { return f.aktiv !== false; })
          .sort(function (a, b) { return (a.nr || 99) - (b.nr || 99); });
      }, function (e) { listeGeladen = null; throw e; });
    }
    return listeGeladen;
  }

  function fallHolen(id) {
    if (faelle[id]) return Promise.resolve(faelle[id]);
    return RA.cloud.lesen('faelle', id).then(function (f) {
      if (f) { f.id = id; faelle[id] = f; }
      return f;
    });
  }

  function loesungHolen(id) {
    if (loesungen[id]) return Promise.resolve(loesungen[id]);
    return RA.cloud.lesen('loesungen', id).then(function (l) {
      if (!l) throw new Error('Lösung fehlt');
      loesungen[id] = l;
      return l;
    });
  }

  function titel(id) { return faelle[id] && faelle[id].titel; }

  function karteVon(fall, kid) {
    for (var i = 0; i < (fall.karten || []).length; i++) if (fall.karten[i].id === kid) return fall.karten[i];
    return null;
  }

  // ==========================================================
  // Startseite: Liste der Akten
  // ==========================================================
  var SCHLOSS = '<svg class="fenster__schloss" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect x="5" y="10.5" width="14" height="10" rx="2.5"></rect>' +
    '<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5"></path></svg>';
  var LUPE = '<svg class="fenster__lupe" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5L20 20"></path></svg>';

  function bald() {
    return '<li class="fenster fenster--bald">' + SCHLOSS +
      '<p class="fenster__text">Die nächste Akte –<br>taucht bald auf</p></li>';
  }

  function listeFuellen(ul) {
    liste().then(function (l) {
      if (!ul.isConnected) return;
      var s = RA.store.snapshot();
      ul.innerHTML = l.map(function (f) {
        var geloest = !!s.stempel[f.id];
        return '<li><a class="fenster fenster--akte' + (geloest ? ' ist-geloest' : '') + '" href="#akte/' + esc(f.id) + '">' +
          (f.bild ? '<img class="fenster__bild" src="' + esc(f.bild) + '?v=20" alt="" width="480" height="480">'
                  : '<span class="fenster__ohnebild">' + LUPE + '</span>') +
          '<span class="fenster__unten">' +
            '<span class="fenster__nr">Akte ' + esc(f.nr || '') + '</span>' +
            '<span class="fenster__titel">' + esc(f.titel) + '</span>' +
          '</span>' +
          (geloest ? '<span class="fenster__status">gelöst</span>' : '') +
        '</a></li>';
      }).join('') + bald();
    }, function () {
      // Ohne Netz und ohne Zwischenspeicher: Platzhalter bleibt stehen
    });
  }

  // Hinweise für Lehrkräfte je Akte (Startseite, Bereich für Erwachsene)
  var SCHWIERIG = { 1: 'leicht', 2: 'mittel', 3: 'schwer' };
  function lehrkraftFuellen(el) {
    if (!el) return;
    liste().then(function (l) {
      if (!el.isConnected) return;
      if (!l.length) { el.innerHTML = '<p>Noch keine Akten freigegeben.</p>'; return; }
      el.innerHTML = l.map(function (f) {
        var lk = f.lehrkraft || {};
        var steck = [f.fach, f.klasse ? 'Klasse ' + f.klasse : '', SCHWIERIG[f.schwierigkeit] ? 'Schwierigkeit: ' + SCHWIERIG[f.schwierigkeit] : '',
          lk.dauer ? 'Dauer: ' + lk.dauer : ''].filter(Boolean).map(esc).join(' · ');
        return '<div class="lehrkraft__akte">' +
          '<h3>Akte ' + esc(f.nr || '') + ': ' + esc(f.titel) + '</h3>' +
          (steck ? '<p class="lehrkraft__steck">' + steck + '</p>' : '') +
          (lk.lehrplan && lk.lehrplan.length
            ? '<p><b>Lehrplanbezug</b></p><ul>' + lk.lehrplan.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul>' : '') +
          (lk.material ? '<p><b>Material für „Am Tisch“:</b> ' + esc(lk.material) + '</p>' : '') +
          (lk.hinweise && lk.hinweise.length
            ? '<p><b>Hinweise</b></p><ul>' + lk.hinweise.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul>' : '') +
          (f.lehrkraft ? '' : '<p>Hinweise zu dieser Akte folgen.</p>') +
        '</div>';
      }).join('');
    }, function () {
      if (el.isConnected) el.innerHTML = '<p>Die Hinweise laden gerade nicht.</p>';
    });
  }

  // ==========================================================
  // Bausteine
  // ==========================================================
  function karteHtml(k) {
    if (!k) return '';
    var inhalt = '';
    if (k.tabelle) {
      inhalt += '<table class="karte__tabelle"><thead><tr>' +
        k.tabelle.kopf.map(function (z) { return '<th scope="col">' + txt(z) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        k.tabelle.zeilen.map(function (r) {
          return '<tr>' + (r.zellen || []).map(function (z) { return '<td>' + txt(z) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    if (k.audio) {
      inhalt += '<audio class="karte__ton" controls preload="none" src="' + esc(k.audio) + '?v=20"></audio>' +
        (k.text ? '<details class="karte__mitlesen"><summary>Text zum Mitlesen</summary>' + absaetze(k.text) + '</details>' : '');
    } else if (k.text) {
      inhalt += absaetze(k.text);
    }
    return '<div class="karte' + (k.audio ? ' karte--hoeren' : '') + '">' +
      '<p class="karte__titel">' + (k.audio ? '<span class="karte__art">Hörkarte</span> ' : '') + txt(k.titel || '') + '</p>' +
      inhalt + '</div>';
  }

  function geschichteHtml(fall) {
    return '<div class="akte__geschichte">' + (fall.geschichte || []).map(function (b) {
      if (b.liste) return '<ul>' + b.liste.map(function (p) { return '<li>' + txt(p) + '</li>'; }).join('') + '</ul>';
      if (b.bild) {
        return '<figure class="akte__bild"><img src="' + esc(b.bild) + '?v=20" alt="' + esc(b.alt || '') + '" ' +
          'width="960" height="640" loading="lazy"></figure>';
      }
      return '<p>' + txt(b.absatz) + '</p>';
    }).join('') + '</div>';
  }

  function frageHtml(fall) {
    return '<div class="akte__frage"><p class="akte__frage-titel">Die Detektivfrage</p><p>' + txt(fall.frage) + '</p></div>';
  }

  function optionText(fall, o) {
    if (o.karte) { var k = karteVon(fall, o.karte); return k ? k.titel : o.karte; }
    return o.text;
  }
  function optionId(o) { return o.id || o.karte; }

  // ==========================================================
  // Ansicht: eine Akte, eine Station
  // ==========================================================
  var aktuell = null;   // { fall, n, offen: Anzahl ungeprüfter Pflichtaufgaben }

  function zeigen(id, nWunsch) {
    fallHolen(id).then(function (fall) {
      if (!fall || fall.aktiv === false) return fehlt();   // ausgeblendet = für Kinder nicht da
      stationZeigen(fall, nWunsch);
    }, function () { fehlt(); });
  }

  function fehlt() {
    RA.ui.zeigen(RA.ui.kopf(zurueckLink()) +
      '<main class="inhalt"><h1 class="frage">Akte nicht gefunden</h1>' +
      '<p class="hinweis">Vielleicht fehlt gerade das Internet. Versuche es gleich noch einmal.</p></main>');
  }

  function zurueckLink() {
    return '<a class="zurueck" href="#">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H6M11 6l-6 6 6 6"></path></svg>' +
      'Zu den Akten</a>';
  }

  function stationZeigen(fall, nWunsch) {
    var st = fall.stationen || [];
    var e = RA.store.snapshot().eintraege[fall.id] || {};
    var erreicht = Math.min(e.station || 0, st.length - 1);
    var geloest = !!RA.store.snapshot().stempel[fall.id];
    var n = (typeof nWunsch === 'number' && nWunsch >= 0) ? Math.min(nWunsch, erreicht) : (geloest ? 0 : erreicht);
    var station = st[n];
    var geschafft = (e.station || 0) > n;   // schon einmal abgeschlossen

    var nav = '<nav class="stationen" aria-label="Stationen dieser Akte"><ol>' + st.map(function (s, i) {
      var name = '<span class="stationen__nr">' + (i + 1) + '</span> <span class="stationen__name">' + esc(s.titel) + '</span>';
      if (i === n) return '<li><span class="stationen__punkt ist-hier" aria-current="step">' + name + '</span></li>';
      if (i <= erreicht) return '<li><a class="stationen__punkt" href="#akte/' + esc(fall.id) + '/' + (i + 1) + '">' + name + '</a></li>';
      return '<li><span class="stationen__punkt ist-zu">' + name + '<span class="unsichtbar"> (noch nicht erreicht)</span></span></li>';
    }).join('') + '</ol></nav>';

    var zeige = station.zeige || [];
    var oben = '';
    if (zeige.indexOf('geschichte') >= 0) oben += geschichteHtml(fall);
    else oben += '<details class="akte__nachlesen"><summary>Fallakte noch einmal lesen</summary>' + geschichteHtml(fall) + '</details>';
    if (zeige.indexOf('frage') >= 0 || n > 0) oben += frageHtml(fall);
    if (zeige.indexOf('karten') >= 0) {
      oben += '<details class="akte__nachlesen"><summary>Alle Hinweise ansehen</summary><div class="karten">' +
        (fall.karten || []).map(karteHtml).join('') + '</div></details>';
    }
    if (station.hilfe && fall.hilfe) {
      oben += '<p class="akte__hilfe"><button type="button" class="knopf knopf--leise" id="hilfe-oeffnen">Hilfekarte</button></p>';
    }

    var pflicht = station.aufgaben.filter(function (a) { return !a.zusatz; });
    var zusatz = station.aufgaben.filter(function (a) { return a.zusatz; });
    var letzte = n === st.length - 1;

    var unten = letzte
      ? '<button type="button" class="knopf" id="weiter" disabled>Akte abschließen</button>'
      : '<button type="button" class="knopf" id="weiter"' + (geschafft ? '' : ' disabled') + '>' +
          '<span class="knopf__text">Weiter zu Station ' + (n + 2) + '</span>' +
          '<svg class="knopf__pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6"></path></svg></button>';

    RA.ui.zeigen(RA.ui.kopf(zurueckLink()) +
      '<main class="inhalt akte">' +
        '<p class="akte__nr">Akte ' + esc(fall.nr || '') + '</p>' +
        '<h1 class="frage">' + esc(fall.titel) + '</h1>' +
        nav +
        '<section class="station" aria-labelledby="station-titel">' +
          '<h2 id="station-titel" class="station__titel">Station ' + (n + 1) + ': ' + esc(station.titel) + '</h2>' +
          oben +
          pflicht.map(function (a) { return aufgabeHtml(fall, a); }).join('') +
          (zusatz.length ? '<div class="aufgabe--zusatz"><p class="zusatz__titel">Für schnelle Detektive</p>' +
            zusatz.map(function (a) { return aufgabeHtml(fall, a); }).join('') + '</div>' : '') +
          '<p class="station__weiter" id="weiter-hinweis">' + (geschafft || !pflicht.length ? '' :
            'Wenn du alle Aufgaben geprüft hast, geht es weiter.') + '</p>' +
          '<div class="station__unten">' + unten + '</div>' +
        '</section>' +
      '</main>' +
      (station.hilfe && fall.hilfe ? hilfeDialogHtml(fall) : '')
    );

    aktuell = { fall: fall, n: n, offen: {} };
    pflicht.forEach(function (a) { aktuell.offen[a.id] = true; });

    station.aufgaben.forEach(function (a) { aufgabeVerdrahten(fall, a); });

    var w = document.getElementById('weiter');
    if (letzte) {
      w.addEventListener('click', function () { abschliessen(fall); });
    } else {
      w.addEventListener('click', function () {
        RA.store.akteMerken(fall.id, { station: n + 1 });
        location.hash = 'akte/' + fall.id + '/' + (n + 2);
      });
    }
    var h = document.getElementById('hilfe-oeffnen');
    if (h) h.addEventListener('click', function () { hilfeOeffnen(h); });
    weiterPruefen();
  }

  function aufgabeErledigt(a) {
    if (!aktuell) return;
    delete aktuell.offen[a.id];
    weiterPruefen();
  }

  function weiterPruefen() {
    var w = document.getElementById('weiter');
    if (!w || !aktuell) return;
    var offen = Object.keys(aktuell.offen).length;
    if (offen === 0 && w.disabled) {
      w.disabled = false;
      var hinweis = document.getElementById('weiter-hinweis');
      if (hinweis) hinweis.textContent = '';
    }
  }

  // ==========================================================
  // Aufgaben
  // ==========================================================
  function aufgabeHtml(fall, a) {
    var kopf = '<h3 class="aufgabe__frage" id="f-' + esc(a.id) + '">' + txt(a.frage || (a.typ === 'tisch' ? 'Am Tisch' : '')) + '</h3>';
    var inhalt = '';

    if (a.typ === 'auswahl' || a.typ === 'eintrag') {
      inhalt = '<div class="optionen" role="group" aria-labelledby="f-' + esc(a.id) + '">' +
        a.optionen.map(function (o) {
          return '<button type="button" class="option" data-wert="' + esc(optionId(o)) + '" aria-pressed="false">' +
            '<span class="option__text">' + txt(optionText(fall, o)) + '</span><span class="option__mark"></span></button>';
        }).join('') + '</div>' +
        (a.mehrere ? '<p class="aufgabe__tipp">Du kannst mehrere Antworten wählen.</p>' : '');
    } else if (a.typ === 'zuordnen') {
      inhalt = '<ul class="paare">' + a.elemente.map(function (el) {
        var eid = el.id || el.karte;
        var label = el.karte ? (karteVon(fall, el.karte) || {}).titel : el.text;
        return '<li class="paar" data-element="' + esc(eid) + '">' +
          (el.karte ? karteHtml(karteVon(fall, el.karte)) : '<p class="paar__wort">' + txt(el.text) + '</p>') +
          '<div class="optionen optionen--ziele" role="group" aria-label="' + esc(label) + '">' +
            a.ziele.map(function (z) {
              return '<button type="button" class="option option--ziel" data-wert="' + esc(z.id) + '" aria-pressed="false">' +
                '<span class="option__text">' + txt(z.text) + '</span><span class="option__mark"></span></button>';
            }).join('') +
          '</div><p class="paar__erklaerung" hidden></p></li>';
      }).join('') + '</ul>';
    } else if (a.typ === 'merken') {
      inhalt = '<p class="aufgabe__tipp">Denk in Ruhe nach. Du kannst es auch einem anderen Kind erklären.</p>' +
        '<button type="button" class="knopf knopf--leise" data-muster disabled>Gleich kannst du die Musterlösung ansehen …</button>' +
        '<div class="muster" hidden></div>';
    } else if (a.typ === 'tisch') {
      inhalt = absaetze(a.text) +
        '<button type="button" class="knopf knopf--leise" data-erledigt>Erledigt</button>';
    }

    var pruefen = (a.typ === 'auswahl' || a.typ === 'zuordnen')
      ? '<button type="button" class="knopf aufgabe__pruefen" data-pruefen disabled>Prüfen</button>' : '';

    return '<div class="aufgabe" id="a-' + esc(a.id) + '" data-typ="' + esc(a.typ) + '">' + kopf + inhalt + pruefen +
      '<div class="rueckmeldung" tabindex="-1" hidden></div></div>';
  }

  function aufgabeVerdrahten(fall, a) {
    var box = document.getElementById('a-' + a.id);
    if (!box) return;
    var pruefenKnopf = box.querySelector('[data-pruefen]');

    // --- Auswahl, Eintrag, Zuordnen: Knöpfe mit aria-pressed ---
    function gruppen() { return Array.prototype.slice.call(box.querySelectorAll('.optionen')); }
    gruppen().forEach(function (g) {
      Array.prototype.forEach.call(g.querySelectorAll('.option'), function (b) {
        b.addEventListener('click', function () {
          if (box.classList.contains('ist-geprueft')) return;
          var an = b.getAttribute('aria-pressed') === 'true';
          if (!a.mehrere) {
            Array.prototype.forEach.call(g.querySelectorAll('.option'), function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
          } else {
            b.setAttribute('aria-pressed', String(!an));
          }
          var alleGewaehlt = gruppen().every(function (gg) { return gg.querySelector('[aria-pressed="true"]'); });
          if (pruefenKnopf) pruefenKnopf.disabled = !alleGewaehlt;
          if (a.typ === 'eintrag') {
            var wahl = {}; wahl[a.id] = b.getAttribute('data-wert');
            RA.store.akteMerken(fall.id, { eintrag: wahl });
            if (!a.zusatz) aufgabeErledigt(a);
          }
        });
      });
    });

    if (pruefenKnopf) {
      pruefenKnopf.addEventListener('click', function () {
        pruefenKnopf.disabled = true;
        pruefenKnopf.textContent = 'Einen Moment …';
        loesungHolen(fall.id).then(function (l) {
          var L = (l.aufgaben || {})[a.id] || {};
          if (a.typ === 'auswahl') auswahlAuswerten(box, a, L);
          else zuordnenAuswerten(box, a, L);
          box.classList.add('ist-geprueft');
          pruefenKnopf.remove();
          if (!a.zusatz) aufgabeErledigt(a);
        }, function () {
          pruefenKnopf.disabled = false;
          pruefenKnopf.textContent = 'Prüfen';
          rueckmeldung(box, 'fehler', 'Zum Prüfen brauche ich Internet. Versuche es gleich noch einmal.');
        });
      });
    }

    // --- Merkfrage ---
    var musterKnopf = box.querySelector('[data-muster]');
    if (musterKnopf) {
      var sek = typeof a.bedenkzeit === 'number' ? a.bedenkzeit : 15;
      setTimeout(function () {
        if (!musterKnopf.isConnected) return;
        musterKnopf.disabled = false;
        musterKnopf.textContent = 'Musterlösung ansehen';
      }, sek * 1000);
      musterKnopf.addEventListener('click', function () {
        musterKnopf.disabled = true;
        loesungHolen(fall.id).then(function (l) {
          var L = (l.aufgaben || {})[a.id] || {};
          var m = box.querySelector('.muster');
          var stufen = a.stufen || ['Ich hatte es auch so.', 'Ich hatte einen Teil davon.', 'Ich hatte es anders.'];
          m.innerHTML = '<p class="muster__titel">Musterlösung</p>' + absaetze(L.muster) +
            '<p class="muster__frage" id="s-' + esc(a.id) + '">Und du?</p>' +
            '<div class="optionen" role="group" aria-labelledby="s-' + esc(a.id) + '">' + stufen.map(function (t, i) {
              return '<button type="button" class="option" data-stufe="' + i + '" aria-pressed="false"><span class="option__text">' + esc(t) + '</span></button>';
            }).join('') + '</div>';
          m.hidden = false;
          musterKnopf.remove();
          m.setAttribute('tabindex', '-1');
          m.focus();
          Array.prototype.forEach.call(m.querySelectorAll('[data-stufe]'), function (b) {
            b.addEventListener('click', function () {
              Array.prototype.forEach.call(m.querySelectorAll('[data-stufe]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
              var sel = {}; sel[a.id] = Number(b.getAttribute('data-stufe'));
              RA.store.akteMerken(fall.id, { selbst: sel });
              if (!a.zusatz) aufgabeErledigt(a);
              RA.ui.ansagen('Danke! Weiter geht es.');
            });
          });
        }, function () {
          musterKnopf.disabled = false;
          rueckmeldung(box, 'fehler', 'Dafür brauche ich Internet. Versuche es gleich noch einmal.');
        });
      });
    }

    // --- Am Tisch ---
    var erledigtKnopf = box.querySelector('[data-erledigt]');
    if (erledigtKnopf) {
      erledigtKnopf.addEventListener('click', function () {
        erledigtKnopf.disabled = true;
        erledigtKnopf.textContent = 'Erledigt ✓';
        if (!a.zusatz) aufgabeErledigt(a);
        RA.ui.ansagen('Erledigt.');
      });
    }
  }

  function rueckmeldung(box, art, html) {
    var r = box.querySelector('.rueckmeldung');
    r.className = 'rueckmeldung rueckmeldung--' + art;
    r.innerHTML = html;
    r.hidden = false;
    r.focus();
    RA.ui.ansagen(r.textContent);
  }

  var URTEIL = {
    richtig: 'Richtig!',
    fast: 'Fast! Schau dir die Erklärungen an.',
    nein: 'Nicht ganz. Lies die Erklärung.'
  };

  function markieren(b, ok, gewaehlt) {
    var m = b.querySelector('.option__mark');
    if (ok) { b.classList.add('ist-richtig'); m.textContent = ' ✓ richtig'; }
    else if (gewaehlt) { b.classList.add('ist-falsch'); m.textContent = ' ✗ nicht richtig'; }
    b.disabled = true;
  }

  function auswahlAuswerten(box, a, L) {
    var richtig = L.richtig || [];
    var gewaehlt = [];
    Array.prototype.forEach.call(box.querySelectorAll('.option'), function (b) {
      var w = b.getAttribute('data-wert');
      var an = b.getAttribute('aria-pressed') === 'true';
      if (an) gewaehlt.push(w);
      markieren(b, richtig.indexOf(w) >= 0, an);
    });
    var alle = gewaehlt.length === richtig.length && gewaehlt.every(function (w) { return richtig.indexOf(w) >= 0; });
    var urteil = alle ? 'richtig' : 'nein';
    rueckmeldung(box, urteil, '<p class="rueckmeldung__urteil">' + URTEIL[urteil] + '</p>' + absaetze(L.erklaerung));
  }

  function zuordnenAuswerten(box, a, L) {
    var richtig = L.richtig || {};
    var erkl = L.erklaerungen || {};
    var treffer = 0, gesamt = 0;
    Array.prototype.forEach.call(box.querySelectorAll('.paar'), function (p) {
      var eid = p.getAttribute('data-element');
      gesamt++;
      Array.prototype.forEach.call(p.querySelectorAll('.option'), function (b) {
        var w = b.getAttribute('data-wert');
        var an = b.getAttribute('aria-pressed') === 'true';
        if (an && w === richtig[eid]) treffer++;
        markieren(b, w === richtig[eid], an);
      });
      if (erkl[eid]) {
        var e = p.querySelector('.paar__erklaerung');
        e.innerHTML = txt(erkl[eid]);
        e.hidden = false;
      }
    });
    var urteil = treffer === gesamt ? 'richtig' : (treffer * 2 >= gesamt ? 'fast' : 'nein');
    rueckmeldung(box, urteil, '<p class="rueckmeldung__urteil">' + URTEIL[urteil] +
      ' <span class="rueckmeldung__zahl">(' + treffer + ' von ' + gesamt + ')</span></p>' + absaetze(L.erklaerung));
  }

  // ==========================================================
  // Hilfekarte (echter Dialog)
  // ==========================================================
  function hilfeDialogHtml(fall) {
    return '<dialog class="wahl hilfe" id="hilfe-dialog" aria-labelledby="hilfe-titel">' +
      '<h2 id="hilfe-titel" class="wahl__titel">Hilfekarte</h2>' +
      '<div class="hilfe__text">' + absaetze(fall.hilfe) + '</div>' +
      '<button type="button" class="knopf knopf--leise" id="hilfe-zu">Schließen</button></dialog>';
  }
  function hilfeOeffnen(ausloeser) {
    var d = document.getElementById('hilfe-dialog');
    var vorbei = false;
    function fertig() {
      if (vorbei) return;
      vorbei = true;
      d.removeEventListener('close', fertig);
      ausloeser.focus();
    }
    d.addEventListener('close', fertig);
    d.oncancel = function (ev) { ev.preventDefault(); if (d.open) d.close(); fertig(); };   // Escape
    document.getElementById('hilfe-zu').onclick = function () { if (d.open) d.close(); fertig(); };
    d.showModal();
    document.getElementById('hilfe-zu').focus();
  }

  // ==========================================================
  // Abschluss: Stempel ins Detektivbuch
  // ==========================================================
  function abschliessen(fall) {
    RA.store.akteAbschliessen(fall.id, fall.stationen.length);
    RA.uhr.stopp();
    var tag = new Date(RA.store.snapshot().stempel[fall.id]).toLocaleDateString('de-DE');
    RA.ui.zeigen(RA.ui.kopf(zurueckLink()) +
      '<main class="inhalt akte akte--fertig">' +
        '<h1 class="frage">Fall gelöst!</h1>' +
        '<p class="hinweis">Super, ' + esc(RA.cloud.kind().vorname) + '! Du hast „' + esc(fall.titel) + '“ gelöst.</p>' +
        '<div class="fertig__stempel">' +
          '<svg class="stempel__marke" viewBox="0 0 120 120" role="img" aria-label="Stempel: gelöst am ' + tag + '">' +
            '<circle cx="60" cy="60" r="54" class="stempel__ring"></circle>' +
            '<circle cx="60" cy="60" r="45" class="stempel__ring stempel__ring--innen"></circle>' +
            '<text x="60" y="56" class="stempel__wort">GELÖST</text>' +
            '<text x="60" y="78" class="stempel__tag">' + tag + '</text></svg>' +
          RA.ui.klaro('klaro--fertig') +
        '</div>' +
        '<p class="hinweis">Der Stempel ist jetzt in deinem Detektivbuch.</p>' +
        '<p class="hinweis" id="urkunde-hinweis" hidden><b>Du hast alle Akten gelöst!</b> ' +
          'Deine Urkunde wartet im Detektivbuch.</p>' +
        '<div class="buch__knoepfe">' +
          '<a class="knopf" href="#buch">Zum Detektivbuch</a>' +
          '<a class="knopf knopf--leise" href="#">Zu den Akten</a>' +
        '</div>' +
      '</main>');
    liste().then(function (l) {
      var h = document.getElementById('urkunde-hinweis');
      if (h && RA.buch.urkundeBereit(RA.store.snapshot(), l)) {
        h.hidden = false;
        RA.ui.ansagen('Du hast alle Akten gelöst! Deine Urkunde wartet im Detektivbuch.');
      }
    }, function () {});
    RA.cloud.schreiben();
  }

  RA.akten = {
    liste: liste,
    listeFuellen: listeFuellen,
    lehrkraftFuellen: lehrkraftFuellen,
    zeigen: zeigen,
    titel: titel,
    // für den Rauchtest
    _zwischenspeicherLeeren: function () { faelle = {}; loesungen = {}; listeGeladen = null; }
  };
})();
