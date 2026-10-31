# 截图清单（Screenshots Checklist）

所有截图来自**真实运行的页面**（Edge 无头 + CDP 抓屏），未经过任何 AI 重绘或概念渲染。
原图同时保存在 `tools/shots/`，提交用的副本在 `submission/screenshots/`。

| # | 文件 | 内容 | 建议用途 | 尺寸 |
|---|---|---|---|---|
| 1 | `screenshots/01-home.png` | 首页：品牌、标语、自动折剪演示、两个主按钮 | 封面/首图 | 1440×980 |
| 2 | `screenshots/02-puzzle-folded.png` | 第 3 关折叠完成，纸包 + 切线 + 斜纹切区预览 | 玩法说明 | 1440×980 |
| 3 | `screenshots/03-puzzle-revealed.png` | 展开完成：中心菱形孔、目标虚线、评分卡（IoU 100%） | 核心卖点 | 1440×980 |
| 4 | `screenshots/04-studio.png` | 工坊：左纸包 / 右展开预览 / 参数与配色 | 创作能力 | 1440×980 |
| 5 | `screenshots/05-mobile-home.png` | 手机首页（390px） | 移动端适配 | 390×844 |
| 6 | `screenshots/06-mobile-puzzle.png` | 手机关卡页（390px） | 移动端适配 | 390×844 |
| 7 | `screenshots/07-pattern-octagram.png` | 第 4 关「八角星」目标：八道放射尖角（八折 + 折剪） | 图案复杂度 | 750×750 |
| 8 | `screenshots/08-pattern-rosette.png` | 第 5 关「团花」目标：八边形花心 + 八瓣 | 核心卖点 | 750×750 |
| 9 | `screenshots/09-pattern-grand-rosette.png` | 第 6 关「万象团花」：花心 + 八主瓣 + 四轴次瓣 | 最强图案 | 750×750 |

补充素材（未放入提交目录，仓库内可查）：

| 文件 | 内容 |
|---|---|
| `tools/shots/03b-puzzle-diff.png` | 差异覆盖：青色=多剪、金色=少剪 |
| `tools/shots/06-gallery.png` | 我的作品（空态） |
| `tools/shots/07-explore.png` | 纸艺中的数学 5 张卡片 |
| `tools/shots/08-about.png` | 关于页能力边界表 |
| `tools/shots/11-mobile-studio.png` | 手机工坊 |

## 提交时的注意事项（以官方表单实际要求为准）

- 数量与体积上限、是否要求竖版/横版、是否允许拼接：**未核实**，请按表单实际字段为准。
- 建议至少提交 3 张：首页、折叠状态、展开结果；再加 1 张工坊与 2 张手机截图。
- PNG 体积偏大（单张 ~0.35 MB），若表单限制更严，可用系统工具压缩后再上传。
- 若表单要求"操作过程"截屏，建议按 `demo_script_60s.md` 的顺序逐帧截取。

## 复现方式

```bash
npm run build && npm run preview        # 或直接用线上链接
# 另开一个终端，按 docs/TESTING.md 启动 Edge 调试端口后：
EDGE_ATTACH_PORT=9231 python tools/ui_check.py
```

截图会重新写入 `tools/shots/`（覆盖旧图）。

## 2026-10-31 追加：AI 图案质量

| # | 文件 | 内容 | 用途 |
|---|---|---|---|
| 10 | `screenshots/10-ai-gallery.png` | 三个 AI 样例 + 四个主题预设的真实渲染对照（锯齿边 / 花心 / 花瓣 / 镂空） | 证明图案已具备剪纸语汇 |
| 11 | `screenshots/11-pattern-tuning.png` | 元素配比扫描（浅齿 vs 深齿、宽齿 vs 窄齿） | 证明参数是实测收敛的，不是拍脑袋 |
| 12 | `screenshots/12-puzzle-diff.png` | 展开后的差异覆盖（青=多剪、金=少剪、虚线=目标） | 证明判定是几何集比对 |
| 13 | `screenshots/13-pattern-library.png` | 图案库：16 张卡片 + 常驻详情面板（折叠 / 切割 / 展开档案） | 展示选择与预览体验 |
| 14 | `screenshots/14-pattern-library-mobile.png` | 图案库 390px：2 列卡片 + 下方详情 | 移动端自适应 |

这两张由临时脚本渲染（`src/tests/_vgallery.test.ts` / `_cand.test.ts`，用完已删），
生成的是**真实几何输出**，不是 AI 概念图。

## 2026-10-31 刷新：交互改版后的关卡页

`02-puzzle-folded.png` / `03-puzzle-revealed.png` / `06-mobile-puzzle.png` 已用新版
（操作说明条、实时展开预览、四档判定、诊断按钮）重新截图，仍是 `tools/ui_check.py` 的真实运行结果。
