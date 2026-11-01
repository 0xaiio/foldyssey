"""
Frame renderer for the promo film.

No browser here (Edge/Chromium both die on launch), so every frame is drawn with
Pillow from the *real* geometry exported by `src/tests/video.dump.test.ts`, plus
the three screenshots that were captured when a browser still worked. Nothing is
faked: the unfold animation applies the same fold matrices the app applies.

    python render.py --scene open --t 5.0 --out /tmp/x.png   # one still
    python render.py --video                                 # the whole film
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from script import SCENES, URL

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"
SHOTS = ROOT.parent / "submission" / "screenshots"

W, H = 1920, 1080
FPS = 30
CX, CY = W // 2, 470          # optical centre of the "stage" area

# ---- brand palette (same tokens as src/styles/index.css) -------------------
PAPER = (248, 243, 233)
PAPER_WARM = (242, 234, 221)
PAPER_BRIGHT = (255, 253, 248)
INK = (36, 39, 37)
INK_SOFT = (86, 91, 86)
INK_FAINT = (138, 141, 134)
RED = (185, 54, 69)
RED_DEEP = (157, 43, 57)
RED_BRIGHT = (216, 74, 73)
GOLD = (201, 164, 106)
GOLD_SOFT = (227, 207, 174)
TEAL = (55, 140, 134)

FONT_CN = "C:/Windows/Fonts/msyh.ttc"
FONT_CN_B = "C:/Windows/Fonts/msyhbd.ttc"
FONT_SERIF = "C:/Windows/Fonts/BOOKOS.TTF"
FONT_SERIF_B = "C:/Windows/Fonts/BOOKOSB.TTF"

_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size)
    return _cache[key]


def cn(size: int) -> ImageFont.FreeTypeFont:
    return font(FONT_CN, size)


def cnb(size: int) -> ImageFont.FreeTypeFont:
    return font(FONT_CN_B, size)


def serif(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return font(FONT_SERIF_B if bold else FONT_SERIF, size)


# ---- easing ----------------------------------------------------------------
def clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def smooth(x: float) -> float:
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x: float) -> float:
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ramp(t: float, a: float, b: float) -> float:
    """0 before a, 1 after b, smooth in between."""
    if b <= a:
        return 1.0 if t >= b else 0.0
    return smooth((t - a) / (b - a))


def fade_out(t: float, a: float, b: float) -> float:
    return 1 - ramp(t, a, b)


def mix(c1, c2, k: float):
    k = clamp01(k)
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * k)) for i in range(3))


# ---- background ------------------------------------------------------------
def _make_background() -> Image.Image:
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (x - W / 2) / (W / 2)
    ny = (y - H * 0.45) / (H / 2)
    r = np.sqrt(nx * nx + ny * ny)
    vig = np.clip(1.06 - 0.16 * r ** 2, 0.86, 1.0)
    grain = np.random.default_rng(7).normal(0, 1.7, (H, W)).astype(np.float32)
    base = np.zeros((H, W, 3), dtype=np.float32)
    for i, c in enumerate(PAPER):
        base[:, :, i] = c
    base = base * vig[:, :, None] + grain[:, :, None]
    # a warm wash at the top-right, like raking light on a desk
    glow = np.clip(1 - np.sqrt(((x - W * 0.86) / (W * 0.55)) ** 2 + ((y - H * 0.08) / (H * 0.6)) ** 2), 0, 1) ** 2
    base += (np.array([9, 6, 2], dtype=np.float32))[None, None, :] * glow[:, :, None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


BACKGROUND = _make_background()


# ---- geometry --------------------------------------------------------------
def load(name: str):
    return json.loads((GEN / f"{name}.json").read_text(encoding="utf-8"))


LEVELS = load("levels")
FOLDS = {f["id"]: f for f in load("folds")}
HEROES = {h["id"]: h for h in load("heroes")}
MARGINS = load("margins")


def mat_apply(m, p):
    return (m["a"] * p["x"] + m["b"] * p["y"] + m["tx"], m["c"] * p["x"] + m["d"] * p["y"] + m["ty"])


def mat_mul(a, b):
    """a ∘ b (apply b first)."""
    return {
        "a": a["a"] * b["a"] + a["b"] * b["c"],
        "b": a["a"] * b["b"] + a["b"] * b["d"],
        "c": a["c"] * b["a"] + a["d"] * b["c"],
        "d": a["c"] * b["b"] + a["d"] * b["d"],
        "tx": a["a"] * b["tx"] + a["b"] * b["ty"] + a["tx"],
        "ty": a["c"] * b["tx"] + a["d"] * b["ty"] + a["ty"],
    }


IDENT = {"a": 1.0, "b": 0.0, "c": 0.0, "d": 1.0, "tx": 0.0, "ty": 0.0}


def step_matrix(step, progress: float):
    """Mirror of foldStepMatrix() in src/geometry/fold.ts."""
    p = clamp01(progress)
    if p <= 0:
        return dict(IDENT)
    cos = math.cos(math.pi * p)
    k = 1 - cos
    qx, qy = step["point"]["x"], step["point"]["y"]
    dx, dy = step["dir"]["x"], step["dir"]["y"]
    a00, a01, a11 = dx * dx, dx * dy, dy * dy
    return {
        "a": cos + k * a00,
        "b": k * a01,
        "c": k * a01,
        "d": cos + k * a11,
        "tx": k * (qx - (a00 * qx + a01 * qy)),
        "ty": k * (qy - (a01 * qx + a11 * qy)),
    }


def patch_matrix(hero, patch, foldedness: float):
    steps = {s["id"]: s for s in hero["steps"]}
    m = dict(IDENT)
    for sid in patch["history"]:
        step = steps.get(sid)
        if not step:
            continue
        span = step["t1"] - step["t0"]
        prog = 1.0 if span <= 1e-9 and foldedness >= step["t1"] else (
            clamp01((foldedness - step["t0"]) / span) if span > 1e-9 else (1.0 if foldedness >= step["t1"] else 0.0)
        )
        m = mat_mul(step_matrix(step, prog), m)
    return m


def mp_mask(polys, to_screen, size=(W, H)) -> Image.Image:
    """Rasterise a MultiPolygon (outer ring + holes) into an L mask."""
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = [to_screen(p) for p in ring]
            if len(pts) >= 3:
                d.polygon(pts, fill=255 if i == 0 else 0)
    return mask


def project_factory(scale: float, ox: float, oy: float, matrix=None, flip=True):
    def f(p):
        x, y = p["x"], p["y"]
        if matrix is not None:
            x, y = mat_apply(matrix, {"x": x, "y": y})
        return (ox + x * scale, oy - y * scale if flip else oy + y * scale)

    return f


def paste_masked(img: Image.Image, mask: Image.Image, color, alpha: int = 255):
    layer = Image.new("RGBA", img.size, color + (alpha,))
    img.paste(layer, (0, 0), mask)


def drop_shadow(img: Image.Image, mask: Image.Image, dy: int = 16, blur: int = 26, opacity: int = 60):
    """Blur the shadow only around the silhouette — a full-frame gaussian is the
    single most expensive thing in this renderer (16 cards = 0.7 s/frame)."""
    bbox = mask.getbbox()
    if not bbox:
        return
    m = blur * 2
    x0 = max(0, bbox[0] - m)
    y0 = max(0, bbox[1] - m)
    x1 = min(img.width, bbox[2] + m)
    y1 = min(img.height, bbox[3] + m)
    if x1 <= x0 or y1 <= y0:
        return
    sub = mask.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(blur))
    sub = sub.point(lambda v: int(v * opacity / 255))
    shadow = Image.new("RGBA", (x1 - x0, y1 - y0), (60, 42, 30, 0))
    shadow.putalpha(sub)
    img.alpha_composite(shadow, (x0, y0 + dy))


def draw_art(img, polys, scale, ox, oy, color=RED, shadow=True, alpha=255, matrix=None):
    to_screen = project_factory(scale, ox, oy, matrix)
    mask = mp_mask(polys, to_screen, img.size)
    if shadow and mask.getbbox():
        drop_shadow(img, mask, dy=int(14 * scale / 420), blur=max(8, int(18 * scale / 420)), opacity=70)
    if mask.getbbox():
        paste_masked(img, mask, color, alpha)
    return mask


# ---- text ------------------------------------------------------------------
def text(draw, xy, s, f, fill=INK, anchor="la", tracking=0.0):
    if tracking == 0:
        draw.text(xy, s, font=f, fill=fill, anchor=anchor)
        return
    x, y = xy
    for ch in s:
        draw.text((x, y), ch, font=f, fill=fill, anchor=anchor)
        x += draw.textlength(ch, font=f) + tracking


def text_width(draw, s, f, tracking=0.0):
    return sum(draw.textlength(ch, font=f) for ch in s) + tracking * max(0, len(s) - 1)


def wrap_cn(s: str, f, max_width: int) -> list[str]:
    """Greedy wrap that keeps Latin words whole (CJK breaks anywhere)."""
    lines, cur = [], ""
    for ch in s:
        trial = cur + ch
        if text_width(ImageDraw.Draw(Image.new("RGB", (1, 1))), trial, f) > max_width and cur:
            lines.append(cur)
            cur = ch.lstrip()
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def label(draw, xy, s, color=GOLD, size=22):
    f = cn(size)
    text(draw, xy, s, f, color, tracking=3.2)


def rule(draw, xy, width, color=(201, 164, 106, 90), h=2):
    draw.rectangle([xy[0], xy[1], xy[0] + width, xy[1] + h], fill=color)


def card(img, box, radius=20, fill=PAPER_BRIGHT, border=(36, 39, 37, 26), shadow=True):
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    if shadow:
        m = 22
        tile = Image.new("RGBA", (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
        ImageDraw.Draw(tile).rounded_rectangle(
            [m, m + 10, m + w, m + h + 10], radius, fill=(60, 42, 30, 30)
        )
        tile = tile.filter(ImageFilter.GaussianBlur(9))
        img.alpha_composite(tile, (x0 - m, y0 - m))
    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=fill + (255,) if len(fill) == 3 else fill)
    if border:
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius, outline=border, width=2)
    img.alpha_composite(plate, (x0, y0))


def arrow(draw, p0, p1, color=INK_FAINT, width=3, head=11, dash=None):
    if dash:
        x0, y0 = p0
        x1, y1 = p1
        total = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(total / (dash * 2)))
        for i in range(n):
            a = i / n
            b = min(1, (i + 0.55) / n)
            draw.line([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b],
                      fill=color, width=width)
    else:
        draw.line([p0, p1], fill=color, width=width)
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    for s in (+1, -1):
        draw.line(
            [p1, (p1[0] - head * math.cos(ang - s * 0.42), p1[1] - head * math.sin(ang - s * 0.42))],
            fill=color,
            width=width,
        )


def chip(draw, xy, s, f, fg=INK_SOFT, bg=None, border=(36, 39, 37, 40), pad=(16, 8), radius=999):
    tw = text_width(draw, s, f)
    asc, desc = f.getmetrics()
    h = asc + desc
    x, y = xy
    box = [x, y, x + tw + pad[0] * 2, y + h + pad[1] * 2]
    if bg:
        draw.rounded_rectangle(box, radius, fill=bg)
    if border:
        draw.rounded_rectangle(box, radius, outline=border, width=2)
    draw.text((x + pad[0], y + pad[1]), s, font=f, fill=fg)
    return box[2]


# ---- screenshots -----------------------------------------------------------
_shot_cache: dict[str, Image.Image] = {}


def shot(name: str) -> Image.Image:
    if name not in _shot_cache:
        _shot_cache[name] = Image.open(SHOTS / name).convert("RGB")
    return _shot_cache[name]


def draw_shot(img, name: str, box, radius=18, focus=None, alpha=255, fit="cover"):
    """Place a screenshot in `box`, cropping (`cover`) or letterboxing (`contain`)."""
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    im = shot(name)
    if focus:
        fx0, fy0, fx1, fy1 = focus
        im = im.crop((int(im.width * fx0), int(im.height * fy0), int(im.width * fx1), int(im.height * fy1)))
    s = (min if fit == "contain" else max)(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    if fit == "contain":
        plate = Image.new("RGB", (w, h), PAPER_BRIGHT)
        plate.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
        im = plate
    else:
        left = (im.width - w) // 2
        top = (im.height - h) // 2
        im = im.crop((left, top, left + w, top + h))

    card_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)
    card_img.paste(im.convert("RGBA"), (0, 0))
    card_img.putalpha(mask)

    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sm = Image.new("L", img.size, 0)
    ImageDraw.Draw(sm).rounded_rectangle([x0, y0 + 18, x1, y1 + 18], radius, fill=70)
    sm = sm.filter(ImageFilter.GaussianBlur(24))
    shadow.putalpha(sm)
    img.alpha_composite(shadow)
    if alpha < 255:
        card_img.putalpha(card_img.split()[3].point(lambda v: int(v * alpha / 255)))
    img.alpha_composite(card_img, (x0, y0))
    return img


# ---- frame chrome ----------------------------------------------------------
def base_frame(bg: Image.Image, label_text: str, progress: float) -> Image.Image:
    img = bg.copy().convert("RGBA")
    d = ImageDraw.Draw(img)
    # header: scene label + hairline
    label(d, (96, 58), label_text, GOLD, 24)
    d.line([96, 108, 236, 108], fill=GOLD, width=2)
    # progress hairline at the very bottom
    d.line([0, H - 4, W, H - 4], fill=(36, 39, 37, 26), width=2)
    if progress > 0:
        d.line([0, H - 4, int(W * progress), H - 4], fill=(185, 54, 69, 150), width=3)
    return img


def footer(d: ImageDraw.ImageDraw, s: str, color=INK_FAINT, size=19):
    text(d, (W - 96, H - 34), s, cn(size), color, anchor="ra", tracking=1.4)


# ---- assembly --------------------------------------------------------------
def timeline() -> dict:
    return json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))


def scene_at(tl: dict, t: float):
    scenes = tl["scenes"]
    for i, sc in enumerate(scenes):
        if t < sc["end"] or i == len(scenes) - 1:
            return i, sc
    return len(scenes) - 1, scenes[-1]


def beat_at(sc: dict, t: float):
    lines = sc["lines"]
    if not lines:
        return 0, t
    for i, line in enumerate(lines):
        if t < line["end"]:
            return i, max(0.0, t - line["start"])
    last = lines[-1]
    return len(lines) - 1, t - last["start"]


def render_frame(tl: dict, t: float):
    from scenes import SCENE_FUNCS

    idx, sc = scene_at(tl, t)
    local = t - sc["start"]
    beat, bt = beat_at(sc, t)
    progress = min(1.0, t / max(1e-6, tl["total"]))
    img = base_frame(BACKGROUND, sc["label"], progress)
    d = ImageDraw.Draw(img)
    SCENE_FUNCS[sc["visual"]](img, d, local, beat, bt, sc)
    footer(d, "foldyssey.app.workbuddy.host")
    return img.convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene")
    ap.add_argument("--t", type=float, default=0.0)
    ap.add_argument("--out", default="frame.png")
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    args = ap.parse_args()

    tl = timeline()

    if args.scene:
        sc = next(s for s in tl["scenes"] if s["visual"] == args.scene)
        off = sc["start"]
        lines = [dict(l, start=l["start"] - off, end=l["end"] - off) for l in sc["lines"]]
        fake = {"total": tl["total"], "scenes": [dict(sc, start=0.0, end=sc["end"] - off, lines=lines)]}
        img = render_frame(fake, args.t)
        img.save(args.out)
        print("wrote", args.out, img.size)
        return

    if args.video:
        t1 = args.t1 if args.t1 is not None else tl["total"]
        n0, n1 = int(args.t0 * FPS), int(t1 * FPS)
        out = Path(args.out) if args.out != "frame.png" else GEN / "picture.mp4"
        cmd = [
            "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
            "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for i in range(n0, n1):
            img = render_frame(tl, i / FPS)
            proc.stdin.write(img.tobytes())
            if (i - n0) % 150 == 0:
                print(f"frame {i}/{n1} ({(i - n0) / FPS:.1f}s)", flush=True)
        proc.stdin.close()
        proc.wait()
        print("wrote", out)
        return

    img = render_frame(tl, args.t)
    img.save(args.out)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
