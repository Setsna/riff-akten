/* Fall-Datei ohne Browser prüfen (gleiche Regeln wie im Lehrerbereich).
   Aufruf:  node tools/fall_pruefen.js <datei.json>                    */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'fall-pruefen.js'));
var datei = process.argv[2];
if (!datei) { console.error('Aufruf: node tools/fall_pruefen.js <datei.json>'); process.exit(2); }
var d;
try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) { console.error('Kein gültiges JSON: ' + e.message); process.exit(1); }
var f = window.RA.fallPruefen(d);
if (f.length) { console.log('FEHLER (' + f.length + '):'); f.forEach(function (t) { console.log('  - ' + t); }); process.exit(1); }
var aufgaben = d.fall.stationen.reduce(function (n, s) { return n + s.aufgaben.length; }, 0);
console.log('OK: „' + d.fall.titel + '“ – ' + d.fall.stationen.length + ' Stationen, ' + aufgaben + ' Aufgaben, ' +
  (d.fall.karten || []).length + ' Karten');
