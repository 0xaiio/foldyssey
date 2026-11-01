"""Emit the shot list (分镜) from the timing data, so it can never drift."""
import json
from pathlib import Path

GEN = Path(__file__).resolve().parent / "gen"
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

VISUAL = {
    "open": ("折 → 剪 → 展", "整张红纸被折成 45° 纸包（镜头随折推进），沿切口轮廓走刀，再逐层展开成八瓣团花；片名浮出。几何来自 `applyCuts()` 的真实输出。"),
    "home": ("首页", "整页截图 + 六条要点逐条点亮：三件事、会自己折的纸、七个入口、图案库、两个按钮、开源仓库。图案库一帧换成真实关卡数据画出的八张卡片；最后一帧压暗页面，弹出 GitHub 地址卡。"),
    "level": ("一刀挑战", "先看折好的纸包与右侧目标（两个高亮框），再切到剪完之后的界面：画布、评分卡、差异覆盖/再来一次/差在哪；最后一屏是四档刀法的卡片。"),
    "library": ("图案库", "十六张图案卡按五阶段铺开（真实关卡数据渲染），随后切到单张卡片展开：折法、这一刀剪什么、展开之后三行说明。"),
    "studio": ("剪纸工坊", "工坊整页截图 + 四条要点；刀型一帧弹出四种刀具标签，导出一帧出现 SVG / PNG。"),
    "ai": ("AI 灵感", "顶部一句话示例，下面是模型一次给出的九个候选（真实生成结果），右侧三步：写一句话 → 拿一张图 → 带回去改。后半段是六个可点模板。"),
    "gallery": ("我的作品与手机", "两台手机截图（首页、关卡页）并排，右侧三条：存在本地、随时接着改、竖屏能玩。"),
    "limits": ("现在与以后", "左栏「现在」三条做不到的事（×），右栏「接下来」三条计划（→），逐条淡入；脚注说明限制也写在站内关于页。"),
    "credits": ("参考资料", "左：Erik D. Demaine 的字母徽章与所属；右：折剪定理出处、DOI、作者主页；底部：试玩地址与 GitHub 仓库，末尾一行免责说明。"),
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
