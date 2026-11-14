/* Lernlagune-Konto, Baukasten: Stand im Browser, ein Eintrag je Zugangscode.
   Entstanden aus dem Piloten Zahlenschwarm (js/speicher.js).

   Die Oberfläche einer Plattform arbeitet weiter synchron gegen diesen Speicher.
   Der Abgleich mit der Datenbank (konto-cloud.js) läuft daneben.

   Im localStorage liegen je Code:
     <schluessel>.<code>            der Stand samt Vorname (für die Anzeige ohne Netz)
     <schluessel>.<code>.abgleich   der Stand, den dieses Gerät zuletzt abgeglichen hat
   Mit welchem Code in diesem Tab gearbeitet wird, steht im sessionStorage (<schluessel>-wer).

   Aufruf:
     const S = LagunenKonto.speicher({
       schluessel: 'meineplattform-v2',
       leer: konto => ({ ... }),          // neuer Stand der Plattform (ohne name, angelegt, geaendert)
       normalisiere: roh => ({ ... }),    // gelesenen Stand bereinigen (nur die eigenen Felder)
       mische: (basis, lokal, fern) => …, // dieselbe Funktion wie im Cloud-Modul
       vorschau: () => stand | null       // optional: Beispielstand, dann wird nichts gespeichert
     });
   Eigene Funktionen der Plattform (z. B. antwortMerken) ändern S.aktiv() und rufen S.speichern(). */
(() => {
  'use strict';
  const LK = window.LagunenKonto = window.LagunenKonto || {};
  const A = LK.abgleich;

  /* Code wie beim Perlentaucher: 8 Zeichen, ohne 0, 1, I, L und O. Gibt den Code zurück oder null. */
  const CODE_ZEICHEN = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  LK.codePruefen = roh => {
    const code = String(roh || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length === 8 && [...code].every(z => CODE_ZEICHEN.includes(z)) ? code : null;
  };

  LK.speicher = function (opt) {
    const BASIS = opt.schluessel;
    const WER = BASIS + '-wer';
    const NAME_MAX = opt.nameMax || 20;
    const schluesselFuer = code => `${BASIS}.${code}`;
    const abgleichSchluessel = code => `${schluesselFuer(code)}.abgleich`;
    const vorschauStand = opt.vorschau ? opt.vorschau() : null;
    const istVorschau = !!vorschauStand;

    let kind = null, aktivCode = null;
    let ladeFehler = false, letzterFehler = null, persistGefragt = false;
    let fassung = 0;                 /* zählt jede Änderung: Daran erkennt der Abgleich, ob währenddessen gearbeitet wurde */
    const lauscher = [];

    const name = x => String(x || '').trim().slice(0, NAME_MAX);
    function normalisiere(roh) {
      const eigen = opt.normalisiere(roh);
      return { ...eigen, name: name(roh.name), angelegt: Number(roh.angelegt) || Date.now(), geaendert: Number(roh.geaendert) || Number(roh.angelegt) || Date.now() };
    }

    function lesen(code) {
      let roh = null;
      try { roh = localStorage.getItem(schluesselFuer(code)); } catch (e) { return { fehler: e }; }
      if (roh === null) return { kind: null };
      try {
        const daten = JSON.parse(roh);
        if (!A.istObjekt(daten)) throw new Error('Aufbau unbekannt');
        return { kind: normalisiere(daten) };
      } catch (e) { return { fehler: e }; }
    }

    function vorhanden(roh) {
      const code = LK.codePruefen(roh);
      if (!code || istVorschau) return false;
      try { return localStorage.getItem(schluesselFuer(code)) !== null; } catch (e) { return false; }
    }

    function merkeWer(code) {
      try { code ? sessionStorage.setItem(WER, code) : sessionStorage.removeItem(WER); } catch (e) { /* nur dieser Tab */ }
    }

    function ablegen() {
      try { localStorage.setItem(schluesselFuer(aktivCode), JSON.stringify(kind)); }
      catch (e) { letzterFehler = e; return false; }
      letzterFehler = null;
      return true;
    }

    /* Nach jeder Änderung am Stand aufrufen. Gibt true zurück, wenn gespeichert wurde. */
    function speichern() {
      if (istVorschau) return true;
      if (!kind || !aktivCode) return false;
      kind.geaendert = Date.now();
      fassung++;
      if (!ablegen()) return false;
      for (const f of lauscher.slice()) { try { f(); } catch (e) { /* Speichern auf dem Gerät hat geklappt */ } }
      if (!persistGefragt) {
        persistGefragt = true;
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* Normalfall bleibt */ }
      }
      return true;
    }

    /* Öffnet den Stand zu einem Code. Gibt es ihn noch nicht, wird er mit leer(konto) angelegt.
       konto: { name, … }. Ergebnis: { ok, kind, neu } oder { ok: false, grund }. */
    function oeffnen(roh, konto = {}) {
      if (istVorschau) return { ok: false, grund: 'vorschau' };
      const code = LK.codePruefen(roh);
      if (!code) return { ok: false, grund: 'code' };
      const r = lesen(code);
      if (r.fehler) { ladeFehler = true; letzterFehler = r.fehler; return { ok: false, grund: 'unlesbar' }; }
      ladeFehler = false;
      let k = r.kind, schreiben = false;
      const neu = !k;
      if (neu) {
        const jetzt = Date.now();
        k = { ...opt.leer(konto), name: name(konto.name), angelegt: jetzt, geaendert: jetzt };
        schreiben = true;
      } else if (name(konto.name) && name(konto.name) !== k.name) {
        k.name = name(konto.name);
        schreiben = true;
      }
      kind = k; aktivCode = code;
      merkeWer(code);
      return { ok: schreiben ? ablegen() : true, kind: k, neu };
    }

    /* Der Stand bleibt auf dem Gerät liegen, nur dieser Tab vergisst den Code. */
    function abmelden() {
      kind = null; aktivCode = null;
      if (!istVorschau) merkeWer(null);
    }

    /* ---------- Abgleich mit der Datenbank (konto-cloud.js) ---------- */
    /* Der Stand ohne Vornamen, so wie er in die Datenbank geht, mit der Nummer der Fassung */
    function schnappschuss() {
      if (!kind) return null;
      const stand = A.kopie(kind);
      delete stand.name;
      return { stand, fassung };
    }

    function abgleichsBasis() {
      if (!aktivCode || istVorschau) return null;
      try {
        const d = JSON.parse(localStorage.getItem(abgleichSchluessel(aktivCode)) || 'null');
        return A.istObjekt(d) ? d : null;
      } catch (e) { return null; }
    }

    /* Stand und Abgleichsbasis setzen. Das Kind-Objekt bleibt dasselbe, nur sein Inhalt wird ersetzt. */
    function setzen(stand, basis) {
      const neu = normalisiere({ ...A.kopie(stand), name: kind.name });
      for (const k of Object.keys(kind)) delete kind[k];
      Object.assign(kind, neu);
      ablegen();
      try { localStorage.setItem(abgleichSchluessel(aktivCode), JSON.stringify(basis)); } catch (e) { letzterFehler = e; }
    }

    /* Ergebnis eines Abgleichs übernehmen. zusammen: was jetzt in der Datenbank steht.
       vorher: der Schnappschuss, mit dem zusammengeführt wurde. Wurde seitdem weitergearbeitet, kommt das obendrauf.
       ersetzen: nach dem Zurücksetzen gilt nur noch der Stand aus der Datenbank.
       Gibt zurück, ob auf dem Gerät noch etwas steht, das die Datenbank nicht kennt. */
    function abgleichUebernehmen(zusammen, vorher = null, ersetzen = false) {
      if (!kind || !aktivCode || istVorschau) return false;
      const weiter = !ersetzen && !!vorher && vorher.fassung !== fassung;
      setzen(weiter ? opt.mische(vorher.stand, schnappschuss().stand, zusammen) : zusammen, zusammen);
      return weiter;
    }

    /* Beim Anmelden: den fernen Stand sofort einrechnen, damit das Kind auf einem neuen Gerät gleich alles sieht.
       Die Basis ist danach der ferne Stand. So zählt der nächste Abgleich nur den eigenen Zuwachs dazu. */
    function fernEinrechnen(fern) {
      if (!kind || !aktivCode || istVorschau) return;
      setzen(opt.mische(abgleichsBasis(), schnappschuss().stand, fern), fern);
    }

    function laden() {
      if (istVorschau) { kind = normalisiere({ name: 'Vorschau', ...vorschauStand }); aktivCode = 'VORSCHAU'; return; }
      let gewaehlt = null;
      try { gewaehlt = sessionStorage.getItem(WER); } catch (e) { /* dann fragt die Seite nach dem Code */ }
      const code = LK.codePruefen(gewaehlt);
      if (!code) return;
      const r = lesen(code);
      if (r.fehler) { ladeFehler = true; letzterFehler = r.fehler; return; }
      if (r.kind) { kind = r.kind; aktivCode = code; } else merkeWer(null);
    }
    laden();

    return {
      schluesselFuer,
      istVorschau,
      get ladeFehler() { return ladeFehler; },
      get letzterFehler() { return letzterFehler; },
      aktiv: () => kind,
      code: () => aktivCode,
      vorhanden,
      oeffnen,
      abmelden,
      speichern,
      schnappschuss,
      abgleichsBasis,
      abgleichUebernehmen,
      fernEinrechnen,
      beiAenderung(f) { if (!lauscher.includes(f)) lauscher.push(f); }
    };
  };
})();
