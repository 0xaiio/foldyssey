"""
Synthesise the narration and derive the timeline.

One WAV per subtitle line, so the on-screen text is timed by the audio itself
rather than by guesswork. Outputs, all under `video/gen/`:

  timeline.json    scene/line boundaries in seconds
  voice.wav        the full narration, silence between lines
  subtitles.srt    for the B站 CC upload
  subtitles.ass    burned into the picture
  script.md        the readable 口播稿 (for the submission pack)
"""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np
import win32com.client as win32

from script import SCENES, URL

ROOT = Path(__file__).resolve().parent
GEN = ROOT / "gen"
AUDIO = GEN / "audio"
GEN.mkdir(exist_ok=True)
AUDIO.mkdir(exist_ok=True)

RATE = 22_050
LEAD = 0.45      # silence before the first line of a scene
GAP = 0.32       # silence between lines inside a scene
TAIL = 0.12      # a little air after each line


def _voice():
    voice = win32.Dispatch("SAPI.SpVoice")
    voices = voice.GetVoices()
    for i in range(voices.Count):
        if "Huihui" in voices.Item(i).GetDescription():
            voice.Voice = voices.Item(i)
            break
    else:  # pragma: no cover - defensive
        raise SystemExit("No Chinese SAPI voice found")
    voice.Rate = 0
    voice.Volume = 100
    return voice


def synth(voice, text: str, path: Path) -> None:
    stream = win32.Dispatch("SAPI.SpFileStream")
    stream.Open(str(path), 3)
    voice.AudioOutputStream = stream
    voice.Speak(text)
    stream.Close()


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        assert w.getframerate() == RATE, (path, w.getframerate())
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def trim(samples: np.ndarray, threshold: float = 0.012, pad: float = 0.05) -> np.ndarray:
    """Drop the lead-in/lead-out silence SAPI adds, keeping a short pad."""
    if samples.size == 0:
        return samples
    mask = np.abs(samples) > threshold
    if not mask.any():
        return samples
    first = int(np.argmax(mask))
    last = len(samples) - int(np.argmax(mask[::-1]))
    p = int(pad * RATE)
    return samples[max(0, first - p) : min(len(samples), last + p)]


def main() -> None:
    voice = _voice()
    pieces: list[np.ndarray] = []
    cursor = 0.0
    timeline = []
    lines_out = []
    n = 0

    for scene in SCENES:
        scene_start = cursor
        pieces.append(np.zeros(int(LEAD * RATE), dtype=np.float32))
        cursor += LEAD
        scene_lines = []
        for i, line in enumerate(scene["lines"]):
            n += 1
            wav = AUDIO / f"{n:03d}.wav"
            synth(voice, line["say"], wav)
            samples = trim(read_wav(wav))
            dur = len(samples) / RATE
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
            pieces.append(np.zeros(int(TAIL * RATE) + (int(GAP * RATE) if i < len(scene["lines"]) - 1 else 0)))
            cursor += TAIL + (GAP if i < len(scene["lines"]) - 1 else 0)
        hold = scene.get("hold", 0.0)
        pieces.append(np.zeros(int(hold * RATE), dtype=np.float32))
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

    total = cursor
    # A short pad so the last frame can breathe.
    pieces.append(np.zeros(int(0.4 * RATE), dtype=np.float32))
    total += 0.4
    audio = np.concatenate(pieces)
    with wave.open(str(GEN / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())

    (GEN / "timeline.json").write_text(
        json.dumps({"total": round(total, 3), "fps": 30, "scenes": timeline}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    # ---- SRT ----
    def stamp(sec: float, sep: str = ",") -> str:
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        ms = int(round((sec - int(sec)) * 1000))
        if ms == 1000:
            ms, s = 0, s + 1
        return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"

    srt = []
    for i, line in enumerate(lines_out, 1):
        srt.append(f"{i}\n{stamp(line['start'])} --> {stamp(line['end'])}\n{line['sub']}\n")
    (GEN / "subtitles.srt").write_text("\n".join(srt), encoding="utf-8-sig")

    # ---- ASS (burned in) ----
    ass_head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Microsoft YaHei,46,&H00241F1C,&H00241F1C,&H00E8F3F6,&H50000000,0,0,0,0,100,100,0.6,0,1,2.4,1.2,2,180,180,74,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_lines = []
    for line in lines_out:
        text = line["sub"].replace("\\", "＼").replace("{", "｛").replace("}", "｝")
        ass_lines.append(
            f"Dialogue: 0,{stamp(line['start'], '.')[:-1]},{stamp(line['end'], '.')[:-1]},Sub,,0,0,0,,{text}"
        )
    (GEN / "subtitles.ass").write_text(ass_head + "\n".join(ass_lines) + "\n", encoding="utf-8")

    # ---- readable script ----
    md = [f"# 口播稿（自动生成，总时长 {total:.1f} 秒）\n"]
    for scene in timeline:
        md.append(f"\n## {scene['label']}　{scene['start']:.1f}s – {scene['end']:.1f}s\n")
        for line in scene["lines"]:
            md.append(f"- `{line['start']:>6.1f}` {line['say']}")
    md.append(f"\n\n链接：{URL}\n")
    (GEN / "script.md").write_text("".join(md), encoding="utf-8")

    print(f"lines={len(lines_out)} total={total:.1f}s ({total/60:.2f} min)")


if __name__ == "__main__":
    main()
