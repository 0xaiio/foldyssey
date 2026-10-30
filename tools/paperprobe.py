"""Rasterise polygon JSON produced by the vitest probe into a PNG contact sheet.

Pure Python: even-odd scanline fill + zlib PNG writer, no third-party deps.

    python tools/paperprobe.py .tmp-shots/patterns.json .tmp-shots/patterns.png
"""
from __future__ import annotations

import json
import math
import struct
import sys
import zlib


def png(path: str, w: int, h: int, rgb: bytearray) -> None:
    raw = bytearray()
    stride = w * 3
    for y in range(h):
        raw.append(0)
        raw += rgb[y * stride : (y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    body = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(body)


def fill(canvas: bytearray, w: int, h: int, rings: list[list[tuple[float, float]]], colour) -> None:
    """Even-odd scanline fill of a ring list, coordinates already in pixels."""
    if not rings:
        return
    ys = [p[1] for ring in rings for p in ring]
    y0 = max(0, int(math.floor(min(ys))))
    y1 = min(h - 1, int(math.ceil(max(ys))))
    edges = []
    for ring in rings:
        n = len(ring)
        for i in range(n):
            xa, ya = ring[i]
            xb, yb = ring[(i + 1) % n]
            if ya == yb:
                continue
            edges.append((xa, ya, xb, yb))
    for y in range(y0, y1 + 1):
        cy = y + 0.5
        xs = []
        for xa, ya, xb, yb in edges:
            if (ya <= cy < yb) or (yb <= cy < ya):
                t = (cy - ya) / (yb - ya)
                xs.append(xa + (xb - xa) * t)
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            x_from = max(0, int(math.ceil(xs[i] - 0.5)))
            x_to = min(w - 1, int(math.floor(xs[i + 1] - 0.5)))
            for x in range(x_from, x_to + 1):
                o = (y * w + x) * 3
                canvas[o] = colour[0]
                canvas[o + 1] = colour[1]
                canvas[o + 2] = colour[2]


FONT = {
    '0': ('111', '101', '101', '101', '111'),
    '1': ('010', '110', '010', '010', '111'),
    '2': ('111', '001', '111', '100', '111'),
    '3': ('111', '001', '111', '001', '111'),
    '4': ('101', '101', '111', '001', '001'),
    '5': ('111', '100', '111', '001', '111'),
    '6': ('111', '100', '111', '101', '111'),
    '7': ('111', '001', '010', '010', '010'),
    '8': ('111', '101', '111', '101', '111'),
    '9': ('111', '101', '111', '001', '111'),
}


def draw_text(canvas: bytearray, w: int, h: int, text: str, x0: int, y0: int, scale: int = 3) -> None:
    cx = x0
    for ch in text:
        glyph = FONT.get(ch)
        if glyph:
            for gy, line in enumerate(glyph):
                for gx, bit in enumerate(line):
                    if bit != '1':
                        continue
                    for dy in range(scale):
                        for dx in range(scale):
                            x, y = cx + gx * scale + dx, y0 + gy * scale + dy
                            if 0 <= x < w and 0 <= y < h:
                                o = (y * w + x) * 3
                                canvas[o : o + 3] = bytes((36, 39, 37))
        cx += 4 * scale


def main() -> int:
    src = sys.argv[1]
    out = sys.argv[2]
    rows = json.load(open(src, encoding='utf-8'))
    cell = 190
    pad = 14
    cols = min(6, max(1, len(rows)))
    lines = (len(rows) + cols - 1) // cols
    W = cols * (cell + pad) + pad
    H = lines * (cell + pad + 18) + pad
    canvas = bytearray([248, 243, 233] * (W * H))

    for idx, row in enumerate(rows):
        cx = pad + (idx % cols) * (cell + pad)
        cy = pad + (idx // cols) * (cell + pad + 18)
        # frame
        for x in range(cx, cx + cell):
            for y in (cy, cy + cell - 1):
                o = (y * W + x) * 3
                canvas[o : o + 3] = bytes((226, 214, 192))
        for y in range(cy, cy + cell):
            for x in (cx, cx + cell - 1):
                o = (y * W + x) * 3
                canvas[o : o + 3] = bytes((226, 214, 192))
        work = bytearray(canvas)
        rings = []
        k = 0.5 * (cell - 8)
        for poly in row['paper']:
            for ring in poly:
                pix = []
                for pt in ring:
                    px, py = (pt['x'], pt['y']) if isinstance(pt, dict) else (pt[0], pt[1])
                    pix.append((cx + 4 + k * (px + 1), cy + 4 + k * (1 - py)))
                rings.append(pix)
        fill(work, W, H, rings, (185, 54, 69))
        canvas = work
        draw_text(canvas, W, H, str(idx + 1), cx + 5, cy + 5, 3)
        # 2px black-ish label bar marker: number of cuts as ticks
        for k in range(len(row['cuts'])):
            for x in range(cx + 6 + k * 9, cx + 12 + k * 9):
                for y in range(cy + cell - 10, cy + cell - 6):
                    o = (y * W + x) * 3
                    canvas[o : o + 3] = bytes((201, 164, 106))

    png(out, W, H, canvas)
    print(f'{out} {W}x{H} rows={len(rows)}')
    for row in rows:
        print(f"  {row['name']:<18} area={row['area']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
