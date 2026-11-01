"""
The nine scenes. Each one draws a single frame at scene-local time `t`.

`beat` / `bt` are the current narration line and the seconds spent in it; the
picture cuts on line boundaries, so what you hear is what you see.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import render as R
from render import (  # noqa: E402
    CX,
    H,
    INK,
    INK_FAINT,
    INK_SOFT,
    PAPER,
    PAPER_BRIGHT,
    RED,
    RED_BRIGHT,
    RED_DEEP,
    TEAL,
    W,
    arrow,
    card,
    cn,
    cnb,
    draw_art,
    draw_shot,
    fade_out,
    label,
    mp_mask,
    paste_masked,
    project_factory,
    ramp,
    serif,
    text,
    text_width,
)

TOOLS = Path(__file__).resolve().parent.parent / "tools"
sys.path.insert(0, str(TOOLS))

LEVELS = R.LEVELS
FOLDS = R.FOLDS
HEROES = R.HEROES
MARGINS = R.MARGINS
GOLD = (201, 164, 106)
GOLD_SOFT = (227, 207, 174)


# --------------------------------------------------------------------------
# small shared pieces
# --------------------------------------------------------------------------
def title_block(d, s, sub=None, y=186, size=74, sub_size=26, x=96, color=INK):
    text(d, (x, y), s, cnb(size), color)
    if sub:
        text(d, (x, y + size + 22), sub, cn(sub_size), INK_SOFT, tracking=0.6)


def formula_png(name: str, width: int) -> Image.Image:
    """Rasterise a compiled LaTeX formula (same source the site ships)."""
    cache = R.GEN / f"formula-{name}-{width}.png"
    if not cache.exists():
        import svgprobe as SP  # tools/svgprobe.py

        svg = SP.read_svg(name)
        vb = SP.parse_viewbox(svg)
        subs = SP.collect_paths(svg)
        vx, vy, vw, vh = vb
        scale = width / vw
        height = max(1, int(round(vh * scale)))
        px = SP.fill_polygons(subs, width, height, vb, scale, ss=2)
        im = Image.frombytes("L", (width, height), bytes(px))
        im.save(cache)
    im = Image.open(cache).convert("L")
    alpha = im.point(lambda v: 255 - v)
    out = Image.new("RGBA", im.size, INK + (0,))
    out.putalpha(alpha)
    return out


def put(img, im, xy, color=INK, alpha=255):
    layer = Image.new("RGBA", im.size, color + (0,))
    layer.putalpha(im.split()[3].point(lambda v: int(v * alpha / 255)) if alpha < 255 else im.split()[3])
    img.alpha_composite(layer, (int(xy[0]), int(xy[1])))


def dashes(d, pts, color, width=3, dash=12, gap=9, upto=1.0):
    """Draw a dashed polyline, optionally only the first `upto` fraction."""
    segs = []
    total = 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        segs.append((a, b, L))
        total += L
    budget = total * upto
    walked = 0.0
    phase = 0.0
    for a, b, L in segs:
        if walked > budget:
            break
        steps = max(1, int(L / 6))
        for k in range(steps):
            t0 = k / steps
            t1 = min(1.0, (k + 1) / steps)
            d0 = (walked + L * t0) / (dash + gap)
            on = (walked + L * t0) % (dash + gap) < dash
            if on and walked + L * t0 <= budget:
                p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
                p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
                d.line([p0, p1], fill=color, width=width)
        walked += L


def clip_line(cx, cy, half, direction, offset):
    """Endpoints of the line through (cx, cy) inside a screen-space square."""
    dx, dy = direction
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    # distance from the centre along the normal
    nx, ny = -dy, dx
    px, py = cx + nx * offset * half, cy + ny * offset * half
    ts = []
    for coord, dcoord in ((px - (cx - half), dx), (px - (cx + half), dx), (py - (cy - half), dy), (py - (cy + half), dy)):
        if abs(dcoord) > 1e-9:
            ts.append(coord / dcoord)
    return (px + dx * min(ts), py + dy * min(ts)), (px + dx * max(ts), py + dy * max(ts))


def path_head(paths, frac: float):
    """Point at fraction `frac` along a list of polylines, by arc length."""
    total = 0.0
    lengths = []
    for pts in paths:
        L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
        lengths.append(L)
        total += L
    if total <= 1e-6:
        return None
    want = max(0.0, min(1.0, frac)) * total
    for pts, L in zip(paths, lengths):
        if want <= L:
            walked = 0.0
            for i in range(len(pts) - 1):
                seg = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                if walked + seg >= want:
                    k = (want - walked) / max(seg, 1e-9)
                    return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k)
                walked += seg
        want -= L
    return None


def ring_points(poly, scale, ox, oy, matrix=None):
    f = project_factory(scale, ox, oy, matrix)
    return [[f(p) for p in ring] for ring in poly]


# --------------------------------------------------------------------------
# 序：fold → cut → unfold
# --------------------------------------------------------------------------
def scene_open(img, d, t, beat, bt, sc):
    hero = HEROES["grand-rosette"]
    preset = FOLDS["radial8"]

    if t < 2.0:
        f = ramp(t, 0.25, 2.05)
    elif t < 3.95:
        f = 1.0
    else:
        f = 1 - ramp(t, 3.98, 6.60)

    # Camera: pull back for the whole sheet, push in for the folded packet.
    pk = preset["packet"]
    xs = [p["x"] for p in pk]
    ys = [p["y"] for p in pk]
    pcx, pcy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    pack_scale = 620 / max(max(xs) - min(xs), max(ys) - min(ys), 1e-6)
    sheet_scale = 330
    a_title = ramp(t, 6.35, 7.15)
    scale = (sheet_scale + (pack_scale - sheet_scale) * f) * (1 - 0.17 * a_title)
    ox = CX - pcx * scale * f
    oy = 392 + pcy * scale * f - 26 * a_title

    mats = [R.patch_matrix(hero, p, f) for p in hero["patches"]]

    # The sheet: every patch domain, folded. Nothing has been cut yet.
    solid = Image.new("L", (W, H), 0)
    for p, m in zip(hero["patches"], mats):
        dom = mp_mask([[p["domain"]]], project_factory(scale, ox, oy, m))
        solid = Image.composite(dom, solid, dom)

    cut_mask = Image.new("L", (W, H), 0)
    for p, m in zip(hero["patches"], mats):
        if not p["removed"]:
            continue
        rm = mp_mask(p["removed"], project_factory(scale, ox, oy, m))
        cut_mask = Image.composite(rm, cut_mask, rm)

    cut_k = ramp(t, 2.45, 3.30)
    if cut_k > 0:
        solid = ImageChops.subtract(solid, cut_mask.point(lambda v: int(v * cut_k)))

    R.drop_shadow(img, solid, dy=16, blur=26, opacity=62)
    paste_masked(img, solid, RED)
    if 0.04 < f < 0.96:
        # Layer edges, only mid-motion: the stack reads as separate sheets while
        # it turns, and the seams disappear when the paper lands flat.
        edge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ed = ImageDraw.Draw(edge)
        for p, m in zip(hero["patches"], mats):
            for poly in p["region"]:
                for ring in poly:
                    pts = [project_factory(scale, ox, oy, m)(q) for q in ring]
                    if len(pts) > 2:
                        ed.line(pts + [pts[0]], fill=(255, 253, 248, 120), width=2)
        img.alpha_composite(edge)

    # The cut: D is the region removed inside the packet. patch s0 is the
    # identity layer, so its `removed` *is* D in packet coordinates. Trace its
    # boundary and take the paper away behind the moving head — which is what
    # the scissors physically do.
    if 2.25 < t < 3.95:
        d_rings = [ring for poly in hero["patches"][0]["removed"] for ring in poly]
        d_rings.sort(key=lambda r: -abs(sum(r[i]["x"] * r[(i + 1) % len(r)]["y"] - r[(i + 1) % len(r)]["x"] * r[i]["y"]
                                             for i in range(len(r)))))
        prog = ramp(t, 2.30, 3.30)
        for ring in d_rings:
            pts = [(ox + q["x"] * scale, oy - q["y"] * scale) for q in ring]
            dashes(d, pts + [pts[0]], (255, 253, 248, 225), width=3, dash=10, gap=7, upto=prog)
        head = path_head([[(ox + q["x"] * scale, oy - q["y"] * scale) for q in ring] for ring in d_rings], prog)
        if head and 0.02 < prog < 0.995:
            d.ellipse([head[0] - 13, head[1] - 13, head[0] + 13, head[1] + 13], fill=(255, 253, 248, 245))
            d.ellipse([head[0] - 7, head[1] - 7, head[0] + 7, head[1] + 7], fill=(216, 74, 73, 245))

    a = a_title
    if a > 0:
        k = int(255 * a)
        text(d, (CX, 700), "Foldyssey", serif(94, bold=True), INK + (k,), anchor="ma")
        text(d, (CX, 818), "一 刀 万 象", cnb(32), (157, 43, 57, k), anchor="ma", tracking=6)
        text(d, (CX, 872), "FOLD · SNIP · UNFOLD · WOW", cn(16), (138, 141, 134, k), anchor="ma", tracking=4)


# --------------------------------------------------------------------------
# 01 定理
# --------------------------------------------------------------------------
def _mini_square(d, box, color=(36, 39, 37, 40)):
    x0, y0, x1, y1 = box
    d.rectangle([x0, y0, x1, y1], outline=color, width=2)


def scene_theorem(img, d, t, beat, bt, sc):
    panel_w, panel_h = 480, 430
    xs = [134, 720, 1306]
    top = 300

    if beat <= 2:
        title_block(d, "折剪定理", "FOLD-AND-CUT THEOREM  ·  SODA 1999 / LNCS 1763", y=150, size=64, sub_size=21)
        if beat <= 1:
            a = int(255 * ramp(bt, 0.1, 0.7))
            text(d, (96, 300), "为什么一张纸能剪出这么复杂的图案？", cnb(40), INK + (a,))
            text(d, (96, 372), "一九九九年，三个人给出了完整的回答。", cn(26), INK_SOFT + (a,))
            for i, (name, role) in enumerate(
                [("Erik D. Demaine", "MIT"), ("Martin L. Demaine", "MIT"), ("Anna Lubiw", "University of Waterloo")]
            ):
                kk = ramp(bt, 0.5 + i * 0.35, 1.0 + i * 0.35)
                aa = int(255 * kk)
                y = 470 + i * 92
                d.line([96, y - 14, 1824, y - 14], fill=(36, 39, 37, int(20 * kk)), width=2)
                text(d, (96, y + 4), name, serif(40, bold=True), INK + (aa,))
                text(d, (760, y + 14), role, cn(20), INK_FAINT + (aa,))
            text(d, (96, 800), "Folding and Cutting Paper.  JCDCG'98, LNCS 1763, Springer, 2000: 104–117.",
                 cn(19), INK_FAINT + (int(255 * ramp(bt, 1.6, 2.2)),), tracking=0.3)
            return

        steps = [
            ("① 任意一族直线段", "any collection of straight edges"),
            ("② 存在一种平折 + 一条直线", "there exists a flat folding and a line"),
            ("③ 一刀剪出", "cutting along it gives the pattern of cuts"),
        ]
        for i, (cn_s, en_s) in enumerate(steps):
            k = ramp(bt, 0.15 + i * 0.55, 0.75 + i * 0.55)
            if k <= 0:
                continue
            a = int(255 * k)
            x0 = xs[i]
            card(img, (x0, top, x0 + panel_w, top + panel_h), radius=16, fill=PAPER_BRIGHT + (a,))
            text(d, (x0 + 26, top + 24), cn_s, cnb(25), INK + (a,))
            text(d, (x0 + 26, top + 62), en_s, cn(15), INK_FAINT + (a,), tracking=0.8)
            inner = (x0 + 40, top + 108, x0 + panel_w - 40, top + panel_h - 26)
            side = min(inner[2] - inner[0], inner[3] - inner[1])
            cx = (inner[0] + inner[2]) / 2
            cy = (inner[1] + inner[3]) / 2
            s = side / 2 * 0.86
            _mini_square(d, (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2), (36, 39, 37, int(46 * k)))
            lvl = [l for l in LEVELS if l["id"] == "octagram"][0]
            if i == 0:
                draw_art(img, lvl["target"], s, cx, cy, RED, shadow=False, alpha=a)
            elif i == 1:
                draw_art(img, lvl["target"], s, cx, cy, RED, shadow=False, alpha=int(70 * k))
                for c in FOLDS["radial8"]["creases"]:
                    d.line([cx + c["from"]["x"] * s, cy - c["from"]["y"] * s,
                            cx + c["to"]["x"] * s, cy - c["to"]["y"] * s],
                           fill=(201, 164, 106, int(200 * k)), width=2)
                c0, c1 = clip_line(cx, cy, s, (1.0, 0.82), 0.34)
                d.line([c0, c1], fill=(157, 43, 57, int(230 * k)), width=4)
            else:
                draw_art(img, lvl["target"], s, cx, cy, RED, shadow=False, alpha=a)
        for i in range(2):
            ax = xs[i] + panel_w + 12
            k = ramp(bt, 0.9 + i * 0.55, 1.3 + i * 0.55)
            if k > 0:
                arrow(d, (ax, top + panel_h / 2), (ax + 46, top + panel_h / 2), color=(138, 141, 134, int(200 * k)), width=2)
        return

    if beat == 3:
        fade = ramp(bt, 0, 0.5)
        a = int(255 * fade)
        text(d, (96, 250), "定理说的是：", cn(30), INK_SOFT + (a,))
        yy = 326
        x = 96
        f = cnb(46)
        parts = [("给定任意一族直线段，都存在", INK), ("一种平折方式", (157, 43, 57)), ("，以及该折叠下的一条直线，沿它剪一刀，恰好得到这组直线段构成的剪口图案。", INK)]
        for seg, col in parts:
            for ch in seg:
                if x + text_width(d, ch, f) > 1620:
                    x = 96
                    yy += 78
                d.text((x, yy), ch, font=f, fill=col + (a,))
                x += text_width(d, ch, f)
        text(d, (96, yy + 96),
             "E. D. Demaine, M. L. Demaine, A. Lubiw.  Folding and Cutting Paper.  JCDCG'98, LNCS 1763, 2000: 104–117.",
             cn(19), INK_FAINT + (a,), tracking=0.4)
        return

    f = ramp(bt, 0.05, 0.7)
    a = int(255 * f)
    text(d, (96, 196), "定理保证剪得出来，不等于你折得出来。", cnb(58), INK + (a,))
    rows = [
        ("定理", "存在某种平折", "折痕可以是任意直线、任意角度", (36, 39, 37)),
        ("你", "手上只有纸和剪刀", "折得出来，才算数", (86, 91, 86)),
        ("Foldyssey", "五种固定折法", "目标库 = 这五种折法的像", (157, 43, 57)),
    ]
    for i, (who, what, why, col) in enumerate(rows):
        k = ramp(bt, 0.35 + i * 0.45, 0.9 + i * 0.45)
        aa = int(255 * k)
        y = 344 + i * 200
        d.line([96, y - 26, 1824, y - 26], fill=(36, 39, 37, int(26 * k)), width=2)
        text(d, (96, y + 6), who, cnb(30), col + (aa,))
        text(d, (420, y), what, cnb(44), INK + (aa,))
        text(d, (420, y + 62), why, cn(24), INK_SOFT + (aa,))


# --------------------------------------------------------------------------
# 02 作品
# --------------------------------------------------------------------------
def scene_product(img, d, t, beat, bt, sc):
    title_block(d, "一座可以玩的数字折剪纸实验室", "FOLD  ·  SNIP  ·  UNFOLD", y=150, size=56, sub_size=20)

    steps = [
        ("折", "把纸折成 8 层", "五种折法，每层都有确定的等距映射"),
        ("剪", "在纸包上下一刀", "直线 / 折剪 / 镂空 / 曲线，四种原语"),
        ("展", "把结果摊开", "图案由几何算出来，不是贴上去的"),
    ]
    for i, (ch, head, sub) in enumerate(steps):
        k = ramp(t, 0.6 + i * 1.0, 1.4 + i * 1.0)
        aa = int(255 * k)
        y = 330 + i * 190
        d.ellipse([96, y - 6, 176, y + 74], outline=(185, 54, 69, aa), width=3)
        text(d, (136, y + 6), ch, cnb(40), (157, 43, 57, aa), anchor="ma")
        text(d, (204, y - 4), head, cnb(34), INK + (aa,))
        text(d, (204, y + 48), sub, cn(21), INK_SOFT + (aa,))
        if i < 2:
            d.line([136, y + 82, 136, y + 150], fill=(201, 164, 106, int(150 * k)), width=2)

    # the app itself
    k = ramp(t, 2.0, 3.0)
    if k > 0:
        draw_shot(img, "01-home.png", (700, 206, 1800, 900), radius=18, alpha=int(255 * k), fit="contain")

    chips = ["免登录", "免下载", "可离线", "作品存在本地"]
    for i, s in enumerate(chips):
        k2 = ramp(t, 4.4 + i * 0.22, 4.9 + i * 0.22)
        if k2 <= 0:
            continue
        w = text_width(d, s, cn(22)) + 34
        x = 96 + sum(text_width(d, c, cn(22)) + 34 + 14 for c in chips[:i])
        d.rounded_rectangle([x, 838, x + w, 888], 999, fill=(255, 253, 248, int(230 * k2)),
                            outline=(201, 164, 106, int(180 * k2)), width=2)
        d.text((x + 17, 848), s, font=cn(22), fill=(86, 91, 86, int(255 * k2)))


# --------------------------------------------------------------------------
# 03 原理
# --------------------------------------------------------------------------
def scene_math(img, d, t, beat, bt, sc):
    hero = HEROES["grand-rosette"]
    title_block(d, "一刀，为什么能算出图案", "THE WHOLE MODEL IN ONE LINE", y=140, size=54, sub_size=19)

    sx, sy, s = 470, 520, 232          # the sheet
    px, py, ps = 1330, 500, 250        # the folded packet

    def sheet_polys():
        sq = [{"x": -1, "y": -1}, {"x": 1, "y": -1}, {"x": 1, "y": 1}, {"x": -1, "y": 1}]
        return [[sq]]

    def draw_sheet(alpha=255, removed_alpha=0):
        m = mp_mask(sheet_polys(), project_factory(s, sx, sy))
        R.drop_shadow(img, m, dy=14, blur=22, opacity=55)
        paste_masked(img, m, PAPER_BRIGHT, alpha)
        d.rectangle([sx - s, sy - s, sx + s, sy + s], outline=(36, 39, 37, 60), width=2)
        # the eight creases of D4
        for c in FOLDS["radial8"]["creases"]:
            d.line([sx + c["from"]["x"] * s, sy - c["from"]["y"] * s,
                    sx + c["to"]["x"] * s, sy - c["to"]["y"] * s], fill=(201, 164, 106, 210), width=2)
        if removed_alpha > 0:
            for p in hero["patches"]:
                if p["removed"]:
                    mm = mp_mask(p["removed"], project_factory(s, sx, sy))
                    paste_masked(img, mm, RED, removed_alpha)

    # beat 0: the sheet and its eight sectors
    k0 = ramp(t, 0.2, 1.0)
    draw_sheet()
    if beat == 0:
        for i in range(8):
            ang = math.radians(22.5 + 45 * i)
            text(d, (sx + math.cos(ang) * s * 0.72, sy - math.sin(ang) * s * 0.72), str(i + 1),
                 cnb(26), (138, 141, 134, int(220 * k0)), anchor="mm")

    # beat 1: eight isometries mapping each sector onto the packet
    if 1 <= beat <= 2:
        k = ramp(t, 0.1, 0.8) if beat == 1 else 1.0
        a = int(255 * k)
        pm = mp_mask([[FOLDS["radial8"]["packet"]]], project_factory(ps, px, py))
        R.drop_shadow(img, pm, dy=14, blur=20, opacity=55)
        paste_masked(img, pm, RED, a)
        if beat == 1:
            arrow(d, (sx + s * 1.04, sy - s * 0.52), (px - ps * 0.78, py - ps * 0.36),
                  color=(201, 164, 106, int(210 * k)), width=3, head=13)
            text(d, (sx + s * 1.06, sy - s * 0.74), "8 个片区 → 8 个保距变换", cn(20), INK_FAINT + (a,))
        text(d, (px, py - ps * 1.28), "纸包", cnb(28), INK + (a,), anchor="ma")
        text(d, (sx, sy + s + 44), "整张纸  P = [−1, 1]²", cn(22), INK_SOFT + (a,), anchor="ma")

    # beat 2: cut D in the packet -> eight pre-images disappear
    if beat == 2:
        k = ramp(bt, 0.1, 0.9)
        a = int(255 * k)
        # highlight D inside the packet
        for p in hero["patches"][:1]:
            pass
        # draw the packet's removed region by pulling one layer's pre-image back
        first = hero["patches"][0]
        fwd = first["folded"]
        inv = {"a": fwd["a"], "b": fwd["b"], "c": fwd["c"], "d": fwd["d"]}
        det = inv["a"] * inv["d"] - inv["b"] * inv["c"]
        inv = {
            "a": inv["d"] / det, "b": -inv["b"] / det, "c": -inv["c"] / det, "d": inv["a"] / det,
        }
        inv["tx"] = -(inv["a"] * fwd["tx"] + inv["b"] * fwd["ty"])
        inv["ty"] = -(inv["c"] * fwd["tx"] + inv["d"] * fwd["ty"])
        dm = mp_mask(first["removed"], project_factory(ps, px, py, inv))
        paste_masked(img, dm, (255, 253, 248), a)
        for poly in first["removed"]:
            for ring in ring_points(poly, ps, px, py, inv):
                if len(ring) > 2:
                    dashes(d, ring + [ring[0]], (157, 43, 57, a), width=3, dash=10, gap=8)
        # the same D pulled back into every sector, in bright red
        for p in hero["patches"]:
            if p["removed"]:
                mm = mp_mask(p["removed"], project_factory(s, sx, sy))
                paste_masked(img, mm, RED_BRIGHT, int(210 * k))
        text(d, (px, py - ps * 1.28), "剪掉 D", cnb(28), (157, 43, 57, a), anchor="ma")
        text(d, (sx, sy + s + 44), "每一层失去的是它自己的原像", cn(22), INK_SOFT + (a,), anchor="ma")

    # beat 3: unfold -> the sheet minus the pre-images
    if beat >= 3:
        k = ramp(bt, 0.0, 0.8) if beat == 3 else 1.0
        a = int(255 * k)
        m = mp_mask(sheet_polys(), project_factory(s, sx, sy))
        paste_masked(img, m, PAPER, a)
        draw_art(img, hero["paper"], s, sx, sy, RED, shadow=False, alpha=a)
        d.rectangle([sx - s, sy - s, sx + s, sy + s], outline=(36, 39, 37, int(60 * k)), width=2)
        text(d, (sx, sy + s + 44), "展开 = 整张纸 减去这八份原像", cn(22), INK_SOFT + (a,), anchor="ma")

    # formula plate
    if beat >= 3:
        k = ramp(bt, 0.6, 1.4) if beat == 3 else 1.0
        if beat == 4:
            k = 1.0
        a = int(255 * k)
        card(img, (96, 792, 1824, 930), radius=14, fill=PAPER_BRIGHT + (a,))
        im = formula_png("unfold", 900)
        if k > 0:
            put(img, im, (150, 816 + int(10 * (1 - k))), INK, a)
        text(d, (1120, 838), "S：展开后的纸", cn(21), INK_SOFT)
        text(d, (1120, 872), "P：整张纸　D：纸包里剪掉的区域", cn(21), INK_SOFT)
        text(d, (1120, 906), "f(i)：第 i 层的保距映射（折叠）", cn(21), INK_SOFT)


# --------------------------------------------------------------------------
# 04 手感
# --------------------------------------------------------------------------
SKILL_LABEL = {"one": "一刀", "two": "两刀", "turn": "拐弯", "curve": "曲线"}
SKILL_COLOR = {"one": RED, "two": (196, 96, 74), "turn": (176, 130, 60), "curve": TEAL}


def scene_levels(img, d, t, beat, bt, sc):
    title_block(d, "十六个关卡，按剪刀能力分四级", "THE SCISSOR LADDER  ·  16 LEVELS  ·  5 STAGES", y=140, size=54, sub_size=19)

    # rungs
    order = ["one", "two", "turn", "curve"]
    counts = {k: sum(1 for l in LEVELS if l["skill"] == k) for k in order}
    for i, k in enumerate(order):
        kk = ramp(t, 0.25 + i * 0.25, 0.8 + i * 0.25)
        if kk <= 0:
            continue
        a = int(255 * kk)
        x = 96 + i * 300
        y = 250
        d.rounded_rectangle([x, y, x + 272, y + 84], 999, fill=(255, 253, 248, int(200 * a / 255)),
                            outline=SKILL_COLOR[k] + (int(160 * kk),), width=2)
        d.ellipse([x + 20, y + 30, x + 44, y + 54], fill=SKILL_COLOR[k] + (a,))
        text(d, (x + 58, y + 22), SKILL_LABEL[k], cnb(30), INK + (a,))
        text(d, (x + 152, y + 30), f"{counts[k]} 关", cn(20), INK_FAINT + (a,))

    if beat <= 1:
        # 16 cards
        for i, lv in enumerate(LEVELS):
            kk = ramp(t, 1.2 + i * 0.06, 1.7 + i * 0.06)
            if kk <= 0:
                continue
            a = int(255 * kk)
            col = i % 8
            row = i // 8
            x = 96 + col * 214
            y = 392 + row * 232
            card(img, (x, y, x + 196, y + 208), radius=12, fill=PAPER_BRIGHT + (a,))
            draw_art(img, lv["target"], 62, x + 98, y + 84, RED, shadow=False, alpha=a)
            text(d, (x + 14, y + 150), str(lv["index"]).zfill(2), cn(16), INK_FAINT + (a,))
            text(d, (x + 46, y + 148), lv["title"], cnb(21), INK + (a,))
            d.rounded_rectangle([x + 14, y + 182, x + 100, y + 202], 999, fill=SKILL_COLOR[lv["skill"]] + (int(40 * kk),))
            text(d, (x + 22, y + 182), SKILL_LABEL[lv["skill"]], cn(14), SKILL_COLOR[lv["skill"]] + (a,))
        return

    # tolerance chart
    k = ramp(bt, 0.0, 0.8)
    a = int(255 * k)
    text(d, (96, 392), "一格滑块，还剩多少 IoU", cnb(32), INK + (a,))
    text(d, (96, 442), "逐关、逐滑块、正反各走一格，取最差", cn(21), INK_SOFT + (a,))

    left, right = 260, 1790
    top, bottom = 580, 850
    lo, hi = 0.93, 1.0

    def ymap(v):
        return bottom - (v - lo) / (hi - lo) * (bottom - top)

    for g in (0.94, 0.96, 0.98, 1.0):
        d.line([left, ymap(g), right, ymap(g)], fill=(36, 39, 37, int(18 * k)), width=1)
        text(d, (left - 18, ymap(g)), f"{int(g*100)}%", cn(18), INK_FAINT + (a,), anchor="rm")

    bw = (right - left) / len(MARGINS)
    worst_i = min(range(len(MARGINS)), key=lambda i: MARGINS[i]["worst"])
    for i, row in enumerate(MARGINS):
        kk = ramp(bt, 0.15 + i * 0.05, 0.55 + i * 0.05) if beat == 2 else 1.0
        aa = int(255 * kk)
        x = left + i * bw + bw * 0.18
        w = bw * 0.64
        y_pass = ymap(row["pass"])
        y_val = ymap(row["worst"])
        d.rectangle([x, y_val, x + w, bottom], fill=SKILL_COLOR[row["skill"]] + (int(160 * kk),))
        d.line([x - 3, y_pass, x + w + 3, y_pass], fill=(36, 39, 37, int(150 * kk)), width=2)
        text(d, (x + w / 2, bottom + 12), str(i + 1).zfill(2), cn(14), INK_FAINT + (aa,), anchor="ma")
        hot = i == worst_i and beat >= 5
        text(d, (x + w / 2, y_val - 10), f"{row['worst']*100:.1f}", cnb(17) if hot else cn(15),
             (157, 43, 57, aa) if hot else INK_SOFT + (aa,), anchor="mb")

    text(d, (right, bottom + 44), "16 个关卡 · 黑色横线为该关的达标线", cn(18), INK_FAINT + (a,), anchor="ra")

    if beat >= 5:
        kk = ramp(bt, 0.1, 0.8)
        aa = int(255 * kk)
        row = MARGINS[worst_i]
        x = left + worst_i * bw + bw / 2
        y = ymap(row["worst"])
        text(d, (x, y - 44), "最差", cn(17), (157, 43, 57, aa), anchor="mb")
        d.line([x, y - 42, x, y - 12], fill=(157, 43, 57, int(160 * kk)), width=2)

    if beat >= 6:
        kk = ramp(bt, 0.1, 0.7)
        a2 = int(255 * kk)
        text(d, (96, 496), "一格滑块，不会让你从「通过」掉到「失败」", cnb(30), (157, 43, 57, a2))


# --------------------------------------------------------------------------
# 05 图案
# --------------------------------------------------------------------------
PATTERN_IDS = ["octagram", "rosette", "grand-rosette", "pearls", "caisson", "diamond-window", "sixfold", "double-petal"]
CURVE_IDS = ["scallop", "swirl", "jar", "lattice"]


def scene_patterns(img, d, t, beat, bt, sc):
    by_id = {l["id"]: l for l in LEVELS}
    if beat <= 3:
        title_block(d, "十六个图案，先有刀法，再有图形", "FORWARD CONSTRUCTION  ·  EVERY TARGET IS SOLVED BY CONSTRUCTION", y=136, size=50, sub_size=18)
        show = PATTERN_IDS
        for i, pid in enumerate(show):
            lv = by_id[pid]
            kk = ramp(t, 0.5 + i * 0.28, 1.1 + i * 0.28)
            if kk <= 0:
                continue
            a = int(255 * kk)
            col, row = i % 4, i // 4
            cx = 300 + col * 440
            cy = 400 + row * 300
            draw_art(img, lv["target"], 118, cx, cy, RED, shadow=True, alpha=a)
            text(d, (cx, cy + 160), lv["title"], cnb(26), INK + (a,), anchor="ma")
            text(d, (cx, cy + 196), f"{SKILL_LABEL[lv['skill']]} · {lv['cutCount']} 刀 · 曲边 {lv['curveRatio']*100:.0f}%",
                 cn(17), INK_FAINT + (a,), anchor="ma")
        return

    # curve levels
    title_block(d, "最后四关：让刀转弯", "ARC  ·  S-CURVE  ·  WAVE  ·  CURVE + STRAIGHT", y=136, size=50, sub_size=18)
    for i, pid in enumerate(CURVE_IDS):
        lv = by_id[pid]
        kk = ramp(t, 0.2 + i * 0.3, 0.8 + i * 0.3)
        if kk <= 0:
            continue
        a = int(255 * kk)
        cx = 300 + i * 440
        cy = 420
        draw_art(img, lv["target"], 122, cx, cy, RED, shadow=True, alpha=a)
        text(d, (cx, cy + 168), lv["title"], cnb(27), INK + (a,), anchor="ma")
        text(d, (cx, cy + 204), f"曲边占比 {lv['curveRatio']*100:.0f}%", cn(18), INK_FAINT + (a,), anchor="ma")

    if beat >= 5:
        kk = ramp(bt, 0.1, 0.8)
        a = int(255 * kk)
        card(img, (96, 760, 1824, 926), radius=14, fill=PAPER_BRIGHT + (a,))
        text(d, (132, 792), "曲线 = 高度场上的单值刀口", cnb(30), INK + (a,))
        text(d, (132, 842), "v = offset + A·sin(bends·π·t)　　|A|·bends²·π² / (8N²) ≤ 0.0012", cn(24), INK_SOFT + (a,))
        text(d, (132, 884), "单值，所以不会自交；「剪去哪一侧」永远有定义；目标与作答共用同一个采样器", cn(21), INK_FAINT + (a,))


# --------------------------------------------------------------------------
# 06 工坊与模型
# --------------------------------------------------------------------------
def scene_ai(img, d, t, beat, bt, sc):
    title_block(d, "自己做，或者让模型给一个起点", "STUDIO  ·  RUNTIME MODEL", y=140, size=54, sub_size=19)

    if beat <= 1:
        k = ramp(t, 0.2, 1.0)
        draw_shot(img, "04-studio.png", (96, 240, 1080, 830), radius=16, focus=(0.0, 0.05, 0.62, 0.75), alpha=int(255 * k))
        rows = [("四种刀型随时互转", "直线 / 折剪 / 镂空 / 曲线"),
                ("实时双视图", "左看纸包，右看展开"),
                ("导出 SVG / PNG", "矢量图，可以直接印")]
        for i, (h, s) in enumerate(rows):
            kk = ramp(t, 1.0 + i * 0.5, 1.6 + i * 0.5)
            a = int(255 * kk)
            y = 290 + i * 150
            text(d, (1150, y), h, cnb(32), INK + (a,))
            text(d, (1150, y + 46), s, cn(22), INK_SOFT + (a,))
        return

    # the model pipeline
    k = ramp(bt, 0.0, 0.7)
    a = int(255 * k)
    text(d, (96, 250), "“做一张八瓣红窗花，细密一点。”", cnb(38), (157, 43, 57, a))
    box_y = 360
    boxes = [
        ("一句话", "用户的描述"),
        ("结构 JSON", "折数 / 元素 / 镂空 / 配色"),
        ("校验 + 修复", "越界就夹紧，非法就拒绝"),
        ("几何引擎", "算刀口、算展开、算评分"),
        ("图案", "可渲染、可通关"),
    ]
    bw, gap = 280, 56
    for i, (h, s) in enumerate(boxes):
        kk = ramp(bt, 0.2 + i * 0.35, 0.7 + i * 0.35)
        aa = int(255 * kk)
        x = 96 + i * (bw + gap)
        d.rounded_rectangle([x, box_y, x + bw, box_y + 150], 14, fill=(255, 253, 248, aa),
                            outline=(36, 39, 37, int(40 * kk)), width=2)
        text(d, (x + 22, box_y + 26), h, cnb(28), INK + (aa,))
        text(d, (x + 22, box_y + 78), s, cn(18), INK_SOFT + (aa,))
        if i < len(boxes) - 1:
            arrow(d, (x + bw + 8, box_y + 75), (x + bw + gap - 10, box_y + 75), color=(201, 164, 106, aa), width=2)

    k2 = ramp(bt, 2.0, 2.8)
    if k2 > 0:
        draw_shot(img, "10-ai-gallery.png", (96, 522, 780, 930), radius=14, alpha=int(255 * k2), fit="contain", focus=(0.0, 0.07, 1.0, 1.0))
        text(d, (830, 566), "模型返回的参数", cn(21), INK_FAINT + (int(255 * k2),))
        text(d, (830, 606), "不合规就整条拒绝", cnb(34), INK + (int(255 * k2),))
        text(d, (830, 668), "宁可说「不支持」，", cn(22), INK_SOFT + (int(255 * k2),))
        text(d, (830, 704), "也不猜一个能渲染但错的结果。", cn(22), INK_SOFT + (int(255 * k2),))


# --------------------------------------------------------------------------
# 07 可信度
# --------------------------------------------------------------------------
def scene_rigor(img, d, t, beat, bt, sc):
    title_block(d, "让“算出来的”站得住", "CORRECTNESS  ·  TESTS  ·  COVERAGE", y=140, size=54, sub_size=19)

    stats = [("214", "个自动化测试", "几何 / 关卡 / AI / 导出 / 渲染"),
             ("96.7%", "核心几何行覆盖率", "17 个模块、3184 条语句"),
             ("5 × 4", "种折法 × 种刀具", "最多 8 层叠成一包，每种都被对称性约束住")]
    for i, (big, h, s) in enumerate(stats):
        kk = ramp(t, 0.3 + i * 0.4, 0.9 + i * 0.4)
        a = int(255 * kk)
        x = 96 + i * 580
        text(d, (x, 250), big, serif(90 if len(big) > 2 else 96, bold=True), (157, 43, 57, a))
        text(d, (x, 372), h, cnb(27), INK + (a,))
        text(d, (x, 412), s, cn(19), INK_FAINT + (a,))

    # invariant: paper + removed = 4
    k = ramp(bt, 0.2, 1.0) if beat == 1 else 1.0
    a = int(255 * k)
    y = 540
    total = 1080
    kept = int(total * 0.752)
    d.rounded_rectangle([96, y, 96 + kept, y + 84], 8, fill=(185, 54, 69, a))
    d.rounded_rectangle([96 + kept, y, 96 + total, y + 84], 8, fill=(201, 164, 106, int(150 * k)))
    text(d, (116, y + 26), "保留下来的纸", cnb(26), (255, 253, 248, a))
    text(d, (96 + kept + 18, y + 26), "剪掉的", cnb(26), (90, 66, 34, a))
    text(d, (96, y + 104), "paper + removed = 4，每一关、每一种折法都成立（1e-6 内）", cn(21), INK_SOFT + (a,))

    if beat >= 2:
        kk = ramp(bt, 0.1, 0.8)
        aa = int(255 * kk)
        card(img, (96, 720, 1824, 900), radius=14, fill=(255, 253, 248, aa))
        text(d, (128, 748), "审查修掉的三个缺陷：布尔运算在切线贴边时，会静默少剪一层", cnb(27), INK + (aa,))
        text(d, (128, 792), "团的 paper + removed 只有 3.9314（应为 4）　·　同一刀写成相反法向，纸面 2.2108 vs 2.6581", cn(20), INK_SOFT + (aa,))
        text(d, (128, 830), "现在的管线：纸包里只减一次 → 每层只做等距映射 → 整纸逐层相减", cn(20), (157, 43, 57, aa))
        text(d, (128, 866), "修复后 16 关的 paper + removed 全部等于 4.00000", cn(19), INK_FAINT + (aa,))


# --------------------------------------------------------------------------
# 尾
# --------------------------------------------------------------------------
def scene_outro(img, d, t, beat, bt, sc):
    lv = {l["id"]: l for l in LEVELS}["caisson"]
    k = ramp(t, 0.0, 0.9)
    draw_art(img, lv["target"], 170, 470, 470, RED, shadow=True, alpha=int(230 * k))

    k2 = ramp(t, 0.3, 1.2)
    a = int(255 * k2)
    text(d, (830, 300), "Foldyssey", serif(120, bold=True), INK + (a,))
    text(d, (836, 448), "一 刀 万 象", cnb(40), (157, 43, 57, a), tracking=6)
    text(d, (836, 512), "折起一张纸，只剪一刀，再亲手展开。", cn(26), INK_SOFT + (a,))

    k3 = ramp(t, 1.2, 2.0)
    aa = int(255 * k3)
    d.rounded_rectangle([836, 596, 1620, 676], 12, fill=(255, 253, 248, aa), outline=(201, 164, 106, int(180 * k3)), width=2)
    text(d, (858, 616), "foldyssey.app.workbuddy.host", cn(26), (157, 43, 57, aa))
    text(d, (836, 700), "扫码直接玩 · 免登录 · 手机与桌面都行", cn(20), INK_FAINT + (aa,))

    if k3 > 0:
        import qrcode

        qr = qrcode.QRCode(box_size=8, border=1)
        qr.add_data(R_URL)
        qr.make()
        im = qr.make_image(fill_color="#242725", back_color="#FFFDF8").convert("RGB").resize((190, 190), Image.NEAREST)
        mask = Image.new("L", (190, 190), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 189, 189], 14, fill=255)
        im = im.convert("RGBA")
        im.putalpha(mask.point(lambda v: int(v * k3)))
        img.alpha_composite(im, (1690, 596))

    k4 = ramp(t, 2.2, 3.0)
    if k4 > 0:
        text(d, (836, 790), "Erik D. Demaine · Martin L. Demaine · Anna Lubiw  —  Fold-and-Cut Theorem, 1999",
             cn(17), (138, 141, 134, int(255 * k4)), tracking=0.3)
        text(d, (836, 820), "本项目为 1024 造物挑战参赛作品，与上述作者及 MIT 无隶属或背书关系", cn(17),
             (138, 141, 134, int(255 * k4)), tracking=0.3)


R_URL = "https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z"

SCENE_FUNCS = {
    "open": scene_open,
    "theorem": scene_theorem,
    "product": scene_product,
    "math": scene_math,
    "levels": scene_levels,
    "patterns": scene_patterns,
    "ai": scene_ai,
    "rigor": scene_rigor,
    "outro": scene_outro,
}
