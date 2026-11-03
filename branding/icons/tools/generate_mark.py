#!/usr/bin/env python3
"""
SakaKrib mark generator: a calligraphic italic S in front of a hand-sketched house.

The S is a *variable-width outline*, not a stroked line. A centre-line (tangent-continuous Bezier
chain) is offset left and right by a width that depends on the stroke direction, like a broad-nib
pen held at a fixed angle: thick on the diagonal spine, fine on the pointed ends. The house is
pencil-style line work with deterministic jitter, so every run produces identical files.

Usage (repo root, standard library only):
    python3 branding/icons/tools/generate_mark.py

Writes:
    branding/icons/source/sakakrib-mark.svg, sakakrib-logo-light.svg, sakakrib-logo-dark.svg
    branding/icons/android/adaptive-icon-foreground.svg, notification-icon.svg
    public/favicon.svg
    src/components/brand/brandMarkData.ts          (path data for the animated splash)

Then run `npm run generate:icons` to rebuild the Android/iOS PNGs from those SVGs.
Tweak the numbers in the CONFIG block below (lean, pen width, pen angle, house scale) and rerun.
"""
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ICONS = ROOT / "branding" / "icons"

# ------------------------------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------------------------------
LEAN = -11          # italic slant in degrees (negative leans the top to the right)
PEN_MAX = 100       # widest stroke (the spine)
PEN_MIN = 12        # finest stroke
PEN_ANGLE = -35     # broad-nib angle; steeper = more contrast on the diagonals
END_TAPER = 0.16    # fraction of the length over which each end tapers to a point
HOUSE_STROKE = 9.5  # pencil line width on the full-size mark
HOUSE_OPACITY = 0.42
HOUSE_SEED = 7
BRAND = {"primary": "#0C3B2E", "paper": "#FFF6E3"}

# Centre-line of the S (upright, 1024 box, y down). Every join shares a tangent direction.
SEGS = [
    ((722, 300), (712, 248), (640, 205), (530, 205)),   # top terminal, over the top
    ((530, 205), (420, 205), (340, 258), (346, 345)),   # down the upper bowl
    ((346, 345), (352, 440), (440, 478), (540, 512)),   # across the spine
    ((540, 512), (640, 548), (700, 596), (692, 676)),   # down the lower bowl
    ((692, 676), (684, 762), (600, 820), (500, 820)),   # round the bottom
    ((500, 820), (400, 820), (310, 775), (262, 700)),   # out to the bottom terminal
]


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


# ------------------------------------------------------------------------------------------
# The S
# ------------------------------------------------------------------------------------------
def _bez(seg, t):
    a, b, c, d = seg
    u = 1 - t
    return tuple(u**3 * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t**3 * d[i] for i in range(2))


def _dbez(seg, t):
    a, b, c, d = seg
    u = 1 - t
    return tuple(3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]) for i in range(2))


def _smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def skewed_segments(lean=LEAN):
    t = math.tan(math.radians(lean))
    return [tuple((p[0] + (p[1] - 512) * t, p[1]) for p in s) for s in SEGS]


def s_outline(pen_max=PEN_MAX, pen_min=PEN_MIN, tip=0.06, taper=END_TAPER, n_per=60, smooth_win=14):
    """Return (left, right) edge points of the variable-width S, before centring."""
    segs = skewed_segments()
    pts = []
    for s in segs:
        for i in range(n_per):
            pts.append((_bez(s, i / n_per), _dbez(s, i / n_per)))
    pts.append((_bez(segs[-1], 1.0), _dbez(segs[-1], 1.0)))

    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.dist(pts[i][0], pts[i - 1][0]))
    total = arc[-1]

    nib = math.radians(PEN_ANGLE)
    raw = [pen_min + (pen_max - pen_min) * abs(math.sin(math.atan2(d[1], d[0]) - nib)) ** 1.2 for _, d in pts]
    wsm = []
    for i in range(len(raw)):  # moving average: no kinks where the pen angle changes quickly
        lo, hi = max(0, i - smooth_win), min(len(raw), i + smooth_win + 1)
        wsm.append(sum(raw[lo:hi]) / (hi - lo))

    left, right = [], []
    for (p, d), a, w in zip(pts, arc, wsm):
        u = a / total
        w *= max(tip, _smoothstep(u / taper) * _smoothstep((1 - u) / taper))
        w = max(w, pen_min * 0.5)
        n = math.hypot(d[0], d[1]) or 1
        nx, ny = -d[1] / n, d[0] / n
        left.append((p[0] + nx * w / 2, p[1] + ny * w / 2))
        right.append((p[0] - nx * w / 2, p[1] - ny * w / 2))
    return left, right


def _bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def _ring_to_path(ring):
    """Closed Catmull-Rom spline through the ring, written as cubic Beziers."""
    n = len(ring)
    d = f"M{f(ring[0][0])} {f(ring[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = ring[(i - 1) % n], ring[i], ring[(i + 1) % n], ring[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + "Z"


def build_s(fit=None, **kw):
    """Centre the S on (512,512). `fit` rescales so the longest side equals that many units."""
    left, right = s_outline(**kw)
    x0, y0, x1, y1 = _bbox(left + right)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    k = 1.0 if fit is None else fit / max(x1 - x0, y1 - y0)
    tf = lambda p: ((p[0] - cx) * k + 512, (p[1] - cy) * k + 512)
    left, right = [tf(p) for p in left], [tf(p) for p in right]
    step = 3
    L = left[::step] + ([left[-1]] if (len(left) - 1) % step else [])
    R = right[::step] + ([right[-1]] if (len(right) - 1) % step else [])
    ring = L + R[::-1]
    # centre-line (for the splash write-on reveal), same transform
    segs = [tuple(tf(p) for p in s) for s in skewed_segments()]
    cl = f"M{f(segs[0][0][0])} {f(segs[0][0][1])}" + "".join(
        f" C{f(s[1][0])} {f(s[1][1])} {f(s[2][0])} {f(s[2][1])} {f(s[3][0])} {f(s[3][1])}" for s in segs
    )
    return {"d": _ring_to_path(ring), "centerline": cl, "bbox": _bbox(ring), "ring": ring}


# ------------------------------------------------------------------------------------------
# The house (pencil sketch)
# ------------------------------------------------------------------------------------------
def _sketch_line(a, b, rng, over=(5, 15), bow=4.0):
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy) or 1
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux
    o1, o2 = rng.uniform(*over), rng.uniform(*over)
    j = lambda: rng.uniform(-2.5, 2.5)
    p0 = (a[0] - ux * o1 + j(), a[1] - uy * o1 + j())
    p1 = (b[0] + ux * o2 + j(), b[1] + uy * o2 + j())
    k = rng.uniform(-bow, bow)
    c = ((p0[0] + p1[0]) / 2 + nx * k, (p0[1] + p1[1]) / 2 + ny * k)
    return f"M{f(p0[0])} {f(p0[1])}Q{f(c[0])} {f(c[1])} {f(p1[0])} {f(p1[1])}", [p0, p1]


def _sketch_arc(cx, cy, r, a0, a1, rng, n=4):
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        rr = r + rng.uniform(-2.5, 2.5)
        pts.append((cx + rr * math.cos(a), cy - rr * math.sin(a)))
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(1, len(pts)):
        m = ((pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2)
        d += (f"Q{f(pts[i - 1][0])} {f(pts[i - 1][1])} {f(m[0])} {f(m[1])}" if i < len(pts) - 1
              else f"T{f(pts[i][0])} {f(pts[i][1])}")
    return d, pts


def house_strokes(seed=HOUSE_SEED):
    """Return ([path d, ...], [points]) with one entry per pencil pass, in drawing order."""
    rng = random.Random(seed)
    A, E1, E2 = (512, 140), (140, 430), (884, 430)
    wl, wr, top, gnd = 222, 802, 430, 868
    slope = (E2[1] - A[1]) / (E2[0] - A[0])
    roof_y = lambda x: A[1] + (x - A[0]) * slope
    paths, pts = [], []

    def line(a, b, passes=2, **kw):
        for _ in range(passes):
            d, p = _sketch_line(a, b, rng, **kw)
            paths.append(d)
            pts.extend(p)

    line(A, E1)
    line(A, E2)
    line((A[0], A[1] + 46), (E1[0] + 62, E1[1] - 2), passes=1)
    line((A[0], A[1] + 46), (E2[0] - 62, E2[1] - 2), passes=1)
    line((wl, top + 14), (wl, gnd))
    line((wr, top + 14), (wr, gnd))
    line((100, gnd), (924, gnd))
    line((130, gnd + 26), (860, gnd + 26), passes=1, over=(2, 8))
    cl, cr, ct = 690, 756, 196
    line((cl, roof_y(cl) - 4), (cl, ct))
    line((cl - 10, ct), (cr + 10, ct), passes=1, over=(2, 6))
    line((cr, ct), (cr, roof_y(cr) - 4))
    dl, dr, dtop = 262, 392, 640
    line((dl, gnd), (dl, dtop + 40), passes=1)
    line((dr, gnd), (dr, dtop + 40), passes=1)
    d, p = _sketch_arc((dl + dr) / 2, dtop + 40, (dr - dl) / 2, 180, 0, rng)
    paths.append(d)
    pts.extend(p)
    line((dr - 24, 770), (dr - 24, 776), passes=1, over=(2, 3))
    wx0, wy0, wx1, wy1 = 614, 560, 736, 682
    for a, b in [((wx0, wy0), (wx1, wy0)), ((wx1, wy0), (wx1, wy1)), ((wx1, wy1), (wx0, wy1)), ((wx0, wy1), (wx0, wy0)),
                 (((wx0 + wx1) / 2, wy0), ((wx0 + wx1) / 2, wy1)), ((wx0, (wy0 + wy1) / 2), (wx1, (wy0 + wy1) / 2))]:
        line(a, b, passes=1)
    return paths, pts


# ------------------------------------------------------------------------------------------
# SVG assembly
# ------------------------------------------------------------------------------------------
CSS = ("/* Default brand colours. generate-icons.mjs overrides these from brand.json. */"
       ".fill-primary{fill:#0C3B2E}.fill-accent{fill:#F5A524}.fill-paper{fill:#FFF6E3}.fill-white{fill:#FFFFFF}"
       ".stroke-primary{stroke:#0C3B2E}.stroke-accent{stroke:#F5A524}.stroke-paper{stroke:#FFF6E3}.stroke-white{stroke:#FFFFFF}")


def svg_doc(title, desc, w, h, body, viewbox=None):
    vb = viewbox or f"0 0 {w} {h}"
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img">\n'
            f"  <title>{title}</title>\n  <desc>{desc}</desc>\n  <style>{CSS}</style>\n  {body}\n</svg>\n")


def mark_group(colour, s, house=True, house_scale=1.0, house_stroke=HOUSE_STROKE, house_opacity=HOUSE_OPACITY):
    out = ""
    if house:
        paths, _ = house_strokes()
        inner = (f'<g fill="none" class="stroke-{colour}" stroke-opacity="{house_opacity}" '
                 f'stroke-width="{f(house_stroke / house_scale)}" stroke-linecap="round" stroke-linejoin="round">'
                 f'<path d="{"".join(paths)}"/></g>')
        if house_scale != 1.0:
            inner = f'<g transform="translate(512 512) scale({house_scale}) translate(-512 -512)">{inner}</g>'
        out += inner
    return out + f'<path class="fill-{colour}" d="{s["d"]}"/>'


def write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def read_wordmark():
    text = (ICONS / "source" / "sakakrib-wordmark.svg").read_text(encoding="utf-8")
    d = re.search(r'<path class="fill-primary" d="([^"]+)"', text).group(1)
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', text).group(1).split()]
    return d, vb


def main():
    s = build_s()
    house_paths, house_pts = house_strokes()
    hx0, hy0, hx1, hy1 = _bbox(house_pts)
    sx0, sy0, sx1, sy1 = s["bbox"]
    mx0, my0, mx1, my1 = min(hx0, sx0) - HOUSE_STROKE, min(hy0, sy0) - HOUSE_STROKE, max(hx1, sx1) + HOUSE_STROKE, max(hy1, sy1) + HOUSE_STROKE

    # farthest point of the S from the canvas centre; adaptive icons keep art inside radius 313 after 88% scale
    far = max(math.dist(p, (512, 512)) for p in s["ring"])
    print(f"S extent from centre: {far:.0f} (limit {313 / 0.88:.0f} before the 88% foreground scale)")

    # 1) symbol alone, for light backgrounds
    write(ICONS / "source" / "sakakrib-mark.svg", svg_doc(
        "SakaKrib mark",
        "A calligraphic italic S in front of a hand-sketched house.",
        1024, 1024, mark_group("primary", s)))

    # 2) horizontal logos
    wd, wvb = read_wordmark()
    H = 574
    k = (H - 56) / (my1 - my0)
    tx, ty = 40 - mx0 * k, H / 2 - (my0 + my1) / 2 * k
    mark_w = (mx1 - mx0) * k
    wx = 40 + mark_w + 44
    wy = H / 2 - (wvb[1] + wvb[3] / 2)
    W = round(wx + wvb[2] + 40)
    for name, colour, label in (("light", "primary", "light"), ("dark", "paper", "dark")):
        body = (f'<g transform="translate({f(tx)} {f(ty)}) scale({k:.4f})">{mark_group(colour, s)}</g>'
                f'<g transform="translate({f(wx - wvb[0])} {f(wy)})"><path class="fill-{colour}" d="{wd}"/></g>')
        write(ICONS / "source" / f"sakakrib-logo-{name}.svg", svg_doc(
            f"SakaKrib logo (for {label} backgrounds)",
            "SakaKrib horizontal logo: the italic S in front of a sketched house, followed by the wordmark (outlined).",
            W, H, body))

    fg_scale = 0.88 * min(1.0, 313 / (0.88 * far))   # shrink further if the S would leave the 66dp safe zone
    # 3) Android adaptive foreground: 88% scale for the safe zone; house kept small and inside it
    write(ICONS / "android" / "adaptive-icon-foreground.svg", svg_doc(
        "SakaKrib adaptive icon foreground",
        "108dp layer. Art is scaled to stay inside the 66dp centre safe zone (radius 313 of 1024).",
        1024, 1024,
        f'<g transform="translate(512 512) scale({fg_scale:.3f}) translate(-512 -512)">'
        f'{mark_group("paper", s, house_scale=0.8, house_stroke=14, house_opacity=0.4)}</g>'))

    # 4) notification icon: solid white silhouette, S only, heavier pen so it holds at 24px
    n = build_s(fit=840, pen_max=120, pen_min=36, tip=0.16, taper=0.22)
    write(ICONS / "android" / "notification-icon.svg", svg_doc(
        "SakaKrib notification small icon",
        "Single-colour white silhouette of the italic S on a transparent background, about 82 percent of the canvas.",
        1024, 1024, f'<path class="fill-white" d="{n["d"]}"/>'))

    # 5) favicon: S only on the brand tile, readable at 16px
    fav = build_s(fit=600, pen_max=125, pen_min=28, tip=0.16, taper=0.2)
    write(ROOT / "public" / "favicon.svg",
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>Saka Krib</title>'
          f'<rect width="1024" height="1024" rx="230" fill="{BRAND["primary"]}"/>'
          f'<path d="{fav["d"]}" fill="{BRAND["paper"]}"/></svg>\n')

    # 6) data for the animated splash screen
    ts = (
        "// GENERATED by branding/icons/tools/generate_mark.py. Do not edit by hand.\n"
        f"export const BRAND_S_PATH = {s['d']!r};\n"
        f"export const BRAND_S_CENTERLINE = {s['centerline']!r};\n"
        f"export const BRAND_HOUSE_PATHS: string[] = {house_paths!r};\n"
        f"export const BRAND_WORDMARK_PATH = {wd!r};\n"
        f"export const BRAND_WORDMARK_VIEWBOX = {' '.join(f'{v:g}' for v in wvb)!r};\n"
        f"export const BRAND_MARK_BOX = {{ x: {f(mx0)}, y: {f(my0)}, width: {f(mx1 - mx0)}, height: {f(my1 - my0)} }};\n"
    )
    write(ROOT / "src" / "components" / "brand" / "brandMarkData.ts", ts)


if __name__ == "__main__":
    main()
