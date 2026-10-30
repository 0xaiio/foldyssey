# 参考资料与授权（References & Licenses）

## 一、研究灵感（不复制素材）

| 来源 | 用途 | 使用方式 |
|---|---|---|
| Erik Demaine, *The Fold-and-Cut Problem* — https://erikdemaine.org/foldcut/ | 理解"一般平折 + 一刀可剪出直线段图案"的定理背景 | 仅阅读，未复制任何图片、谜题或代码 |
| Erik Demaine, *Simple Fold & Cut Font* — https://erikdemaine.org/fonts/simplefoldcut/ | 了解折叠序列的表达方式 | 仅阅读，未使用其字体或图形 |
| Erik & Martin Demaine, *SoCG 2026 folding puzzle* — https://erikdemaine.org/puzzles/SoCG2026/ | 关卡设计思路参考 | 仅阅读，未复制其谜题 |
| Origami Simulator — https://origamisimulator.org/ | 对照更复杂的三维模拟，确认首版不需要 | 未使用其代码 |

**免责**：本项目与 MIT、Erik Demaine、Martin Demaine 无隶属、合作或背书关系。
作品中的六个关卡全部为本项目原创，目标图案由本项目的几何引擎生成。

## 二、第三方代码依赖

| 包 | 版本 | 许可 | 用途 |
|---|---|---|---|
| react / react-dom | 18.3.x | MIT | UI |
| polygon-clipping | 0.15.x | MIT | 多边形布尔运算（联合/交/差/异或） |
| motion | 12.x | MIT | 界面过渡动画 |
| vite | 5.4.x | MIT | 构建 |
| typescript | 5.6.x | Apache-2.0 | 类型系统 |
| vitest | 2.1.x | MIT | 单元测试 |
| tailwindcss / @tailwindcss/vite | 4.1.x | MIT | 样式工具 |

完整版本以 `package-lock.json` 为准。上述依赖均通过 npm 安装，未修改其源码。

## 三、字体与图像

- **无外部字体文件**：使用系统中文字体栈（`Songti SC` / `SimSun` / `Noto Serif SC` 等）与
  `Georgia` / `Optima` 等系统拉丁字体，不下载、不分发字体文件。
- **无外部图片**：纸张、折痕、镂空全部由 SVG 路径实时绘制；favicon 为本项目手写的 SVG。
- 截图与录屏为真实页面输出，版权归本项目作者。

## 四、本项目代码

- 仓库尚未选择开源许可证（依据 `docs/ASSUMPTIONS.md` A-08），版权归作者所有。
- 若要复用其中的几何实现，请先取得作者许可。

## 五、赛事与平台

- 比赛入口与规则以官方页面为准：https://www.workbuddy.link/p/8QYARuAmZ9RgQty3FSzNUs?source=2
- 发布平台：WorkBuddy 网站应用。

## 六、素材合规自检

- [x] 没有使用他人拍摄的照片或插画
- [x] 没有使用第三方字体文件
- [x] 没有复制 Demaine 的谜题/教材图
- [x] 没有使用 AI 生成的图片冒充作品截图
- [x] 截图与演示来自真实运行页面
- [ ] 演示视频尚未录制（需本人完成）
