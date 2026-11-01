#!/usr/bin/env python
"""Rasterise a generated formula SVG to PNG, for visual review.

No browser and no extra dependency: it reads the SVG string out of
`src/content/formulas.generated.ts`, flattens the path subset MathJax emits
(M L H V Q T Z under nested translate/scale groups) and fills it with the
non-zero winding rule, then writes a PNG with zlib.

This exists because the build environment cannot start Chromium (see
TEST_REPORT.md). It verifies that the compiled formula *draws* the right glyphs
in the right places — not merely that the path data is syntactically valid.

Usage:
    python tools/svgprobe.py unfold [more names...] [--width 1200]

Writes `.tmp-formulas/<name>.png`.
"""

from __future__ import annotations

import json
import math
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERATED = ROOT / "src" / "content" / "formulas.generated.ts"
OUT_DIR = ROOT / ".tmp-formulas"


def read_svg(name: str) -> str:
    text = GENERATED.read_text(encoding="utf-8")
    pattern = re.compile(r'"' + re.escape(name) + r'": \{.*?svg: ("(?:[^"\\]|\\.)*")', re.S)
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"formula {name!r} not found in {GENERATED}")
    return json.loads(match.group(1))


def parse_viewbox(svg: str) -> tuple[float, float, float, float]:
    m = re.search(r'viewBox="([^"]+)"', svg)
    if not m:
        raise SystemExit("no viewBox")
    x, y, w, h = (float(v) for v in m.group(1).split())
    return x, y, w, h


# --------------------------------------------------------------------------- #
# transforms: (a, b, c, d, e, f) maps (x, y) -> (a x + c y + e, b x + d y + f)
# --------------------------------------------------------------------------- #

IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mul(m: tuple, n: tuple) -> tuple:
    """m ∘ n: apply n first, then m."""
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def parse_transform(value: str) -> tuple:
    out = IDENTITY
    for name, args in re.findall(r"([a-zA-Z]+)\(([^)]*)\)", value or ""):
        nums = [float(v) for v in re.findall(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        if name == "translate":
            tx = nums[0] if nums else 0.0
            ty = nums[1] if len(nums) > 1 else 0.0
            out = mul(out, (1, 0, 0, 1, tx, ty))
        elif name == "scale":
            sx = nums[0] if nums else 1.0
            sy = nums[1] if len(nums) > 1 else sx
            out = mul(out, (sx, 0, 0, sy, 0, 0))
        elif name == "matrix" and len(nums) == 6:
            out = mul(out, tuple(nums))  # type: ignore[arg-type]
        elif name == "rotate" and nums:
            a = math.radians(nums[0])
            # rotation about (cx, cy) when given
            cx, cy = (nums[1], nums[2]) if len(nums) >= 3 else (0.0, 0.0)
            r = (math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0)
            out = mul(out, mul(mul((1, 0, 0, 1, cx, cy), r), (1, 0, 0, 1, -cx, -cy)))
    return out


def apply(m: tuple, p: tuple[float, float]) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)


# --------------------------------------------------------------------------- #
# path flattening (M L H V Q T Z, absolute and relative)
# --------------------------------------------------------------------------- #

TOKEN = re.compile(r"[MmLlHhVvQqTtZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?")


def flatten_path(d: str, ctm: tuple, steps: int = 12) -> list[list[tuple[float, float]]]:
    tokens = TOKEN.findall(d)
    i = 0
    subs: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    pos = (0.0, 0.0)
    start = (0.0, 0.0)
    ctrl: tuple[float, float] | None = None
    cmd = ""

    def num() -> float:
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    while i < len(tokens):
        if TOKEN.match(tokens[i]) and tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                if cur:
                    cur.append(apply(ctm, start))
                    subs.append(cur)
                    cur = []
                pos = start
                ctrl = None
                continue
        if cmd in "Mm":
            x, y = num(), num()
            if cmd == "m":
                x, y = pos[0] + x, pos[1] + y
            if cur:
                cur.append(apply(ctm, start))
                subs.append(cur)
            pos = (x, y)
            start = pos
            cur = [apply(ctm, pos)]
            ctrl = None
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            x, y = num(), num()
            if cmd == "l":
                x, y = pos[0] + x, pos[1] + y
            pos = (x, y)
            cur.append(apply(ctm, pos))
            ctrl = None
        elif cmd in "Hh":
            x = num()
            if cmd == "h":
                x += pos[0]
            pos = (x, pos[1])
            cur.append(apply(ctm, pos))
            ctrl = None
        elif cmd in "Vv":
            y = num()
            if cmd == "v":
                y += pos[1]
            pos = (pos[0], y)
            cur.append(apply(ctm, pos))
            ctrl = None
        elif cmd in "Qq":
            qx, qy = num(), num()
            x, y = num(), num()
            if cmd == "q":
                qx, qy, x, y = pos[0] + qx, pos[1] + qy, pos[0] + x, pos[1] + y
            p0 = pos
            for k in range(1, steps + 1):
                t = k / steps
                mt = 1 - t
                px = mt * mt * p0[0] + 2 * mt * t * qx + t * t * x
                py = mt * mt * p0[1] + 2 * mt * t * qy + t * t * y
                cur.append(apply(ctm, (px, py)))
            ctrl = (qx, qy)
            pos = (x, y)
        elif cmd in "Tt":
            x, y = num(), num()
            if cmd == "t":
                x, y = pos[0] + x, pos[1] + y
            if ctrl is None:
                qx, qy = pos
            else:
                qx, qy = 2 * pos[0] - ctrl[0], 2 * pos[1] - ctrl[1]
            p0 = pos
            for k in range(1, steps + 1):
                t = k / steps
                mt = 1 - t
                px = mt * mt * p0[0] + 2 * mt * t * qx + t * t * x
                py = mt * mt * p0[1] + 2 * mt * t * qy + t * t * y
                cur.append(apply(ctm, (px, py)))
            ctrl = (qx, qy)
            pos = (x, y)
        else:
            raise SystemExit(f"unsupported path command {cmd!r} in {d[:60]}")

    if cur:
        # `start` is in path coordinates, `cur` is already transformed — appending
        # the raw point here would draw a long spike back to the glyph origin.
        first = apply(ctm, start)
        if cur[0] != first:
            cur.append(first)
        subs.append(cur)
    return [s for s in subs if len(s) >= 3]


def collect_paths(svg: str) -> list[list[tuple[float, float]]]:
    subs: list[list[tuple[float, float]]] = []
    ctm = IDENTITY
    stack: list[tuple] = []
    # Walk tags in order, tracking <g> nesting. MathJax wraps every formula in
    # <g transform="scale(1,-1)"> and nests <g data-mml-node> inside it, so the
    # transform stack matters: resetting on </g> would drop the y-flip.
    for match in re.finditer(r"<(/?)(g|path|svg)\b([^>]*)>", svg):
        closing, tag, attrs = match.groups()
        if tag == "g":
            if closing:
                ctm = stack.pop() if stack else IDENTITY
            else:
                stack.append(ctm)
                t = re.search(r'transform="([^"]*)"', attrs)
                if t:
                    ctm = mul(ctm, parse_transform(t.group(1)))
        elif tag == "path" and not closing:
            d = re.search(r'\sd="([^"]*)"', attrs)
            if d:
                subs.extend(flatten_path(d.group(1), ctm))
    return subs


# --------------------------------------------------------------------------- #
# non-zero scanline fill + PNG
# --------------------------------------------------------------------------- #


def fill_polygons(subs, width: int, height: int, vb, scale: float, ss: int = 2):
    vx, vy, _, _ = vb
    px_w, px_h = width * ss, height * ss
    img = bytearray([255]) * (px_w * px_h)
    # Pre-transform points to pixel space.
    polys = [
        [((x - vx) * scale * ss, (y - vy) * scale * ss) for x, y in sub]
        for sub in subs
    ]
    edges = []
    for poly in polys:
        for i in range(len(poly)):
            edges.append((poly[i], poly[(i + 1) % len(poly)]))

    for py in range(px_h):
        y = py + 0.5
        xs = []
        for (x1, y1), (x2, y2) in edges:
            if (y1 <= y < y2) or (y2 <= y < y1):
                t = (y - y1) / (y2 - y1)
                xs.append((x1 + (x2 - x1) * t, 1 if y2 > y1 else -1))
        if not xs:
            continue
        xs.sort()
        winding = 0
        last_x = None
        for x, direction in xs:
            if winding != 0 and last_x is not None:
                a = max(0, int(round(last_x)))
                b = min(px_w, int(round(x)))
                if b > a:
                    img[py * px_w + a : py * px_w + b] = b"\x00" * (b - a)
            winding += direction
            last_x = x

    # Downsample (box filter) to width x height.
    out = bytearray(width * height)
    inv = 1.0 / (ss * ss)
    for y in range(height):
        for x in range(width):
            s = 0
            for dy in range(ss):
                row = (y * ss + dy) * px_w + x * ss
                for dx in range(ss):
                    s += img[row + dx]
            out[y * width + x] = int(s * inv)
    return out


def write_png(path: Path, pixels: bytes, width: int, height: int) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * width : (y + 1) * width]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def render(name: str, target_width: int = 1200) -> Path:
    svg = read_svg(name)
    vb = parse_viewbox(svg)
    subs = collect_paths(svg)
    if not subs:
        raise SystemExit(f"no drawable paths in {name}")
    vw, vh = vb[2], vb[3]
    scale = target_width / vw
    width = target_width
    height = max(1, int(round(vh * scale)))
    pixels = fill_polygons(subs, width, height, vb, scale, ss=2)
    out = OUT_DIR / f"{name}.png"
    out.parent.mkdir(exist_ok=True)
    write_png(out, pixels, width, height)
    print(f"{name}: {len(subs)} subpaths, {width}x{height} -> {out.relative_to(ROOT)}")
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    width = 1200
    for a in sys.argv[1:]:
        if a.startswith("--width="):
            width = int(a.split("=", 1)[1])
    if not args:
        args = ["unfold"]
    for n in args:
        render(n, width)
