"""Emit the shot list (分镜) from the timing data, so it can never drift."""
import json
from pathlib import Path

GEN = Path(__file__).resolve().parent / "gen"
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

VISUAL = {
    "open": ("折 → 剪 → 展", "整张红纸被折成 45° 纸包（镜头随折推进），沿切口轮廓走刀，再逐层展开成八瓣团花；片名浮出。几何全部来自 `applyCuts()` 的真实输出。"),
    "theorem": ("折剪定理", "先给三位作者与论文出处；三张卡片依次是「任意一族直线段 → 存在一种平折 + 一条直线 → 一刀剪出」；随后用一段中文陈述该定理，再落到「定理 ≠ 你折得出来」的三行对照。"),
    "product": ("三步，看见几何", "左侧「折 / 剪 / 展」三行，右侧整页产品截图（首页），底部四枚属性标签。"),
    "math": ("一条公式", "左侧整张纸与 4 条折痕 → 一支箭头指向右侧纸包（8 个片区 → 8 个保距变换）→ 纸包内剪掉 D、八层各自的红色原像 → 展开结果；底部是构建期编译的 LaTeX 公式。"),
    "levels": ("剪刀能力与容差", "四档「一刀 / 两刀 / 拐弯 / 曲线」；16 张关卡卡片刻度；切到实测条形图：每关一格滑块后的最差 IoU 与该关达标线，最低柱标「最差」。"),
    "patterns": ("十六个图案", "4×2 图案墙（团花 / 藻井 / 菱窗 / 六出 / 重瓣 …）；后半段换成四个曲线关（波边 / 旋风 / 葫芦 / 花窗），并给出高度场与误差界。"),
    "ai": ("工坊与模型", "工坊截图 + 三条能力；「一句话 → 结构 JSON → 校验修复 → 几何引擎 → 图案」五格流程；AI 生成的九个图案缩略图。"),
    "rigor": ("可信度", "三个数字（214 / 96.7% / 5×4）；「纸 + 剪掉的部分 = 4」的条形；审查修掉的三个静默缺陷与修复后的管线。"),
    "outro": ("片尾", "藻井图案 + 片名 + 网址条 + 二维码 + 参考文献与免责声明。"),
}

tl = json.loads((GEN / "timeline.json").read_text(encoding="utf-8"))


def ts(sec: float) -> str:
    m, s = divmod(sec, 60)
    return f"{int(m):02d}:{s:05.2f}"


rows = []
for sc in tl["scenes"]:
    name, desc = VISUAL[sc["visual"]]
    rows.append(f"### {sc['label']}　{ts(sc['start'])} – {ts(sc['end'])}\n")
    rows.append(f"**画面**：{desc}\n")
    rows.append("| 时间 | 旁白 / 字幕 |\n|---|---|")
    for line in sc["lines"]:
        rows.append(f"| `{ts(line['start'])}` | {line['say']} |")
    rows.append("")

doc = f"""# 分镜脚本（{tl['total']:.0f} 秒 · {len(tl['scenes'])} 个场景）

> 自动生成：`python shotlist.py`。旁白与字幕的原文在 `video/script.py`，
> 时间码由 `tts.py` 按实际语音长度反推，所以这张表与实际成片逐帧一致。

{chr(10).join(rows)}
"""
(OUT / "shotlist.md").write_text(doc, encoding="utf-8")
print("wrote", OUT / "shotlist.md")
