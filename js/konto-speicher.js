/* Lernlagune-Konto, Baukasten: Stand im Browser, ein Eintrag je Zugangscode.
   Entstanden aus dem Piloten Zahlenschwarm (js/speicher.js).

   Die Oberfläche einer Plattform arbeitet weiter synchron gegen diesen Speicher.
   Der Abgleich mit der Datenbank (konto-cloud.js) läuft daneben.

   Im localStorage liegen je Code:
     <schluessel>.k<kennung>            der Stand samt Vorname (für die Anzeige ohne Netz)
     <schluessel>.k<kennung>.abgleich   der Stand, den dieses Gerät zuletzt abgeglichen hat
   Die Kennung wird aus dem Code errechnet (LagunenKonto.kennung). Der Code selbst steht nicht mehr im
   Namen: Er ist zugleich das Passwort für alle Plattformen und soll sich nach dem Abmelden nicht aus dem
   Speicher ablesen lassen. Zurückrechnen heißt alle Codes durchprobieren, und das ist absichtlich langsam.
   Einträge mit dem alten Namen <schluessel>.<CODE>… ziehen beim Start um (umziehen()).
   Mit welchem Code in diesem Tab gearbeitet wird, steht im sessionStorage (<schluessel>-wer), bis zum
   Abmelden oder bis der Tab geschlossen wird.

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

  /* ---------- Kennung statt Code im Namen der Speicher-Einträge ----------
     SHA-256, sehr oft hintereinander und jedes Mal mit dem Code. Synchron, weil der Speicher synchron arbeitet.
     Dauert einmal je Code und Tab etwa 0,1 bis 0,5 Sekunden, danach kommt die Kennung aus dem Merker. */
  const KENNUNG_RUNDEN = 400000;
  const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const SHA_W = new Uint32Array(64);
  function sha256(m) {
    const n = m.length, p = new Uint8Array((((n + 8) >> 6) + 1) * 64);
    p.set(m); p[n] = 0x80;
    const bits = n * 8;
    p[p.length - 4] = bits >>> 24; p[p.length - 3] = bits >>> 16; p[p.length - 2] = bits >>> 8; p[p.length - 1] = bits;
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const W = SHA_W, K = SHA_K;
    for (let o = 0; o < p.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (p[o + 4 * i] << 24) | (p[o + 4 * i + 1] << 16) | (p[o + 4 * i + 2] << 8) | p[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const aus = new Uint8Array(32);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((x, i) => { aus[4 * i] = x >>> 24; aus[4 * i + 1] = x >>> 16; aus[4 * i + 2] = x >>> 8; aus[4 * i + 3] = x; });
    return aus;
  }
  const bytes = s => Uint8Array.from(String(s), z => z.charCodeAt(0) & 255);
  function kennungRechnen(code, runden) {
    const c = bytes(code), puffer = new Uint8Array(32 + c.length);
    puffer.set(c, 32);
    let h = sha256(bytes('lernlagune-konto/kennung/1:' + code));
    for (let i = 0; i < runden; i++) { puffer.set(h); h = sha256(puffer); }
    return Array.from(h.subarray(0, 10), b => b.toString(16).padStart(2, '0')).join('');
  }
  /* Merker: im Tab (sessionStorage, dort steht der Code ohnehin bis zum Abmelden) und in dieser Seite */
  const KENNUNG_MERKER = 'lagunenkonto-kennung-1';
  const kennungen = new Map();
  LK.kennung = roh => {
    const code = String(roh || '').toUpperCase();
    if (kennungen.has(code)) return kennungen.get(code);
    let gemerkt = {};
    try { gemerkt = JSON.parse(sessionStorage.getItem(KENNUNG_MERKER) || '{}') || {}; } catch (e) { gemerkt = {}; }
    let k = typeof gemerkt[code] === 'string' && /^[0-9a-f]{20}$/.test(gemerkt[code]) ? gemerkt[code] : null;
    if (!k) {
      k = kennungRechnen(code, LK.kennungRunden || KENNUNG_RUNDEN);
      try { sessionStorage.setItem(KENNUNG_MERKER, JSON.stringify({ ...gemerkt, [code]: k })); } catch (e) { /* dann wird beim nächsten Laden neu gerechnet */ }
    }
    kennungen.set(code, k);
    return k;
  };
  /* Beim Abmelden: Die Zuordnung Code → Kennung gehört nicht länger in den Tab. */
  LK.kennungVergessen = () => {
    kennungen.clear();
    try { sessionStorage.removeItem(KENNUNG_MERKER); } catch (e) { /* nur dieser Tab */ }
  };

  LK.speicher = function (opt) {
    const BASIS = opt.schluessel;
    const WER = BASIS + '-wer';
    const NAME_MAX = opt.nameMax || 20;
    const schluesselFuer = code => `${BASIS}.k${LK.kennung(code)}`;
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
      if (!istVorschau) { merkeWer(null); LK.kennungVergessen(); }
    }

    /* Alte Einträge heißen <schluessel>.<CODE> und <schluessel>.<CODE>.<zusatz> (z. B. .abgleich, .eintraege).
       Sie bekommen den neuen Namen mit Kennung. Erst wenn der neue Eintrag nachweislich denselben Inhalt hat,
       wird der alte entfernt. Liegen beide vor, gilt der alte: Nur eine ältere Fassung der Seite schreibt noch
       unter dem alten Namen, und dann ist das der jüngere Stand. Gibt die Zahl der umgezogenen Einträge zurück. */
    function umziehen() {
      if (istVorschau) return 0;
      const namen = [];
      try { for (let i = 0; i < localStorage.length; i++) namen.push(localStorage.key(i)); } catch (e) { return 0; }
      const vorn = BASIS + '.';
      let n = 0;
      for (const alt of namen) {
        if (!alt || !alt.startsWith(vorn)) continue;
        const rest = alt.slice(vorn.length), anfang = rest.slice(0, 8);
        if (LK.codePruefen(anfang) !== anfang || (rest.length > 8 && rest[8] !== '.')) continue;
        try {
          const wert = localStorage.getItem(alt);
          if (wert === null) continue;
          const neu = schluesselFuer(anfang) + rest.slice(8);
          localStorage.setItem(neu, wert);
          if (localStorage.getItem(neu) === wert) { localStorage.removeItem(alt); n++; }
        } catch (e) { /* bleibt liegen, der nächste Start versucht es wieder */ }
      }
      return n;
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
    const umgezogen = umziehen();
    laden();

    return {
      schluesselFuer,
      umgezogen,
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
