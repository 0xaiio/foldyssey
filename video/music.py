"""
The music bed: a sparse D-minor-pentatonic pluck over a low pad.

Written from scratch with numpy so there is no licence question at all — a
contest entry cannot ship a track it has no rights to. Everything is synthesised:
Karplus-Strong for the plucked notes, additive sines for the pad, and a few
tapped delays for space. The mix sits far under the narration (see make.py),
ducked further whenever the voice is talking.
"""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"
SR = 48_000

NOTE = {
    "D2": 73.42, "A2": 110.00, "D3": 146.83, "F3": 174.61, "G3": 196.00,
    "A3": 220.00, "C4": 261.63, "D4": 293.66, "F4": 349.23, "G4": 392.00,
    "A4": 440.00, "C5": 523.25, "D5": 587.33,
}


def pluck(freq: float, dur: float, seed: int, bright: float = 0.5) -> np.ndarray:
    """Karplus-Strong: a noise burst in a feedback delay line."""
    n = max(2, int(round(SR / freq)))
    rng = np.random.default_rng(seed)
    buf = rng.normal(0, 1, n)
    # a gentle low-pass on the excitation keeps it soft rather than clicky
    k = 3
    buf = np.convolve(buf, np.ones(k) / k, mode="same")
    total = int(dur * SR)
    out = np.zeros(total)
    prev = 0.0
    damp = 0.996 - 0.004 * (1 - bright)
    for i in range(total):
        j = i % n
        v = buf[j]
        out[i] = v
        buf[j] = 0.5 * (v + prev) * damp
        prev = v
    env = np.exp(-np.linspace(0, 5.5, total))
    return out * env


def pad(t: np.ndarray, freq: float, detune: float = 0.0) -> np.ndarray:
    f = freq * (1 + detune)
    return (
        np.sin(2 * np.pi * f * t)
        + 0.32 * np.sin(2 * np.pi * 2 * f * t + 0.7)
        + 0.14 * np.sin(2 * np.pi * 3 * f * t + 1.9)
    )


def place(track: np.ndarray, sig: np.ndarray, at: float, gain: float) -> None:
    i = int(at * SR)
    if i >= len(track):
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i] * gain


def reverb(x: np.ndarray) -> np.ndarray:
    out = x.copy()
    for delay, gain in ((0.13, 0.32), (0.21, 0.22), (0.34, 0.14), (0.55, 0.08)):
        d = int(delay * SR)
        out[d:] += x[:-d] * gain
    return out


_pluck_cache: dict[str, np.ndarray] = {}


def main() -> None:
    total = json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))["total"] + 3.0
    n = int(total * SR)
    t = np.arange(n) / SR

    left = np.zeros(n)
    right = np.zeros(n)

    # ---- pad: D2 + A2, swelling every 16 s ----
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 31.0 - 1.2)
    body = pad(t, NOTE["D2"]) * 0.55 + pad(t, NOTE["A2"]) * 0.34 + pad(t, NOTE["D3"], 0.002) * 0.18
    body *= 0.10 * (0.55 + 0.45 * swell)
    left += body * 1.0
    right += body * 0.92

    # ---- plucks: a slow melody, one note every ~2.4 s, never on the beat ----
    rng = np.random.default_rng(11)
    melody = ["D4", "A3", "F4", "D4", "C4", "A3", "G3", "D4", "F4", "C4", "D4", "A3"]
    i = 0
    at = 1.5
    while at < total - 4:
        name = melody[i % len(melody)]
        if rng.random() < 0.22:
            at += 2.2
            i += 1
            continue
        dur = 2.6
        gain = 0.055 + 0.02 * rng.random()
        sig = _pluck_cache.get(name)
        if sig is None:
            sig = pluck(NOTE[name], dur, seed=100 + len(_pluck_cache))
            _pluck_cache[name] = sig
        place(left, sig, at, gain * 1.0)
        place(right, sig, at + 0.012, gain * 0.92)
        at += 2.1 + 0.9 * rng.random()
        i += 1

    # ---- a low D on every scene change, to mark the chapters ----
    tl = json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))
    for sc in tl["scenes"][1:]:
        sig = pluck(NOTE["D3"], 3.2, seed=7, bright=0.3) * 0.9
        place(left, sig, sc["start"], 0.05)
        place(right, sig, sc["start"] + 0.015, 0.045)

    left = reverb(left)
    right = reverb(right)

    # gentle fade in/out and a soft top-end roll-off (one-pole low-pass)
    fade = np.ones(n)
    fi, fo = int(2.5 * SR), int(4.0 * SR)
    fade[:fi] = np.linspace(0, 1, fi) ** 1.5
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.2
    kernel = np.hanning(9)
    kernel /= kernel.sum()
    left = np.convolve(left, kernel, mode="same")
    right = np.convolve(right, kernel, mode="same")
    left *= fade
    right *= fade

    peak = max(np.abs(left).max(), np.abs(right).max())
    scale = 0.5 / max(peak, 1e-9)
    left *= scale
    right *= scale

    stereo = np.stack([left, right], axis=1)
    data = (np.clip(stereo, -1, 1) * 32767).astype("<i2")
    with wave.open(str(GEN / "music.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print(f"music {total:.1f}s written")


if __name__ == "__main__":
    main()
