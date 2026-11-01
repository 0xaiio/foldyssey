# 宣传视频（3:47，1080p30）

这条片子**没有录屏**：本机的 Edge 与 Chromium 从 2026-10-31 起启动即退出（见 `TEST_REPORT.md`
第八轮），所以画面是用项目自己的几何引擎导出数据、再用 Pillow 逐帧画出来的；
只有 4 张界面截图来自浏览器还能用时的自查记录。每一帧都能复现。

## 文件

| 文件 | 作用 |
|---|---|
| `script.py` | **内容的唯一来源**：9 个场景、38 句旁白与字幕、链接 |
| `tts.py` | SAPI（Microsoft Huihui）逐句合成 → 由音频长度反推时间轴 → 生成 SRT / ASS / 口播稿 |
| `render.py` | 画面渲染：品牌色、纸张底、遮罩、投影、截图卡、成帧与 ffmpeg 管道 |
| `scenes.py` | 九个场景的绘制（开场折叠/展开、定理、产品、原理、关卡图表、图案、AI、可信度、片尾） |
| `music.py` | 用 numpy 合成配乐（Karplus-Strong 拨弦 + 正弦垫音 + 多抽头延迟） |
| `make.py` | 混音（人声侧链压低音乐）、烧字幕、输出成片与封面 |
| `gen/` | 中间产物（不入库）：`timeline.json`、`voice.wav`、`music.wav`、`picture.mp4`、字幕 |
| `out/` | 交付件（不入库）：`Foldyssey-1024.mp4`、两张封面 |

## 重新生成

```bash
cd video

# 0) 几何数据（需要 Node 依赖；输出到 video/gen/*.json）
cd .. && FOLDYSSEY_VIDEO=1 npx vitest run src/tests/video.dump.test.ts
FOLDYSSEY_VIDEO=1 npx vitest run src/tests/video.margin.test.ts && cd video

# 1) 旁白 + 时间轴 + 字幕（Windows SAPI 中文语音）
python tts.py

# 2) 配乐
python music.py

# 3) 画面（约 10 分钟，1080p30，直接管道给 x264）
python render.py --video

# 4) 混音 + 烧字幕 + 封面
python make.py
```

只想看某一帧：

```bash
python render.py --scene open --t 3.0 --out /tmp/f.png
```

## 依赖

- Python：`pillow`、`numpy`、`pywin32`（SAPI）、`qrcode`（片尾二维码）、`fonttools`（只用于查缺字）
- ffmpeg / ffprobe（本机为 MSYS2 的 9.0.2，需带 libass 与 libx264）
- 字体：`Microsoft YaHei`（正文）、`Book Antiqua`（拉丁标题）
- 公式：直接复用站点构建产物 `src/content/formulas.generated.ts`，用 `tools/svgprobe.py` 栅格化

## 几个刻意的取舍

- **旁白逐句合成**：一句话一个 WAV，场景长度由音频长度决定，所以字幕、画面、声音不可能错位。
- **画面不造假**：图案来自 `applyCuts()` 的真实输出；折叠/展开用的是 `foldStepMatrix()` 的同一条公式
  （`render.py: step_matrix` 与 `src/geometry/fold.ts` 逐行对应）。
- **不假装录屏**：全片没有一个"模拟鼠标"的动画，界面段落直接给截图卡，并标注资料来源。
- **配乐自制**：不用任何第三方音乐，避免版权与"非自制"判定。
- **数字都来自实测**：96.55% 是 `video.margin.test.ts` 跑出来的最差一格；214 / 96.7% 来自
  `npx vitest run` 与 `--coverage`。
