/* ==========================================================
   Riff-Akten – Detektivbuch (Etappe 2)

   Ausweis mit Abzeichen, Stempelseite, Lernzeit, Urkunde (Etappe 5a:
   erst, wenn alle sichtbaren Akten gelöst sind). Dazu die
   Lernzeit-Uhr (RA.uhr), die ab Etappe 3 beim Öffnen einer Akte
   läuft, und der Ausweis als PDF.

   Der Ausweis zeigt nur Vorname, Abzeichen und "Im Dienst seit".
   Der Zugangscode steht NIE darauf: Er ist zugleich das Passwort.

   PDF ohne Bibliothek: Idee aus dem KI-Korallenriff
   (js/riff-urkunde.js, pdfAusSeiten). Die Seite wird auf ein Canvas
   gezeichnet und als JPEG in ein kleines PDF gelegt. Alles entsteht
   auf dem Gerät, nichts geht an einen Server.
   ========================================================== */
window.RA = window.RA || {};

(function () {
  'use strict';

  var C = RA.config;
  var V = '?v=18';

  function abzeichenDaten(id) {
    for (var i = 0; i < C.abzeichen.length; i++) if (C.abzeichen[i].id === id) return C.abzeichen[i];
    return null;
  }
  function abzeichenBild(id) { return 'bilder/abzeichen/' + id + '.webp' + V; }

  function datum(ms) {
    return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // 0 Sekunden -> null; sonst "1 Stunde 5 Minuten", "12 Minuten", "weniger als 1 Minute"
  function dauer(sek) {
    sek = Math.round(sek || 0);
    if (sek <= 0) return null;
    var min = Math.floor(sek / 60);
    if (min < 1) return 'weniger als 1 Minute';
    var h = Math.floor(min / 60), m = min % 60;
    var teile = [];
    if (h) teile.push(h + (h === 1 ? ' Stunde' : ' Stunden'));
    if (m) teile.push(m + (m === 1 ? ' Minute' : ' Minuten'));
    return teile.join(' ');
  }

  // Titel einer Akte. Ab Etappe 3 kommen die Titel aus den Fall-Daten.
  function aktenTitel(id) {
    return (RA.akten && RA.akten.titel && RA.akten.titel(id)) || id;
  }

  // ==========================================================
  // Lernzeit-Uhr
  // Läuft nur, solange eine Akte offen UND die Seite sichtbar ist.
  // Ein einzelnes Stück zählt höchstens C.lernzeitMaxStueck Sekunden
  // (iPad bleibt offen liegen).
  // ==========================================================
  var uhr = { id: null, seit: 0 };

  function uhrBuchen() {
    if (!uhr.id || !uhr.seit) return;
    var sek = Math.min((Date.now() - uhr.seit) / 1000, C.lernzeitMaxStueck);
    uhr.seit = 0;
    if (sek >= 1) RA.store.zeitDazu(uhr.id, sek);
  }
  function uhrStart(id) {
    uhrStopp();
    uhr.id = id;
    uhr.seit = document.hidden ? 0 : Date.now();
  }
  function uhrStopp() {
    uhrBuchen();
    uhr.id = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (!uhr.id) return;
    if (document.hidden) uhrBuchen();
    else uhr.seit = Date.now();
  });
  window.addEventListener('pagehide', uhrBuchen);

  RA.uhr = {
    start: uhrStart,
    stopp: uhrStopp,
    laeuft: function () { return uhr.id; }
  };

  // ==========================================================
  // Ansicht: Detektivbuch
  // ==========================================================
  function ausweisHtml(k, s) {
    var a = abzeichenDaten(s.abzeichen);
    var bild = a
      ? '<img class="ausweis__abzeichen" src="' + abzeichenBild(a.id) + '" alt="Abzeichen: ' + RA.ui.esc(a.name) + '" width="480" height="480">'
      : '<span class="ausweis__abzeichen ausweis__abzeichen--leer" aria-hidden="true">?</span>';
    return '<div class="ausweis">' +
        '<p class="ausweis__kopf">Detektivausweis</p>' +
        '<div class="ausweis__mitte">' + bild +
          '<div class="ausweis__daten">' +
            '<p class="ausweis__name">' + RA.ui.esc(k.vorname) + '</p>' +
            '<p class="ausweis__rolle">Ermittelt für die Riff-Akten</p>' +
            (k.angelegt ? '<p class="ausweis__seit">Im Dienst seit<br><b>' + datum(k.angelegt) + '</b></p>' : '') +
          '</div>' +
        '</div>' +
        (a ? '' : '<p class="ausweis__tipp">Noch kein Abzeichen gewählt.</p>') +
      '</div>';
  }

  function stempelHtml(s) {
    var ids = Object.keys(s.stempel || {}).sort(function (x, y) { return s.stempel[x] - s.stempel[y]; });
    if (!ids.length) {
      return '<p class="buch__leer">Für jede gelöste Akte bekommst du hier einen Stempel.</p>' +
        '<ul class="stempel" aria-hidden="true">' +
          '<li class="stempel__feld stempel__feld--leer"></li>' +
          '<li class="stempel__feld stempel__feld--leer"></li>' +
          '<li class="stempel__feld stempel__feld--leer"></li>' +
        '</ul>';
    }
    return '<ul class="stempel">' + ids.map(function (id, i) {
      var titel = RA.ui.esc(aktenTitel(id));
      var tag = new Date(s.stempel[id]).toLocaleDateString('de-DE');
      // Leicht schräg wie ein echter Stempel, aber jeder etwas anders
      var drehung = [-8, 5, -3, 7, -6][i % 5];
      return '<li class="stempel__feld">' +
        '<svg class="stempel__marke" viewBox="0 0 120 120" style="transform: rotate(' + drehung + 'deg)" ' +
          'role="img" aria-label="Stempel: ' + titel + ' gelöst am ' + tag + '">' +
          '<circle cx="60" cy="60" r="54" class="stempel__ring"></circle>' +
          '<circle cx="60" cy="60" r="45" class="stempel__ring stempel__ring--innen"></circle>' +
          '<text x="60" y="56" class="stempel__wort">GELÖST</text>' +
          '<text x="60" y="78" class="stempel__tag">' + tag + '</text>' +
        '</svg>' +
        '<p class="stempel__titel">' + titel + '</p>' +
      '</li>';
    }).join('') + '</ul>';
  }

  function lernzeitHtml(s) {
    var zeit = s.zeit || {};
    var ids = Object.keys(zeit).filter(function (id) { return zeit[id] > 0; });
    var summe = ids.reduce(function (n, id) { return n + zeit[id]; }, 0);
    var gesamt = dauer(summe);
    if (!gesamt) {
      return '<p class="buch__leer">Noch keine Lernzeit. Die Uhr läuft, sobald du eine Akte öffnest.</p>';
    }
    return '<p class="lernzeit__gesamt">Du hast schon <b>' + gesamt + '</b> ermittelt.</p>' +
      '<ul class="lernzeit__liste">' + ids.map(function (id) {
        return '<li><span>' + RA.ui.esc(aktenTitel(id)) + '</span><span>' + dauer(zeit[id]) + '</span></li>';
      }).join('') + '</ul>';
  }

  // Urkunde: erst, wenn alle sichtbaren Akten gelöst sind.
  // akten = Liste aus RA.akten.liste(), null = lädt noch, false = Fehler
  function geloesteAkten(s, akten) {
    return akten.filter(function (a) { return s.stempel && s.stempel[a.id]; });
  }
  function urkundeBereit(s, akten) {
    return !!(akten && akten.length && geloesteAkten(s, akten).length === akten.length);
  }
  function urkundeHtml(s, akten) {
    if (akten === null) return '<p class="buch__leer">Einen Moment …</p>';
    if (akten === false) return '<p class="buch__leer">Die Akten laden gerade nicht. Versuche es später noch einmal.</p>';
    if (!akten.length) return '<p class="buch__leer">Noch keine Akten da.</p>';
    var n = geloesteAkten(s, akten).length;
    if (n < akten.length) {
      return '<p class="buch__leer">Löse alle Akten, dann bekommst du hier deine Urkunde.</p>' +
        '<p class="urkunde__stand">Geschafft: <b>' + n + ' von ' + akten.length + '</b> Akten</p>';
    }
    return '<p class="urkunde__stand">Du hast alle ' + (akten.length === 1 ? 'Akten' : akten.length + ' Akten') +
        ' gelöst. Hier ist deine Urkunde!</p>' +
      '<div class="buch__knoepfe">' +
        '<button type="button" class="knopf" id="urkunde-pdf">Urkunde zum Ausdrucken</button>' +
      '</div>' +
      '<p class="buch__pdf" id="urkunde-zeile" hidden>' +
        '<a class="knopf" id="urkunde-link" download>PDF öffnen</a></p>';
  }
  function urkundeBinden(akten) {
    var b = document.getElementById('urkunde-pdf');
    if (!b) return;
    b.addEventListener('click', function () {
      pdfMachen(b, {
        seite: function () { return urkundeSeite(RA.cloud.kind(), RA.store.snapshot(), akten); },
        zeile: 'urkunde-zeile', link: 'urkunde-link', name: 'Urkunde',
        fertig: 'Deine Urkunde ist fertig. Tippe auf PDF öffnen.'
      });
    });
  }

  function zeigen() {
    var k = RA.cloud.kind();
    var s = RA.store.snapshot();
    var zurueck = '<a class="zurueck" href="#">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H6M11 6l-6 6 6 6"></path></svg>' +
      'Zurück zu den Akten</a>';

    RA.ui.zeigen(RA.ui.kopf(zurueck) +
      '<main class="inhalt buch">' +
        '<h1 class="frage">Mein Detektivbuch</h1>' +

        '<section class="buch__teil" aria-labelledby="t-ausweis">' +
          '<h2 id="t-ausweis" class="buch__titel">Mein Ausweis</h2>' +
          '<div id="ausweis-platz">' + ausweisHtml(k, s) + '</div>' +
          '<div class="buch__knoepfe">' +
            '<button type="button" class="knopf knopf--leise" id="abzeichen-waehlen">' +
              (s.abzeichen ? 'Abzeichen ändern' : 'Abzeichen wählen') + '</button>' +
            '<button type="button" class="knopf" id="ausweis-pdf">Ausweis zum Ausdrucken</button>' +
          '</div>' +
          '<p class="buch__pdf" id="pdf-zeile" hidden>' +
            '<a class="knopf" id="pdf-link" download>PDF öffnen</a></p>' +
        '</section>' +

        '<section class="buch__teil" aria-labelledby="t-stempel">' +
          '<h2 id="t-stempel" class="buch__titel">Meine Stempel</h2>' +
          '<div id="stempel-platz">' + stempelHtml(s) + '</div>' +
        '</section>' +

        '<section class="buch__teil" aria-labelledby="t-zeit">' +
          '<h2 id="t-zeit" class="buch__titel">Meine Lernzeit</h2>' +
          '<div id="zeit-platz">' + lernzeitHtml(s) + '</div>' +
        '</section>' +

        '<section class="buch__teil" aria-labelledby="t-urkunde">' +
          '<h2 id="t-urkunde" class="buch__titel">Meine Urkunde</h2>' +
          '<div id="urkunde-platz">' + urkundeHtml(s, RA.akten ? null : false) + '</div>' +
        '</section>' +
      '</main>' +

      dialogHtml(s)
    );

    document.getElementById('abzeichen-waehlen').addEventListener('click', function () {
      dialogOeffnen(this);
    });
    document.getElementById('ausweis-pdf').addEventListener('click', function () {
      pdfMachen(this, {
        seite: function () { return ausweisSeite(RA.cloud.kind(), RA.store.snapshot()); },
        zeile: 'pdf-zeile', link: 'pdf-link', name: 'Detektivausweis',
        fertig: 'Dein Ausweis ist fertig. Tippe auf PDF öffnen.'
      });
    });

    // Akten nachladen: Titel für Stempel und Lernzeit, Stand der Urkunde
    if (RA.akten) {
      RA.akten.liste().then(function (akten) {
        var sp = document.getElementById('stempel-platz'), zp = document.getElementById('zeit-platz'),
            up = document.getElementById('urkunde-platz');
        if (!sp || !zp || !up) return;
        var neu = RA.store.snapshot();
        sp.innerHTML = stempelHtml(neu);
        zp.innerHTML = lernzeitHtml(neu);
        up.innerHTML = urkundeHtml(neu, akten);
        urkundeBinden(akten);
      }, function () {
        var up = document.getElementById('urkunde-platz');
        if (up) up.innerHTML = urkundeHtml(s, false);
      });
    }
  }

  // ==========================================================
  // Dialog: Abzeichen wählen (echter <dialog>: Fokus hinein,
  // Tab bleibt drin, Escape schließt, Fokus zurück)
  // ==========================================================
  function dialogHtml(s) {
    return '<dialog class="wahl" id="abzeichen-dialog" aria-labelledby="wahl-titel">' +
      '<h2 id="wahl-titel" class="wahl__titel">Wähle dein Abzeichen</h2>' +
      '<p class="wahl__text">Es steht auf deinem Ausweis. Du kannst es später ändern.</p>' +
      '<ul class="wahl__liste">' + C.abzeichen.map(function (a) {
        var an = a.id === s.abzeichen;
        return '<li><button type="button" class="wahl__knopf" data-id="' + a.id + '" aria-pressed="' + an + '">' +
          '<img src="' + abzeichenBild(a.id) + '" alt="" width="480" height="480">' +
          '<span>' + RA.ui.esc(a.name) + '</span></button></li>';
      }).join('') + '</ul>' +
      '<button type="button" class="knopf knopf--leise" id="wahl-zu">Schließen</button>' +
    '</dialog>';
  }

  function dialogOeffnen(ausloeser) {
    var d = document.getElementById('abzeichen-dialog');
    var gewaehlt = null;

    var vorbei = false;
    // Schließen per Knopf ruft fertig() direkt auf; das close-Ereignis
    // braucht es nur für Escape (manche Browser liefern es verspätet).
    function zu() { if (d.open) d.close(); fertig(); }
    function fertig() {
      if (vorbei) return;
      vorbei = true;
      d.removeEventListener('close', fertig);
      if (gewaehlt) {
        // Nur den Ausweis neu zeichnen, der Rest der Seite bleibt
        document.getElementById('ausweis-platz').innerHTML = ausweisHtml(RA.cloud.kind(), RA.store.snapshot());
        ausloeser.textContent = 'Abzeichen ändern';
        RA.ui.ansagen('Dein Abzeichen ist jetzt: ' + gewaehlt.name + '.');
        pdfZuruecksetzen();
      }
      // Ausdrücklich zurück (Safari fokussiert Knöpfe beim Antippen nicht)
      ausloeser.focus();
    }

    d.addEventListener('close', fertig);
    d.oncancel = function (ev) { ev.preventDefault(); zu(); };   // Escape
    document.getElementById('wahl-zu').onclick = zu;
    Array.prototype.forEach.call(d.querySelectorAll('.wahl__knopf'), function (b) {
      b.onclick = function () {
        gewaehlt = abzeichenDaten(b.getAttribute('data-id'));
        RA.store.abzeichenSetzen(gewaehlt.id);
        Array.prototype.forEach.call(d.querySelectorAll('.wahl__knopf'), function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        zu();
      };
    });
    d.showModal();
    var an = d.querySelector('.wahl__knopf[aria-pressed="true"]') || d.querySelector('.wahl__knopf');
    an.focus();
  }

  // ==========================================================
  // Ausweis als PDF
  // ==========================================================
  // Je PDF-Zeile eine eigene Adresse (Ausweis und Urkunde)
  var pdfAdressen = {};
  function pdfZuruecksetzen(zeile) {
    zeile = zeile || 'pdf-zeile';
    if (pdfAdressen[zeile]) { URL.revokeObjectURL(pdfAdressen[zeile]); pdfAdressen[zeile] = null; }
    var z = document.getElementById(zeile);
    if (z) z.hidden = true;
  }

  // opt: seite() -> Promise<canvas>, zeile, link, name, fertig (Ansage)
  function pdfMachen(knopf, opt) {
    var alt = knopf.textContent;
    knopf.disabled = true;
    knopf.textContent = 'Einen Moment …';
    pdfZuruecksetzen(opt.zeile);
    opt.seite().then(function (canvas) {
      var blob = pdfAusSeiten([canvas]);
      pdfAdressen[opt.zeile] = URL.createObjectURL(blob);
      var link = document.getElementById(opt.link);
      link.href = pdfAdressen[opt.zeile];
      link.download = opt.name + '-' + String(RA.cloud.kind().vorname).replace(/[^\wäöüÄÖÜß-]+/g, '') + '.pdf';
      document.getElementById(opt.zeile).hidden = false;
      knopf.disabled = false;
      knopf.textContent = alt;
      link.focus();
      RA.ui.ansagen(opt.fertig);
    }, function (e) {
      console.warn('Riff-Akten: PDF', e);
      knopf.disabled = false;
      knopf.textContent = alt;
      RA.ui.ansagen('Das hat nicht geklappt. Versuche es noch einmal.');
    });
  }

  // --- Zeichnen (A4 hochkant, 150 dpi) ---
  var B = 1240, H = 1754;
  var NAVY = '#0b3155', NAVY_WEICH = '#2d6f98', PAPIER = '#fbf7ec', LICHT = '#e4f3f5';

  var bildCache = {};
  function bild(src) {
    if (!bildCache[src]) {
      bildCache[src] = new Promise(function (ok, nein) {
        var img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = function () { nein(new Error('Bild fehlt: ' + src)); };
        img.src = src;
      });
    }
    return bildCache[src];
  }

  function schriften() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['400 80px "Libre Caslon Text"', '400 40px "Andika"', '700 40px "Andika"'].map(function (f) {
      return document.fonts.load(f).catch(function () { return null; });
    }));
  }

  function rund(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Text links setzen und verkleinern, bis er in die Breite passt
  function zeile(ctx, text, x, y, schrift, groesse, maxB, farbe) {
    var g = groesse;
    do { ctx.font = schrift.replace('#', g); g -= 2; } while (ctx.measureText(text).width > maxB && g > 20);
    ctx.fillStyle = farbe;
    ctx.fillText(text, x, y);
  }

  function ausweisSeite(k, s) {
    var a = abzeichenDaten(s.abzeichen);
    var laden = [bild('bilder/klaro.webp' + V)];
    if (a) laden.push(bild(abzeichenBild(a.id)));
    return schriften().then(function () { return Promise.all(laden); }).then(function (bilder) {
      var klaro = bilder[0], abz = bilder[1];
      var c = document.createElement('canvas');
      c.width = B; c.height = H;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, B, H);

      // Karte im Format eines Ausweises (85,6 : 54), etwa 17 cm breit
      var x = 120, y = 150, w = 1000, h = 631;

      // Schnittlinie
      ctx.save();
      ctx.setLineDash([14, 12]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#9aa9b5';
      rund(ctx, x - 22, y - 22, w + 44, h + 44, 56);
      ctx.stroke();
      ctx.restore();

      // Karte
      ctx.save();
      rund(ctx, x, y, w, h, 40);
      ctx.clip();
      var verlauf = ctx.createLinearGradient(0, y, 0, y + h);
      verlauf.addColorStop(0, LICHT);
      verlauf.addColorStop(1, PAPIER);
      ctx.fillStyle = verlauf;
      ctx.fillRect(x, y, w, h);
      // Kopfband
      ctx.fillStyle = NAVY;
      ctx.fillRect(x, y, w, 118);
      ctx.restore();
      ctx.save();
      rund(ctx, x, y, w, h, 40);
      ctx.lineWidth = 6;
      ctx.strokeStyle = NAVY;
      ctx.stroke();
      ctx.restore();

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      zeile(ctx, 'Riff-Akten', x + 50, y + 80, '400 #px "Libre Caslon Text"', 58, 420, '#ffffff');
      ctx.textAlign = 'right';
      ctx.font = '700 34px "Andika"';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('DETEKTIVAUSWEIS', x + w - 50, y + 76);

      // Abzeichen (oder Lupe als Platzhalter)
      var ax = x + 60, ay = y + 170, ad = 270;
      if (abz) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + ad / 2, ay + ad / 2, ad / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(abz, ax, ay, ad, ad);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ax + ad / 2, ay + ad / 2, ad / 2, 0, Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = NAVY;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(ax + ad / 2, ay + ad / 2, ad / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = NAVY;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax + ad / 2 - 18, ay + ad / 2 - 18, 52, 0, Math.PI * 2);
        ctx.moveTo(ax + ad / 2 + 20, ay + ad / 2 + 20);
        ctx.lineTo(ax + ad / 2 + 72, ay + ad / 2 + 72);
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = NAVY_WEICH;
        ctx.stroke();
      }

      // Angaben
      var tx = x + 400, tb = w - 400 - 50;
      ctx.textAlign = 'left';
      ctx.font = '700 28px "Andika"';
      ctx.fillStyle = NAVY_WEICH;
      ctx.fillText('NAME', tx, y + 215);
      zeile(ctx, k.vorname, tx, y + 300, '400 #px "Libre Caslon Text"', 92, tb, NAVY);
      ctx.font = '400 36px "Andika"';
      ctx.fillStyle = NAVY;
      ctx.fillText('Ermittelt für die Riff-Akten', tx, y + 360);
      if (k.angelegt) {
        ctx.font = '700 28px "Andika"';
        ctx.fillStyle = NAVY_WEICH;
        ctx.fillText('IM DIENST SEIT', tx, y + 440);
        ctx.font = '400 38px "Andika"';
        ctx.fillStyle = NAVY;
        ctx.fillText(datum(k.angelegt), tx, y + 490);
      }

      // Klaro unten rechts
      var kw = 210, kh = kw * klaro.height / klaro.width;
      ctx.drawImage(klaro, x + w - kw - 30, y + h - kh - 18, kw, kh);

      // Hinweis unter der Karte
      ctx.textAlign = 'center';
      ctx.font = '400 34px "Andika"';
      ctx.fillStyle = '#4c6478';
      ctx.fillText('An der gestrichelten Linie ausschneiden.', B / 2, y + h + 110);

      return c;
    });
  }

  // Urkunde: A4 hochkant. Name, Abzeichen, alle gelösten Akten mit Datum.
  function urkundeSeite(k, s, akten) {
    var a = abzeichenDaten(s.abzeichen);
    var laden = [bild('bilder/klaro.webp' + V)];
    if (a) laden.push(bild(abzeichenBild(a.id)));
    var geloest = geloesteAkten(s, akten);
    return schriften().then(function () { return Promise.all(laden); }).then(function (bilder) {
      var klaro = bilder[0], abz = bilder[1];
      var c = document.createElement('canvas');
      c.width = B; c.height = H;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, B, H);

      // Rahmen: Fläche mit Verlauf, doppelte Linie
      var r = 70, rw = B - 2 * r, rh = H - 2 * r;
      ctx.save();
      rund(ctx, r, r, rw, rh, 36);
      ctx.clip();
      var verlauf = ctx.createLinearGradient(0, r, 0, r + rh);
      verlauf.addColorStop(0, LICHT);
      verlauf.addColorStop(0.45, PAPIER);
      verlauf.addColorStop(1, PAPIER);
      ctx.fillStyle = verlauf;
      ctx.fillRect(r, r, rw, rh);
      ctx.restore();
      ctx.lineWidth = 10;
      ctx.strokeStyle = NAVY;
      rund(ctx, r, r, rw, rh, 36);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = NAVY_WEICH;
      rund(ctx, r + 26, r + 26, rw - 52, rh - 52, 22);
      ctx.stroke();

      var mx = B / 2, innen = rw - 200;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 36px "Andika"';
      ctx.fillStyle = NAVY_WEICH;
      ctx.fillText('RIFF-AKTEN', mx, 220);
      zeile(ctx, 'Urkunde', mx, 360, '400 #px "Libre Caslon Text"', 150, innen, NAVY);

      // Abzeichen (oder Klaro, wenn keins gewählt ist)
      var ad = 300, ay = 420;
      if (abz) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, ay + ad / 2, ad / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(abz, mx - ad / 2, ay, ad, ad);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(mx, ay + ad / 2, ad / 2, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = NAVY;
        ctx.stroke();
      } else {
        var kw0 = ad, kh0 = kw0 * klaro.height / klaro.width;
        ctx.drawImage(klaro, mx - kw0 / 2, ay + (ad - kh0) / 2, kw0, kh0);
      }

      zeile(ctx, k.vorname, mx, 880, '400 #px "Libre Caslon Text"', 120, innen, NAVY);
      ctx.font = '400 46px "Andika"';
      ctx.fillStyle = NAVY;
      ctx.fillText(geloest.length === 1 ? 'hat die Riff-Akte gelöst.' : 'hat alle ' + geloest.length + ' Riff-Akten gelöst.', mx, 960);
      ctx.fillText('Super ermittelt!', mx, 1025);

      // Liste der Akten mit Datum (wird bei vielen Akten kleiner)
      var y = 1120, platz = 1460 - y;
      var schritt = Math.min(64, Math.floor(platz / Math.max(geloest.length, 1)));
      var gr = Math.max(26, Math.min(40, schritt - 18));
      geloest.slice().sort(function (x, z) { return s.stempel[x.id] - s.stempel[z.id]; }).forEach(function (f) {
        var t = new Date(s.stempel[f.id]).toLocaleDateString('de-DE');
        zeile(ctx, '\u2713  ' + f.titel + '  \u2013  ' + t, mx, y + gr, '400 #px "Andika"', gr, innen, NAVY);
        y += schritt;
      });

      // Datum und Unterschrift
      var uy = 1560;
      ctx.lineWidth = 3;
      ctx.strokeStyle = NAVY_WEICH;
      ctx.beginPath();
      ctx.moveTo(190, uy); ctx.lineTo(530, uy);
      ctx.moveTo(610, uy); ctx.lineTo(930, uy);
      ctx.stroke();
      ctx.font = '400 38px "Andika"';
      ctx.fillStyle = NAVY;
      ctx.fillText(datum(Date.now()), 360, uy - 18);
      ctx.font = '700 26px "Andika"';
      ctx.fillStyle = NAVY_WEICH;
      ctx.fillText('DATUM', 360, uy + 40);
      ctx.fillText('UNTERSCHRIFT', 770, uy + 40);

      // Klaro klein unten rechts, wenn oben das Abzeichen steht
      if (abz) {
        var kw = 170, kh = kw * klaro.height / klaro.width;
        ctx.drawImage(klaro, B - r - kw - 45, H - r - kh - 45, kw, kh);
      }
      return c;
    });
  }

  function jpegBytes(canvas) {
    var daten = atob(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
    var b = new Uint8Array(daten.length);
    for (var i = 0; i < daten.length; i++) b[i] = daten.charCodeAt(i);
    return b;
  }

  function pdfAusSeiten(canvasse) {
    var teile = [], laenge = 0, offsets = [];
    function text(s) {
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
      teile.push(b); laenge += b.length;
    }
    function roh(b) { teile.push(b); laenge += b.length; }
    function obj(nr, inhalt) { offsets[nr] = laenge; text(nr + ' 0 obj\n' + inhalt + '\nendobj\n'); }

    var W = 595.28, Hp = 841.89, n = canvasse.length;
    function seitenNr(i) { return 3 + i * 3; }
    text('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' +
      canvasse.map(function (_, i) { return seitenNr(i) + ' 0 R'; }).join(' ') + '] >>');
    canvasse.forEach(function (cv, i) {
      var s = seitenNr(i);
      obj(s, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + Hp + '] /Resources << /XObject << /Im' + i +
        ' ' + (s + 2) + ' 0 R >> >> /Contents ' + (s + 1) + ' 0 R >>');
      var strom = 'q ' + W + ' 0 0 ' + Hp + ' 0 0 cm /Im' + i + ' Do Q';
      obj(s + 1, '<< /Length ' + strom.length + ' >>\nstream\n' + strom + '\nendstream');
      var jpg = jpegBytes(cv);
      offsets[s + 2] = laenge;
      text((s + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      roh(jpg);
      text('\nendstream\nendobj\n');
    });
    var anzahl = 3 + n * 3, xref = laenge;
    var x = 'xref\n0 ' + anzahl + '\n0000000000 65535 f \n';
    for (var i = 1; i < anzahl; i++) x += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
    text(x + 'trailer\n<< /Size ' + anzahl + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(teile, { type: 'application/pdf' });
  }

  RA.buch = {
    zeigen: zeigen,
    dauer: dauer,
    // für den Rauchtest
    _ausweisSeite: ausweisSeite,
    _urkundeSeite: urkundeSeite,
    urkundeBereit: urkundeBereit,
    _pdfAusSeiten: pdfAusSeiten
  };
})();
