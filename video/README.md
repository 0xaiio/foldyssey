# 宣传视频（3:29，1080p30）

这一版是「面向用户」的版本：没有技术细节、没有背景音乐，只有稳一点的男声旁白与逐句对齐的字幕。

本机没有可用的浏览器（Edge / Chromium 启动即退出，见 `TEST_REPORT.md` 第八轮），所以画面**不是录屏**：
图案用项目自己的几何引擎导出，再用 Pillow 逐帧绘制；只有 4 张界面截图来自浏览器还能用时的记录。

## 文件

| 文件 | 作用 |
|---|---|
| `script.py` | **内容的唯一来源**：9 个场景、42 句旁白与字幕、链接 |
| `tts.py` | Edge 神经语音逐句合成 → 由音频长度反推时间轴 → 生成 SRT / ASS / 口播稿 |
| `render.py` | 画面渲染基础件：品牌色、纸张底、遮罩、投影、截图卡、成帧与 ffmpeg 管道 |
| `scenes.py` | 九个场景：开场、首页、关卡、图案库、工坊、AI 灵感、手机、局限、参考资料 |
| `parallel.py` | 把时间轴切给 6 个进程并行渲染，再拼成一条 |
| `make.py` | 烧字幕、归一化响度、输出 MP4 与两张封面 |
| `shotlist.py` | 从时间轴生成分镜表 `out/shotlist.md` |
| `gen/` | 中间产物（不入库）：旁白、时间轴、ASS/SRT、分段视频 |
| `out/` | 交付件：`Foldyssey-1024.mp4`、封面、分镜 |

## 重新生成

```bash
cd video

# 0) 几何数据（需要 Node 依赖；输出到 video/gen/*.json）
cd .. && FOLDYSSEY_VIDEO=1 npx vitest run src/tests/video.dump.test.ts
FOLDYSSEY_VIDEO=1 npx vitest run src/tests/video.margin.test.ts && cd video

# 1) 旁白 + 时间轴 + 字幕（需要联网，Edge 语音）
python tts.py

# 2) 画面（6 进程，约 3 分钟）
python parallel.py --workers 6

# 3) 混音（只有人声）+ 烧字幕 + 封面
python make.py

# 4) 分镜表
python shotlist.py
```

只改一句旁白：改 `script.py` 后重跑 `tts.py`（缓存按文本哈希失效，只有那一句会重新合成），
再 `python parallel.py && python make.py`。

## 依赖

- Python：`pillow`、`numpy`、`edge-tts`、`qrcode`、`fonttools`（查缺字用）
- ffmpeg / ffprobe（本机为 MSYS2 的 9.0.2，需带 libass 与 libx264）
- 字体：`Microsoft YaHei`（正文）、`Book Antiqua`（拉丁标题）
- 公式：复用站点构建产物 `src/content/formulas.generated.ts`，用 `tools/svgprobe.py` 栅格化

## 几个刻意的取舍

- **一句一合成**：每句独立成音频，字幕就是这一句，起止即音频起止，**不可能不同步**；
  句间只留 0.16–0.24 秒的自然停顿（按句末标点决定），不切分句内停顿。
- **男声**：`zh-CN-YunyangNeural`（专业、可靠）−3% 语速。本机 SAPI 只有女声 Huihui，OneCore 的
  Kangkang 未挂到 SAPI，所以用 Edge 的神经语音。
- **没有配乐**：按需求只保留人声；`make.py` 里只剩 `loudnorm I=-16 TP=-1.5` 一条音轨处理。
- **画面不造假**：图案来自 `applyCuts()` 的真实输出；折叠/展开用的 `step_matrix()` 与
  `src/geometry/fold.ts` 的 `foldStepMatrix()` 逐行对应。
- **界面段落给截图卡**，不模拟鼠标；哪一块是截图、哪一块是渲染，分得清。
- **不讲技术**：全片不出现几何、容差、覆盖率；数字只在「参考资料」页作为出处出现。
