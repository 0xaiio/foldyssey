"""
Synthesise the narration and derive the timeline.

Voice: `zh-CN-YunyangNeural` (male, "professional / reliable") at −3 % — a calm
news-reader delivery rather than a chirpy assistant. Edge's neural voices are
the only natural male Chinese voice available here: the local SAPI install has
just Huihui (female), and OneCore's Kangkang is not exposed to SAPI.

One **sentence per clip**, so each subtitle is exactly one utterance: its start
and end are the clip's start and end, and it cannot drift from the voice. Clips
are joined with a 0.16–0.24 s pause that depends on the closing punctuation, so
the joins land where a speaker would breathe.

Outputs (all under `video/gen/`):
  voice.wav        full narration, 48 kHz mono
  timeline.json    scene / line boundaries in seconds
  subtitles.srt    for a CC track
  subtitles.ass    burned into the picture
  script.md        the read-aloud script
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

from script import SCENES, URL, GITHUB

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"
TTS = GEN / "tts"
GEN.mkdir(exist_ok=True)
TTS.mkdir(exist_ok=True)

VOICE = "zh-CN-YunyangNeural"
RATE = "-3%"
SR = 48_000

LEAD = 0.40        # silence before a scene starts
TAIL = 0.10        # a little air after the last word of a sentence


def gap_for(text: str) -> float:
    """Pause after a sentence: a touch longer after a full stop."""
    return 0.24 if text.rstrip().endswith(("。", "！", "？")) else 0.16


async def synth(text: str, out_mp3: Path) -> None:
    import edge_tts

    for attempt in range(3):
        try:
            c = edge_tts.Communicate(text, VOICE, rate=RATE)
            await c.save(str(out_mp3))
            if out_mp3.stat().st_size > 1000:
                return
        except Exception as exc:  # noqa: BLE001 - network hiccups happen
            if attempt == 2:
                raise
            await asyncio.sleep(1.2 * (attempt + 1))


def to_wav(mp3: Path, wav: Path) -> np.ndarray:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ac", "1", "-ar", str(SR),
         "-c:a", "pcm_s16le", str(wav)],
        check=True,
    )
    with wave.open(str(wav)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    return data.astype(np.float32) / 32768.0


def trim(samples: np.ndarray, threshold: float = 0.008, pad: float = 0.03) -> np.ndarray:
    if samples.size == 0:
        return samples
    mask = np.abs(samples) > threshold
    if not mask.any():
        return samples
    first = int(np.argmax(mask))
    last = len(samples) - int(np.argmax(mask[::-1]))
    p = int(pad * SR)
    return samples[max(0, first - p) : min(len(samples), last + p)]


def wrap_sub(text: str, limit: int = 24) -> str:
    """Break a long subtitle at a comma near the middle for a 2-line ASS line."""
    if len(text) <= limit:
        return text
    marks = [i for i, ch in enumerate(text) if ch in "，、；："]
    if not marks:
        return text
    best = min(marks, key=lambda i: abs(i - len(text) / 2))
    return text[: best + 1] + r"\N" + text[best + 1 :]


def stamp(sec: float, sep: str = ",") -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        ms, s = 0, s + 1
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


async def main() -> None:
    manifest: dict[str, str] = {}
    if (TTS / "manifest.json").exists():
        manifest = json.loads((TTS / "manifest.json").read_text(encoding="utf-8"))

    manifest: dict[str, str] = {}
    if (TTS / "manifest.json").exists():
        manifest = json.loads((TTS / "manifest.json").read_text(encoding="utf-8"))

    pieces: list[np.ndarray] = []
    cursor = 0.0
    timeline = []
    lines_out: list[dict] = []
    n = 0

    for scene in SCENES:
        scene_start = cursor
        pieces.append(np.zeros(int(LEAD * SR), dtype=np.float32))
        cursor += LEAD
        scene_lines = []
        for i, line in enumerate(scene["lines"]):
            n += 1
            mp3 = TTS / f"{n:03d}.mp3"
            wav = TTS / f"{n:03d}.wav"
            # The cache is keyed by the text itself: editing one sentence must
            # re-synthesise that sentence and nothing else.
            key = hashlib.sha1(f"{VOICE}|{RATE}|{line['say']}".encode()).hexdigest()[:12]
            if manifest.get(str(n)) != key or not mp3.exists() or mp3.stat().st_size < 1000:
                await synth(line["say"], mp3)
                manifest[str(n)] = key
                (TTS / "manifest.json").write_text(json.dumps(manifest, indent=0), encoding="utf-8")
            samples = trim(to_wav(mp3, wav))
            dur = len(samples) / SR
            scene_lines.append(
                {"say": line["say"], "sub": line["sub"], "start": round(cursor, 3), "end": round(cursor + dur, 3)}
            )
            lines_out.append(
                {
                    "index": n,
                    "scene": scene["id"],
                    "label": scene["label"],
                    "say": line["say"],
                    "sub": line["sub"],
                    "start": round(cursor, 3),
                    "end": round(cursor + dur, 3),
                }
            )
            pieces.append(samples)
            cursor += dur
            g = gap_for(line["say"])
            pieces.append(np.zeros(int((TAIL + g) * SR), dtype=np.float32))
            cursor += TAIL + g
        hold = scene.get("hold", 0.0)
        pieces.append(np.zeros(int(hold * SR), dtype=np.float32))
        cursor += hold
        timeline.append(
            {
                "id": scene["id"],
                "label": scene["label"],
                "visual": scene["visual"],
                "start": round(scene_start, 3),
                "end": round(cursor, 3),
                "lines": scene_lines,
            }
        )

    total = cursor + 0.6
    pieces.append(np.zeros(int(0.6 * SR), dtype=np.float32))
    audio = np.concatenate(pieces)
    peak = float(np.abs(audio).max()) or 1.0
    audio = np.clip(audio / peak * 0.89, -1, 1)
    with wave.open(str(GEN / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((audio * 32767).astype("<i2").tobytes())

    (GEN / "timeline.json").write_text(
        json.dumps({"total": round(total, 3), "fps": 30, "scenes": timeline}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    srt = []
    for i, line in enumerate(lines_out, 1):
        srt.append(f"{i}\n{stamp(line['start'])} --> {stamp(line['end'])}\n{line['sub']}\n")
    (GEN / "subtitles.srt").write_text("\n".join(srt), encoding="utf-8-sig")

    ass_head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Microsoft YaHei,44,&H00241F1C,&H00241F1C,&H00EDF5F7,&H50000000,0,0,0,0,100,100,0.5,0,1,2.2,1.0,2,150,150,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_lines = []
    for line in lines_out:
        # Escape first, wrap second: wrap_sub inserts a literal \N, which the
        # escaping pass would otherwise turn into a visible "＼N".
        raw = line["sub"].replace("\\", "＼").replace("{", "｛").replace("}", "｝")
        text = wrap_sub(raw)
        ass_lines.append(f"Dialogue: 0,{stamp(line['start'], '.')[:-1]},{stamp(line['end'], '.')[:-1]},Sub,,0,0,0,,{text}")
    (GEN / "subtitles.ass").write_text(ass_head + "\n".join(ass_lines) + "\n", encoding="utf-8")

    md = [f"# 口播稿（{total:.0f} 秒，{len(lines_out)} 句）\n"]
    for scene in timeline:
        md.append(f"\n## {scene['label']}　{scene['start']:.1f}s – {scene['end']:.1f}s\n")
        for line in scene["lines"]:
            md.append(f"- `{line['start']:>6.1f}` {line['say']}\n")
    md.append(f"\n链接：{URL}\n仓库：{GITHUB}\n")
    (GEN / "script.md").write_text("".join(md), encoding="utf-8")

    print(f"lines={len(lines_out)} total={total:.1f}s ({total/60:.2f} min)")


if __name__ == "__main__":
    asyncio.run(main())
