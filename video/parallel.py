"""
Render the picture in parallel chunks and stitch them.

A single process spends ~80 ms per 1080p frame, so the whole film is ~9 minutes
of one core. This machine has 24, so the timeline is cut into equal chunks, each
rendered by its own process into its own H.264 file, then concatenated with the
concat demuxer (identical encoder settings, so `-c copy` is safe).

    python parallel.py [--workers 6]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    tl = json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))
    total = tl["total"]
    fps = tl["fps"]
    frames = int(total * fps)

    n = max(1, args.workers)
    step = frames // n
    bounds = []
    for i in range(n):
        a = i * step
        b = frames if i == n - 1 else (i + 1) * step
        bounds.append((a, b))

    procs = []
    for i, (a, b) in enumerate(bounds):
        out = GEN / f"chunk{i}.mp4"
        cmd = [
            sys.executable,
            "render.py", "--video",
            "--from", f"{a / fps:.6f}", "--to", f"{b / fps:.6f}",
            "--out", str(out),
        ]
        log = open(GEN / f"chunk{i}.log", "w", encoding="utf-8")
        print(f"chunk {i}: frames {a}-{b} ({a/fps:.1f}s - {b/fps:.1f}s)")
        procs.append((i, subprocess.Popen(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT), log))

    failed = []
    for i, p, log in procs:
        code = p.wait()
        log.close()
        tail = (GEN / f"chunk{i}.log").read_text(encoding="utf-8", errors="replace").strip().splitlines()[-3:]
        print(f"chunk {i}: exit {code} | {' / '.join(tail)}")
        if code != 0:
            failed.append(i)

    if failed:
        raise SystemExit(f"chunks failed: {failed}")

    listing = GEN / "chunks.txt"
    listing.write_text("\n".join(f"file 'chunk{i}.mp4'" for i in range(n)), encoding="utf-8")
    out = GEN / "picture.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", "chunks.txt", "-c", "copy", str(out)],
        cwd=GEN, check=True,
    )
    print("wrote", out)


if __name__ == "__main__":
    main()
