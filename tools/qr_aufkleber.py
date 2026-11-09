#!/usr/bin/env python3
"""
Riff-Akten – Druckbogen mit QR-Zugangsaufklebern
(übernommen aus Perlentaucher, tools/qr_aufkleber.py)

Erzeugt aus einer Namensliste:
  1. aufkleber.pdf      A4-Schneidebogen, 3 x 8 = 24 Aufkleber je Seite
  2. zugangscodes.csv   Liste Name;Code;Link  (nur für die Lehrkraft!)
  3. kinder.json        Importdatei für Firebase

Jeder QR-Code wird nach dem Zeichnen wieder eingelesen und geprüft.

Aufruf (aus dem Projektordner Riff-Akten):
    py repo/tools/qr_aufkleber.py --namen Dateien/namen.txt

Die Ausgabe landet in Dateien/Zugangscodes/ – AUSSERHALB von repo/.
Die Codes sind die Zugänge der Kinder und gehören nie ins Repository;
das Skript verweigert deshalb jeden Ausgabeordner innerhalb von repo/.

Braucht: opencv-python, numpy, reportlab (py -m pip install ...).
"""

import argparse, csv, json, secrets, sys, os
import cv2, numpy as np
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import Color

# ---------------------------------------------------------------- Farben
TEAL   = Color(0.176, 0.435, 0.596)   # #2D6F98 (Wellenblau der Lernlagune)
INK    = Color(0.043, 0.192, 0.333)   # #0B3155 (Navy)
GREY   = Color(0.35, 0.47, 0.53)
CUT    = Color(0.78, 0.85, 0.89)
CORAL  = Color(0.886, 0.337, 0.169)   # #E2562B (Klaro)

# Zeichen ohne Verwechslungsgefahr: kein 0/O, kein 1/I/L
# (muss zu js/config.js passen)
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LEN = 8

# repo/ und der Standard-Ausgabeordner Dateien/Zugangscodes/ daneben
REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
STANDARD_AUS = os.path.join(os.path.dirname(REPO), "Dateien", "Zugangscodes")


def neuer_code(vergeben):
    while True:
        c = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
        if c not in vergeben:
            vergeben.add(c)
            return c


def qr_matrix(text, level=cv2.QRCodeEncoder_CORRECT_LEVEL_Q):
    """Liefert die QR-Module als boolesche Matrix (True = schwarz)."""
    p = cv2.QRCodeEncoder_Params()
    p.correction_level = level
    img = cv2.QRCodeEncoder_create(p).encode(text)
    ys, xs = np.where(img == 0)                       # Rand abschneiden
    img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return img == 0


def qr_pruefen(matrix, text):
    """Zeichnet die Matrix gross und liest sie wieder ein.

    Der Leser von OpenCV ist bei kleiner Aufloesung unzuverlaessig, deshalb
    wird in mehreren Groessen geprueft. Besteht eine davon, ist der Code gut.
    """
    img = np.where(matrix, 0, 255).astype(np.uint8)
    for scale, rand in ((10, 80), (14, 112), (8, 64)):
        gross = cv2.resize(img, (img.shape[1] * scale, img.shape[0] * scale),
                           interpolation=cv2.INTER_NEAREST)
        gross = cv2.copyMakeBorder(gross, rand, rand, rand, rand, cv2.BORDER_CONSTANT, value=255)
        gelesen, _, _ = cv2.QRCodeDetector().detectAndDecode(gross)
        if gelesen == text:
            return True
    return False


def zeichne_qr(c, matrix, x, y, groesse):
    """Zeichnet die Matrix bei (x, y) = linke untere Ecke, Kantenlänge groesse."""
    n = matrix.shape[0]
    m = groesse / n
    c.setFillColor(INK)
    for r in range(n):
        zeile = matrix[n - 1 - r]                      # PDF zählt von unten
        s = 0
        while s < n:
            if not zeile[s]:
                s += 1
                continue
            e = s
            while e + 1 < n and zeile[e + 1]:          # waagerechte Läufe bündeln
                e += 1
            c.rect(x + s * m, y + r * m, (e - s + 1) * m, m, stroke=0, fill=1)
            s = e + 1


def zeichne_aufkleber(c, x, y, br, ho, vorname, code, url, muster):
    pad = 3 * mm
    qr_gr = min(ho - 2 * pad, 25 * mm)
    qx, qy = x + pad, y + (ho - qr_gr) / 2
    zeichne_qr(c, qr_matrix(url), qx, qy, qr_gr)

    tx = qx + qr_gr + 3.5 * mm
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(tx, y + ho - pad - 5, "RIFF-AKTEN")
    c.setStrokeColor(CORAL); c.setLineWidth(1.2)
    c.line(tx, y + ho - pad - 8.5, tx + 16 * mm, y + ho - pad - 8.5)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(tx, y + ho / 2 - 1, vorname[:18])

    c.setFillColor(GREY)
    c.setFont("Courier-Bold", 9.5)
    c.drawString(tx, y + pad + 3.5, code[:4] + "-" + code[4:])

    if muster:
        c.setFillColor(CORAL)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawRightString(x + br - pad, y + ho - pad - 5, "MUSTER")


def bogen(pfad, kinder, basis_url, muster=False, spalten=3, zeilen=8):
    c = canvas.Canvas(pfad, pagesize=A4)
    seite_br, seite_ho = A4
    rand_x, rand_o, rand_u = 10 * mm, 10 * mm, 16 * mm
    br = (seite_br - 2 * rand_x) / spalten
    ho = (seite_ho - rand_o - rand_u) / zeilen
    pro_seite = spalten * zeilen

    for i, kind in enumerate(kinder):
        if i % pro_seite == 0:
            if i:
                c.showPage()
            # Schnittlinien
            c.setStrokeColor(CUT); c.setLineWidth(0.25)
            for s in range(spalten + 1):
                xx = rand_x + s * br
                c.line(xx, rand_u, xx, seite_ho - rand_o)
            for z in range(zeilen + 1):
                yy = rand_u + z * ho
                c.line(rand_x, yy, seite_br - rand_x, yy)
            c.setFillColor(GREY); c.setFont("Helvetica", 7)
            c.drawCentredString(seite_br / 2, 8 * mm,
                ("MUSTERBOGEN – Beispieldaten, nicht austeilen. " if muster else "") +
                "Riff-Akten · Zugangsaufkleber · an den grauen Linien schneiden")

        k = i % pro_seite
        sp, ze = k % spalten, k // spalten
        x = rand_x + sp * br
        y = seite_ho - rand_o - (ze + 1) * ho
        zeichne_aufkleber(c, x, y, br, ho, kind["vorname"], kind["code"], kind["url"], muster)

    c.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://setsna.github.io/riff-akten/",
                    help="Basisadresse der Kinder-App (Vorgabe: https://setsna.github.io/riff-akten/)")
    ap.add_argument("--namen", required=True, help="Textdatei, ein Vorname pro Zeile")
    ap.add_argument("--out", default=STANDARD_AUS, help="Ausgabeordner (Vorgabe: Dateien/Zugangscodes)")
    ap.add_argument("--muster", action="store_true", help="Als Musterbogen kennzeichnen")
    ap.add_argument("--codes", help="Vorhandene zugangscodes.csv weiterverwenden, statt neue Codes zu würfeln")
    a = ap.parse_args()

    # Schutz: Codes nie ins Repository schreiben.
    aus = os.path.realpath(a.out)
    if aus == REPO or aus.startswith(REPO + os.sep):
        sys.exit("Der Ausgabeordner liegt in repo/. Die Codes gehören nicht ins Repository – "
                 "bitte einen Ordner außerhalb wählen (Vorgabe: Dateien/Zugangscodes).")

    basis = a.url if a.url.endswith("/") else a.url + "/"
    namen = [z.strip() for z in open(a.namen, encoding="utf-8") if z.strip()]
    if not namen:
        sys.exit("Keine Namen gefunden.")

    alt = {}
    if a.codes:
        with open(a.codes, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f, delimiter=";"):
                alt[r["Vorname"]] = r["Code"].replace("-", "").upper()

    vergeben, kinder, fehlend = set(alt.values()), [], []
    for n in namen:
        code = alt.get(n)
        if not code:
            if a.codes:
                fehlend.append(n)
            code = neuer_code(vergeben)
        kinder.append({"vorname": n, "code": code, "url": basis + "#c=" + code})
    if fehlend:
        print("Neue Codes vergeben für:", ", ".join(fehlend))

    # Jeden QR-Code gegenlesen
    fehler = [k["vorname"] for k in kinder if not qr_pruefen(qr_matrix(k["url"]), k["url"])]
    if fehler:
        sys.exit("QR-Code nicht lesbar für: " + ", ".join(fehler))

    os.makedirs(a.out, exist_ok=True)
    bogen(os.path.join(a.out, "aufkleber.pdf"), kinder, basis, a.muster)

    with open(os.path.join(a.out, "zugangscodes.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Vorname", "Code", "Link"])
        for k in kinder:
            w.writerow([k["vorname"], k["code"][:4] + "-" + k["code"][4:], k["url"]])

    with open(os.path.join(a.out, "kinder.json"), "w", encoding="utf-8") as f:
        json.dump([{"vorname": k["vorname"], "code": k["code"]} for k in kinder], f,
                  ensure_ascii=False, indent=2)

    print(f"{len(kinder)} Aufkleber erzeugt, alle QR-Codes gegengelesen und in Ordnung.")


if __name__ == "__main__":
    main()
