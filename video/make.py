"""
Assemble the finished film: burn subtitles, mix voice + music, write the MP4 and
the cover.

    python make.py

Reads   gen/picture.mp4, gen/voice.wav, gen/music.wav, gen/subtitles.ass
Writes  out/Foldyssey-1024.mp4  (H.264 1080p30, AAC 192k, subtitles burned in)
        out/Foldyssey-cover.png (1920x1080) and out/Foldyssey-cover-1146x717.png
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

import render as R
from render import CX, INK, RED, W, H, cn, cnb, serif, text

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

NAME = "Foldyssey-1024"


def mux() -> Path:
    total = json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))["total"]
    out = OUT / f"{NAME}.mp4"
    # -filter_complex: [0:v] burn subs; music ducked under the voice; limiter last.
    graph = (
        "[0:v]ass=gen/subtitles.ass[v];"
        "[2:a]volume=0.30,highpass=f=60[m];"
        # the voice feeds both the sidechain and the mix, so it must be split
        "[1:a]aresample=48000,volume=1.0,asplit=2[voice][side];"
        "[m][side]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=420:makeup=1[duck];"
        # B站 plays loudness-normalised, so target -16 LUFS / -1.5 dBTP instead of
        # leaving the mix at whatever the synthesiser happened to produce.
        "[duck][voice]amix=inputs=2:duration=first:normalize=0,"
        "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.94[a]"
    )
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(GEN / "picture.mp4"),
        "-i", str(GEN / "voice.wav"),
        "-i", str(GEN / "music.wav"),
        "-filter_complex", graph,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-t", f"{total:.3f}",
        "-movflags", "+faststart",
        "-metadata", "title=Foldyssey 一刀万象 · 1024 造物挑战",
        "-metadata", "comment=https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z",
        str(out),
    ]
    print("ffmpeg:", " ".join(cmd[:8]), "…")
    subprocess.run(cmd, check=True, cwd=ROOT)
    return out


def cover() -> None:
    """Two covers: a 16:9 title plate and the 1146×717 B站 thumbnail.

    They are composed separately rather than cropped: the thumbnail's aspect is
    1.6, so cropping the 16:9 plate cuts the label off at the left edge.
    """
    lvl = next(l for l in R.LEVELS if l["id"] == "caisson")

    # ---- 16:9 title plate ----
    img = R.base_frame(R.BACKGROUND, "1024 造物挑战 · 参赛作品", 0.0)
    d = ImageDraw.Draw(img)
    R.draw_art(img, lvl["target"], 268, 520, 470, RED, shadow=True)
    text(d, (900, 250), "Foldyssey", serif(124, bold=True), INK)
    text(d, (906, 420), "一 刀 万 象", cnb(40), (157, 43, 57), tracking=6)
    text(d, (906, 492), "折起一张纸，只剪一刀，再亲手展开。", cn(27), (86, 91, 86))
    text(d, (906, 552), "图案不是画上去的，是算出来的。", cn(27), (86, 91, 86))
    d.rounded_rectangle([906, 640, 1640, 712], 10, fill=(255, 253, 248), outline=(201, 164, 106), width=2)
    text(d, (926, 658), "foldyssey.app.workbuddy.host", cn(25), (157, 43, 57))
    text(d, (906, 760), "16 关 · 5 种折法 · 4 种刀具 · 214 个测试", cn(22), (138, 141, 134))
    img.convert("RGB").save(OUT / "Foldyssey-cover.png")

    # ---- B站 thumbnail, 1146×717, laid out for its own aspect ----
    w, h = 1146, 717
    bg = R.BACKGROUND.resize((w, h), Image.LANCZOS)
    t = bg.convert("RGBA")
    td = ImageDraw.Draw(t)
    td.text((44, 36), "1024 造物挑战 · 参赛作品", font=cn(17), fill=(201, 164, 106))
    td.line([44, 66, 168, 66], fill=(201, 164, 106), width=2)
    R.draw_art(t, lvl["target"], 168, 268, 380, RED, shadow=True)
    text(td, (505, 138), "Foldyssey", serif(78, bold=True), INK)
    text(td, (508, 246), "一 刀 万 象", cnb(27), (157, 43, 57), tracking=5)
    text(td, (508, 300), "折起一张纸，只剪一刀，再亲手展开。", cn(19), (86, 91, 86))
    text(td, (508, 336), "图案不是画上去的，是算出来的。", cn(19), (86, 91, 86))
    td.rounded_rectangle([508, 386, 1080, 438], 8, fill=(255, 253, 248), outline=(201, 164, 106), width=2)
    text(td, (524, 399), "foldyssey.app.workbuddy.host", cn(18), (157, 43, 57))
    text(td, (508, 470), "16 关 · 5 种折法 · 4 种刀具 · 214 个测试", cn(16), (138, 141, 134))
    t.convert("RGB").save(OUT / "Foldyssey-cover-1146x717.png")
    print("cover written")


def main() -> None:
    out = mux()
    size = out.stat().st_size / 1e6
    print(f"{out}  {size:.1f} MB")
    cover()


if __name__ == "__main__":
    main()
