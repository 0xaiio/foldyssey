"""
The nine scenes, rewritten for a non-technical, user-facing cut.

Structure: overall → detail. Home page first, then one scene per feature, then
the honest limits, and only at the very end the references — no formulas, no
architecture, no numbers that only a developer would care about.

`beat` / `bt` are the current narration line and the seconds spent in it, so the
picture cuts on the same words the voice says.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import render as R
from render import (
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
    mp_mask,
    paste_masked,
    project_factory,
    ramp,
    serif,
    shot,
    text,
    text_width,
)

LEVELS = R.LEVELS
FOLDS = R.FOLDS
HEROES = R.HEROES
GOLD = (201, 164, 106)
GOLD_SOFT = (227, 207, 174)

GITHUB = "github.com/0xaiio/foldyssey"
URL = "foldyssey.app.workbuddy.host"


# --------------------------------------------------------------------------
# small shared pieces
# --------------------------------------------------------------------------
def title_block(d, s, sub=None, y=140, size=56, sub_size=19, x=96, color=INK):
    text(d, (x, y), s, cnb(size), color)
    if sub:
        text(d, (x, y + size + 20), sub, cn(sub_size), INK_SOFT, tracking=0.8)


def contain_map(box, name, focus=None):
    """Scale + offset used by draw_shot(fit='contain'), for placing callouts."""
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    im = shot(name)
    if focus:
        fx0, fy0, fx1, fy1 = focus
        im = im.crop((int(im.width * fx0), int(im.height * fy0), int(im.width * fx1), int(im.height * fy1)))
    s = min(w / im.width, h / im.height)
    return s, x0 + (w - im.width * s) / 2, y0 + (h - im.height * s) / 2


def shot_rect(box, name, rect, focus=None, fit="contain"):
    """Map a normalised rect inside a placed screenshot to screen space."""
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    im = shot(name)
    if focus:
        fx0, fy0, fx1, fy1 = focus
        im = im.crop((int(im.width * fx0), int(im.height * fy0), int(im.width * fx1), int(im.height * fy1)))
    s = min(w / im.width, h / im.height) if fit == "contain" else max(w / im.width, h / im.height)
    ox = x0 + (w - im.width * s) / 2
    oy = y0 + (h - im.height * s) / 2
    rx0, ry0, rx1, ry1 = rect
    return (ox + im.width * rx0 * s, oy + im.height * ry0 * s,
            ox + im.width * rx1 * s, oy + im.height * ry1 * s)


def highlight(img, d, box, alpha=255, radius=12, color=RED, width=3, badge=None):
    if alpha <= 4:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    ld.rounded_rectangle([x0, y0, x1, y1], radius, fill=color + (26,), outline=color + (220,), width=width)
    img.alpha_composite(layer)
    if badge:
        bx, by = x0 - 4, y0 - 4
        d.ellipse([bx - 17, by - 17, bx + 17, by + 17], fill=color + (255,))
        text(d, (bx, by + 1), badge, cnb(20), (255, 253, 248, 255), anchor="mm")


def dashes(d, pts, color, width=3, dash=12, gap=9, upto=1.0):
    segs, total = [], 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        segs.append((a, b, L))
        total += L
    budget = total * upto
    walked = 0.0
    for a, b, L in segs:
        if walked > budget:
            break
        steps = max(1, int(L / 6))
        for k in range(steps):
            t0, t1 = k / steps, min(1.0, (k + 1) / steps)
            if (walked + L * t0) % (dash + gap) < dash and walked + L * t0 <= budget:
                d.line(
                    [(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                     (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                    fill=color,
                    width=width,
                )
        walked += L


def path_head(paths, frac):
    total = sum(
        sum(math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1)) for p in paths
    )
    if total <= 1e-6:
        return None
    want = max(0.0, min(1.0, frac)) * total
    for pts in paths:
        for i in range(len(pts) - 1):
            seg = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
            if want <= seg:
                k = want / max(seg, 1e-9)
                return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k)
            want -= seg
    return None


# --------------------------------------------------------------------------
# 序：fold → cut → unfold
# --------------------------------------------------------------------------
def scene_open(img, d, t, beat, bt, sc):
    hero = HEROES["grand-rosette"]
    preset = FOLDS["radial8"]

    if t < 2.6:
        f = ramp(t, 0.35, 2.55)
    elif t < 4.1:
        f = 1.0
    else:
        f = 1 - ramp(t, 4.15, 6.9)

    pk = preset["packet"]
    xs = [p["x"] for p in pk]
    ys = [p["y"] for p in pk]
    pcx, pcy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    pack_scale = 620 / max(max(xs) - min(xs), max(ys) - min(ys), 1e-6)
    sheet_scale = 330
    a_title = ramp(t, 7.0, 7.9)
    scale = (sheet_scale + (pack_scale - sheet_scale) * f) * (1 - 0.28 * a_title)
    ox = CX - pcx * scale * f
    oy = 372 + pcy * scale * f - 40 * a_title

    mats = [R.patch_matrix(hero, p, f) for p in hero["patches"]]

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

    cut_k = ramp(t, 2.85, 3.6)
    if cut_k > 0:
        solid = ImageChops.subtract(solid, cut_mask.point(lambda v: int(v * cut_k)))

    R.drop_shadow(img, solid, dy=16, blur=26, opacity=62)
    paste_masked(img, solid, RED)
    if 0.04 < f < 0.96:
        edge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ed = ImageDraw.Draw(edge)
        for p, m in zip(hero["patches"], mats):
            for poly in p["region"]:
                for ring in poly:
                    pts = [project_factory(scale, ox, oy, m)(q) for q in ring]
                    if len(pts) > 2:
                        ed.line(pts + [pts[0]], fill=(255, 253, 248, 120), width=2)
        img.alpha_composite(edge)

    if 2.6 < t < 4.05:
        d_rings = [ring for poly in hero["patches"][0]["removed"] for ring in poly]
        prog = ramp(t, 2.65, 3.55)
        for ring in d_rings:
            pts = [(ox + q["x"] * scale, oy - q["y"] * scale) for q in ring]
            dashes(d, pts + [pts[0]], (255, 253, 248, 225), width=3, dash=10, gap=7, upto=prog)
        head = path_head([[(ox + q["x"] * scale, oy - q["y"] * scale) for q in ring] for ring in d_rings], prog)
        if head and 0.02 < prog < 0.995:
            d.ellipse([head[0] - 13, head[1] - 13, head[0] + 13, head[1] + 13], fill=(255, 253, 248, 245))
            d.ellipse([head[0] - 7, head[1] - 7, head[0] + 7, head[1] + 7], fill=(216, 74, 73, 245))

    if a_title > 0:
        k = int(255 * a_title)
        text(d, (CX, 656), "Foldyssey", serif(90, bold=True), INK + (k,), anchor="ma")
        text(d, (CX, 760), "一 刀 万 象", cnb(30), (157, 43, 57, k), anchor="ma", tracking=6)
        text(d, (CX, 812), "折起一张纸，只剪一刀，再亲手展开", cn(20), (138, 141, 134, k), anchor="ma", tracking=2)


# --------------------------------------------------------------------------
# 01 首页
# --------------------------------------------------------------------------
HOME_BOX = (536, 176, 1824, 906)


def scene_home(img, d, t, beat, bt, sc):
    title_block(d, "首页：从这里开始", "先看整体，再挑一个入口", y=118, size=52)

    rows = [
        ("①", "三件事", "折、剪、展，一句话说清怎么玩"),
        ("②", "会自己折的纸", "首页右侧的动效，就是成品的样子"),
        ("③", "七个入口", "挑战、工坊、作品、AI 灵感、数学、关于"),
        ("④", "图案库", "十六个图案按五个阶段排好"),
        ("⑤", "两个按钮", "立即开始，或者自己画一张"),
        ("⑥", "开源的", GITHUB),
    ]
    for i, (num, head, body) in enumerate(rows):
        on = i == beat
        alpha = 255 if on else (150 if i < beat else 95)
        y = 250 + i * 104
        text(d, (96, y), num, serif(24, bold=True), (157, 43, 57, alpha))
        text(d, (140, y - 8), head, cnb(26) if on else cn(26), (INK if on else INK_SOFT) + (alpha,))
        text(d, (140, y + 32), body, cn(17), (INK_SOFT if on else INK_FAINT) + (alpha,))
        if on:
            d.line([96, y + 76, 96 + 420, y + 76], fill=(201, 164, 106, 200), width=2)

    k = ramp(t, 0.2, 0.9)
    if True:
        draw_shot(img, "01-home.png", HOME_BOX, radius=14,
                  alpha=int(255 * k * (0.35 if beat >= 5 else 1.0)), fit="contain")
        rects = {
            0: (0.09, 0.79, 0.92, 1.0),
            1: (0.50, 0.08, 0.90, 0.68),
            2: (0.04, 0.0, 0.96, 0.065),
            4: (0.09, 0.55, 0.29, 0.615),
        }
        if beat in rects and beat != 3:
            a = int(255 * ramp(bt, 0.2, 0.8))
            highlight(img, d, shot_rect(HOME_BOX, "01-home.png", rects[beat]), a, badge=str(beat + 1))

    # the library: drawn from the real level data, because the screenshot ends above it
    if beat == 3:
        a = ramp(bt, 0.2, 0.85)
        if a > 0:
            aa = int(255 * a)
            box = (600, 210, 1824, 880)
            card(img, box, radius=16, fill=PAPER_BRIGHT + (aa,))
            by_id = {l["id"]: l for l in LEVELS}
            picks = ["corner", "diamond", "octagram", "rosette", "grand-rosette", "caisson", "sixfold", "scallop"]
            for i, pid in enumerate(picks):
                col, row = i % 4, i // 4
                cxx = box[0] + 160 + col * 300
                cyy = box[1] + 190 + row * 300
                draw_art(img, by_id[pid]["target"], 92, cxx, cyy, RED, shadow=False, alpha=aa)
                text(d, (cxx, cyy + 126), by_id[pid]["title"], cnb(22), INK + (aa,), anchor="ma")
            text(d, (box[0] + 30, box[1] + 24), "图案库 · 十六个图案，五个阶段", cnb(26), INK + (aa,))

    # the GitHub card, last beat
    if beat >= 5:
        a = ramp(bt, 0.15, 0.8)
        aa = int(255 * a)
        card(img, (536, 630, 1824, 850), radius=16, fill=PAPER_BRIGHT + (aa,))
        text(d, (570, 660), "开 源 仓 库", cn(19), INK_FAINT + (aa,), tracking=4)
        text(d, (570, 700), GITHUB, serif(56, bold=True), (157, 43, 57, aa))
        text(d, (570, 792), "代码、文档、每一个图案的标准解，都在里面", cn(22), INK_SOFT + (aa,))


# --------------------------------------------------------------------------
# 02 一刀挑战
# --------------------------------------------------------------------------
LEVEL_BOX = (96, 168, 1250, 900)
LEVEL_FOCUS = (0.0, 0.14, 1.0, 0.995)


def scene_level(img, d, t, beat, bt, sc):
    title_block(d, "一刀挑战：一关一关往上走", "左边剪，右下角对答案", y=110, size=50)

    name = "03-puzzle-revealed.png" if beat >= 2 else "02-puzzle-folded.png"
    k = ramp(t, 0.2, 0.8)
    draw_shot(img, name, LEVEL_BOX, radius=14, alpha=int(255 * k), fit="cover", focus=LEVEL_FOCUS)

    notes = [
        ("画布", "左边是折好的纸包，右边是目标"),
        ("拖切线", "松手就重算，切口跟着走"),
        ("剪一刀", "碎片落下，纸包一层层展开"),
        ("分数", "和目标重合多少，一目了然"),
        ("差在哪", "卡住了，就让它给一个方向"),
        ("四档刀法", "一刀、两刀、拐弯、曲线"),
    ]
    for i, (head, body) in enumerate(notes):
        if beat >= 5:
            break
        on = i == beat
        aa = 255 if on else (150 if i < beat else 95)
        y = 250 + i * 92
        text(d, (1320, y), str(i + 1).zfill(2), serif(22, bold=True), (201, 164, 106, aa))
        text(d, (1372, y - 8), head, cnb(25) if on else cn(25), (INK if on else INK_SOFT) + (aa,))
        text(d, (1372, y + 30), body, cn(17), (INK_SOFT if on else INK_FAINT) + (aa,))
        if on:
            d.line([1320, y + 68, 1780, y + 68], fill=(201, 164, 106, 150), width=2)

    canvas = (0.075, 0.42, 0.56, 0.99)
    target = (0.595, 0.42, 0.99, 0.99)
    if beat == 0:
        a = int(255 * ramp(bt, 0.25, 0.9))
        highlight(img, d, shot_rect(LEVEL_BOX, name, canvas, LEVEL_FOCUS, "cover"), a, badge="1", radius=10)
        highlight(img, d, shot_rect(LEVEL_BOX, name, target, LEVEL_FOCUS, "cover"), int(a * 0.9), badge="2", radius=10)
    elif beat == 1:
        a = int(255 * ramp(bt, 0.2, 0.8))
        highlight(img, d, shot_rect(LEVEL_BOX, name, (0.07, 0.50, 0.52, 0.97), LEVEL_FOCUS, "cover"), a, badge="1", radius=10)
    elif beat == 2:
        a = int(255 * ramp(bt, 0.2, 0.8))
        highlight(img, d, shot_rect(LEVEL_BOX, name, canvas, LEVEL_FOCUS, "cover"), a, badge="3", radius=10)
    elif beat == 3:
        a = int(255 * ramp(bt, 0.2, 0.8))
        highlight(img, d, shot_rect(LEVEL_BOX, name, (0.60, 0.455, 0.98, 0.86), LEVEL_FOCUS, "cover"), a, badge="4", radius=10)
    elif beat == 4:
        a = int(255 * ramp(bt, 0.2, 0.8))
        highlight(img, d, shot_rect(LEVEL_BOX, name, (0.595, 0.665, 0.805, 0.745), LEVEL_FOCUS, "cover"), a, badge="5", radius=10)

    # the four rungs
    if beat >= 5:
        rows = [("一刀", "一条直线", RED), ("两刀", "两条线叠起来", (196, 96, 74)),
                ("拐弯", "剪一个 V 形缺口", (176, 130, 60)), ("曲线", "让刀在纸里转弯", TEAL)]
        counts = {k: sum(1 for l in LEVELS if l["skill"] == k) for k in ("one", "two", "turn", "curve")}
        for i, ((name_cn, body, col), key) in enumerate(zip(rows, ("one", "two", "turn", "curve"))):
            kk = ramp(bt, 0.15 + i * 0.22, 0.65 + i * 0.22)
            aaa = int(255 * kk)
            y = 290 + i * 118
            d.rounded_rectangle([1320, y, 1810, y + 96], 12, fill=(255, 253, 248, aaa),
                                outline=col + (int(150 * kk),), width=2)
            d.ellipse([1344, y + 36, 1364, y + 56], fill=col + (aaa,))
            text(d, (1382, y + 12), name_cn, cnb(26), INK + (aaa,))
            text(d, (1382, y + 50), body, cn(17), INK_SOFT + (aaa,))
            text(d, (1754, y + 34), f"{counts[key]} 关", cn(18), col + (aaa,), anchor="ra")


# --------------------------------------------------------------------------
# 03 图案库
# --------------------------------------------------------------------------
STAGE_NAMES = {1: "看懂", 2: "对齐", 3: "叠加", 4: "典藏", 5: "转弯"}


def scene_library(img, d, t, beat, bt, sc):
    title_block(d, "图案库：先看懂，再动手", "十六个图案，五个阶段", y=110, size=50)

    if beat <= 0:
        for s in range(1, 6):
            count = sum(1 for l in LEVELS if l["stage"] == s)
            kk = ramp(t, 0.2 + (s - 1) * 0.2, 0.7 + (s - 1) * 0.2)
            text(d, (96 + (s - 1) * 344, 236), f"阶段 {s} · {STAGE_NAMES[s]}（{count} 关）", cn(16),
                 INK_FAINT + (int(255 * kk),))
        for i, lv in enumerate(LEVELS):
            kk = ramp(t, 0.3 + i * 0.035, 0.85 + i * 0.035)
            if kk <= 0:
                continue
            a = int(255 * kk)
            col, row = i % 8, i // 8
            x = 96 + col * 214
            y = 290 + row * 268
            card(img, (x, y, x + 196, y + 244), radius=12, fill=PAPER_BRIGHT + (a,))
            draw_art(img, lv["target"], 62, x + 98, y + 86, RED, shadow=False, alpha=a)
            text(d, (x + 14, y + 162), str(lv["index"]).zfill(2), cn(15), INK_FAINT + (a,))
            text(d, (x + 44, y + 160), lv["title"], cnb(20), INK + (a,))
            text(d, (x + 14, y + 198), f"阶段 {lv['stage']} · {STAGE_NAMES[lv['stage']]}", cn(14), INK_SOFT + (a,))
        return

    # one card, opened
    lv = next(l for l in LEVELS if l["id"] == "caisson")
    a = ramp(t, 0.1, 0.8)
    aa = int(255 * a)
    card(img, (96, 250, 780, 880), radius=16, fill=PAPER_BRIGHT + (aa,))
    draw_art(img, lv["target"], 200, 438, 500, RED, shadow=True, alpha=aa)
    text(d, (438, 730), lv["title"], cnb(34), INK + (aa,), anchor="ma")
    text(d, (438, 778), f"阶段 {lv['stage']} · {lv['cutSummary']}", cn(19), INK_FAINT + (aa,), anchor="ma")

    rows = [
        ("怎么折", "八折：把纸对折三次，叠成一个小三角"),
        ("这一刀剪什么", "在纸包的边上，剪出一圈缺口"),
        ("展开之后", "八个方向同时出现，就是一个藻井"),
    ]
    for i, (head, body) in enumerate(rows):
        kk = ramp(bt, 0.25 + i * 0.5, 0.85 + i * 0.5)
        aaa = int(255 * kk)
        y = 330 + i * 168
        d.line([840, y - 26, 1814, y - 26], fill=(36, 39, 37, int(24 * kk)), width=2)
        text(d, (840, y), head, cnb(28), (157, 43, 57, aaa))
        text(d, (840, y + 52), body, cn(24), INK + (aaa,))
    text(d, (840, 820), "每个图案都写了折叠、切割、展开三件事", cn(20),
         INK_FAINT + (int(255 * ramp(bt, 1.6, 2.2)),))


# --------------------------------------------------------------------------
# 04 剪纸工坊
# --------------------------------------------------------------------------
STUDIO_BOX = (96, 172, 1180, 900)


def scene_studio(img, d, t, beat, bt, sc):
    title_block(d, "剪纸工坊：自己画一张", "左边纸包，右边成品", y=110, size=50)
    k = ramp(t, 0.2, 0.9)
    draw_shot(img, "04-studio.png", STUDIO_BOX, radius=14, alpha=int(255 * k), fit="contain")

    notes = [
        ("双视图", "改一个参数，两边同时变"),
        ("刀型", "直线 / 折剪 / 镂空 / 曲线"),
        ("折法", "换一种折法，层数也变了"),
        ("导出", "SVG 或 PNG，拿去打印都行"),
    ]
    for i, (head, body) in enumerate(notes):
        on = i == beat
        aa = 255 if on else (150 if i < beat else 95)
        y = 300 + i * 140
        text(d, (1240, y), head, cnb(30) if on else cn(30), (INK if on else INK_SOFT) + (aa,))
        text(d, (1240, y + 48), body, cn(20), (INK_SOFT if on else INK_FAINT) + (aa,))
        if on:
            d.line([1240, y + 100, 1760, y + 100], fill=(201, 164, 106, 190), width=2)

    if beat == 1:
        a = int(255 * ramp(bt, 0.2, 0.7))
        for i, s in enumerate(["直线", "折剪", "镂空", "曲线"]):
            x = 1240 + i * 134
            d.rounded_rectangle([x, 820, x + 120, 868], 999, fill=(255, 253, 248, a),
                                outline=(185, 54, 69, int(180 * a / 255)), width=2)
            text(d, (x + 12, 830), s, cn(19), (157, 43, 57, a))
    if beat == 3:
        a = int(255 * ramp(bt, 0.2, 0.7))
        text(d, (1240, 800), "SVG", serif(52, bold=True), (157, 43, 57, a))
        text(d, (1380, 800), "PNG", serif(52, bold=True), (157, 43, 57, a))


# --------------------------------------------------------------------------
# 05 AI 灵感
# --------------------------------------------------------------------------
def scene_ai(img, d, t, beat, bt, sc):
    title_block(d, "AI 灵感：不知道做什么的时候", "说一句话，拿一张图", y=110, size=50)

    if beat <= 1:
        card(img, (96, 240, 1824, 372), radius=14, fill=PAPER_BRIGHT + (255,))
        text(d, (132, 264), "试试这样写", cn(19), INK_FAINT)
        text(d, (132, 296), "“春节的八瓣红窗花，细密一点，适合挂在窗户上。”", cnb(30), (157, 43, 57))
        a = ramp(t, 0.4, 1.2)
        draw_shot(img, "10-ai-gallery.png", (96, 404, 1060, 699), radius=14, fit="cover",
                  alpha=int(255 * a), focus=(0.02, 0.055, 0.98, 0.51))

        rows = [("①", "写一句话"), ("②", "拿一张现成的图案"), ("③", "喜欢就带回去接着改")]
        for i, (num, s) in enumerate(rows):
            kk = ramp(t, 1.0 + i * 0.5, 1.6 + i * 0.5)
            aa = int(255 * kk)
            text(d, (1120, 480 + i * 116), num, serif(26, bold=True), (201, 164, 106, aa))
            text(d, (1170, 472 + i * 116), s, cnb(28), INK + (aa,))
        return

    a = ramp(bt, 0.1, 0.7)
    aa = int(255 * a)
    text(d, (96, 240), "模板可以直接点，也可以改", cnb(32), INK + (aa,))
    temps = [("春节八瓣窗花", "八折 · 齿边 · 正红"), ("蓝白细雪", "八折 · 密齿 · 冷蓝"),
             ("中秋圆月", "八折 · 月轮 · 金褐"), ("极简方框", "四折 · 留白 · 黑白"),
             ("青花团纹", "八折 · 双圈孔 · 靛青"), ("粗线大花", "八折 · 宽瓣 · 亮橙")]
    for i, (name, tag) in enumerate(temps):
        kk = ramp(bt, 0.15 + i * 0.12, 0.65 + i * 0.12)
        aaa = int(255 * kk)
        col, row = i % 3, i // 3
        x = 96 + col * 400
        y = 310 + row * 190
        d.rounded_rectangle([x, y, x + 372, y + 152], 12, fill=(255, 253, 248, aaa),
                            outline=(36, 39, 37, int(34 * kk)), width=2)
        text(d, (x + 24, y + 24), name, cnb(28), INK + (aaa,))
        text(d, (x + 24, y + 74), tag, cn(18), INK_FAINT + (aaa,))
        text(d, (x + 24, y + 110), "点一下，填进输入框", cn(16), (157, 43, 57, aaa))
    text(d, (1400, 310), "改完再说一遍，", cn(22), INK_SOFT + (aaa,))
    text(d, (1400, 350), "就是另一张图。", cn(22), INK_SOFT + (aaa,))


# --------------------------------------------------------------------------
# 06 我的作品 / 手机
# --------------------------------------------------------------------------
def scene_gallery(img, d, t, beat, bt, sc):
    title_block(d, "作品与手机", "做完就存下，随手就能玩", y=110, size=50)

    a = ramp(t, 0.2, 1.0)
    aa = int(255 * a)
    draw_shot(img, "05-mobile-home.png", (240, 220, 596, 880), radius=26, alpha=aa, fit="contain")
    draw_shot(img, "06-mobile-puzzle.png", (660, 220, 1016, 880), radius=26, alpha=int(aa * 0.95), fit="contain")

    rows = [
        ("存在本地", "关掉浏览器也在，不用注册，不用登录"),
        ("随时接着改", "从「我的作品」点开，回到当时的参数"),
        ("竖屏能玩", "按钮、滑杆、画布都按手机重新排过"),
    ]
    for i, (head, body) in enumerate(rows):
        kk = ramp(bt, 0.15 + i * 0.45, 0.7 + i * 0.45) if beat == 0 else ramp(bt, 0.1, 0.6)
        aaa = int(255 * kk)
        y = 300 + i * 180
        text(d, (1140, y), head, cnb(30), INK + (aaa,))
        text(d, (1140, y + 52), body, cn(21), INK_SOFT + (aaa,))


# --------------------------------------------------------------------------
# 07 现在与以后
# --------------------------------------------------------------------------
def _wrap(d, s, f, width):
    out, cur = [], ""
    for ch in s:
        if text_width(d, cur + ch, f) > width and cur:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        out.append(cur)
    return out


def scene_limits(img, d, t, beat, bt, sc):
    title_block(d, "现在，与以后", "做不到的，也说清楚", y=110, size=50)

    if beat == 0:
        a = int(255 * ramp(bt, 0.2, 0.8))
        text(d, (96, 300), "先说三件现在做不到的事。", cnb(46), INK + (a,))
        return

    now = [
        "折法只有五种，折不出任意角度的斜折",
        "曲线是近似画出来的，剪不了打结或闭合的路径",
        "还没有可以打印、照着剪的实体纸样",
    ]
    future = [
        "更多折法，让斜折和不规则折痕也能玩",
        "作品可以分享，也能看到别人剪了什么",
        "生成能打印的纸样，照着就能动手",
    ]

    a = int(255 * ramp(t, 0.4, 1.0))
    text(d, (96, 232), "现在", cn(22), INK_FAINT + (a,), tracking=4)
    text(d, (1010, 232), "接 下 来", cn(22), (157, 43, 57, a), tracking=4)
    d.line([96, 272, 900, 272], fill=(36, 39, 37, int(40 * a / 255)), width=2)
    d.line([1010, 272, 1814, 272], fill=(185, 54, 69, int(80 * a / 255)), width=2)

    for i, s in enumerate(now):
        kk = ramp(t, 1.0 + i * 0.45, 1.5 + i * 0.45)
        aa = int(255 * kk)
        y = 320 + i * 150
        text(d, (100, y - 2), "×", cn(30), (150, 120, 120, aa))
        for j, seg in enumerate(_wrap(d, s, cn(25), 700)):
            text(d, (146, y + j * 42), seg, cn(25), INK_SOFT + (aa,))

    for i, s in enumerate(future):
        kk = ramp(t, 4.2 + i * 0.45, 4.7 + i * 0.45)
        aa = int(255 * kk)
        y = 320 + i * 150
        text(d, (1010, y), "→", cn(24), (185, 54, 69, aa))
        for j, seg in enumerate(_wrap(d, s, cn(25), 700)):
            text(d, (1060, y + j * 42), seg, cn(25), INK + (aa,))

    note_a = int(255 * ramp(t, 7.6, 8.2))
    if note_a > 0:
        text(d, (96, 830), "这些限制也写在站内的「关于」页里。", cn(20), INK_FAINT + (note_a,))


# --------------------------------------------------------------------------
# 参考资料
# --------------------------------------------------------------------------
def scene_credits(img, d, t, beat, bt, sc):
    title_block(d, "来处", "参考与致谢", y=110, size=50)

    a = ramp(t, 0.3, 1.1)
    aa = int(255 * a)
    cx, cy, r = 248, 460, 112
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(201, 164, 106, aa), width=3)
    d.ellipse([cx - r + 12, cy - r + 12, cx + r - 12, cy + r - 12], fill=(255, 253, 248, aa))
    text(d, (cx, cy - 24), "ED", serif(58, bold=True), (157, 43, 57, aa), anchor="mm")
    text(d, (cx, cy + 32), "M D · A L", cn(17), INK_FAINT + (aa,), anchor="mm")
    text(d, (cx, cy + r + 36), "Erik D. Demaine", cnb(21), INK + (aa,), anchor="ma")
    text(d, (cx, cy + r + 68), "MIT · 折纸与计算", cn(16), INK_FAINT + (aa,), anchor="ma")

    refs = [
        ("折 剪 定 理 · Theorem 1", "E. D. Demaine, M. L. Demaine, A. Lubiw.“Folding and Cutting Paper.”", "JCDCG'98, LNCS 1763, Springer, 2000: 104–117."),
        ("DOI", "10.1007/978-3-540-46515-7_9", None),
        ("作者主页", "erikdemaine.org/foldcut", None),
    ]
    for i, (head, line1, line2) in enumerate(refs):
        kk = ramp(bt, 0.15 + i * 0.45, 0.7 + i * 0.45)
        aaa = int(255 * kk)
        y = 300 + i * 160
        text(d, (460, y), head, cn(18), (201, 164, 106, aaa), tracking=2)
        text(d, (460, y + 36), line1, cn(23), INK + (aaa,))
        if line2:
            text(d, (460, y + 74), line2, cn(20), INK_SOFT + (aaa,))

    k2 = ramp(t, 5.2, 6.2)
    if k2 > 0:
        aa2 = int(255 * k2)
        card(img, (460, 800, 1824, 896), radius=12, fill=PAPER_BRIGHT + (aa2,))
        text(d, (492, 818), URL, cn(24), (157, 43, 57, aa2))
        text(d, (1000, 818), GITHUB, cn(24), INK_SOFT + (aa2,))
    ka = int(255 * ramp(t, 5.8, 6.6))
    text(d, (1800, 150), "1024 造物挑战参赛作品", cn(16), INK_FAINT + (ka,), anchor="ra")
    text(d, (1800, 176), "与上述作者及 MIT 无隶属或背书关系", cn(16), INK_FAINT + (ka,), anchor="ra")


SCENE_FUNCS = {
    "open": scene_open,
    "home": scene_home,
    "level": scene_level,
    "library": scene_library,
    "studio": scene_studio,
    "ai": scene_ai,
    "gallery": scene_gallery,
    "limits": scene_limits,
    "credits": scene_credits,
}
