# 测试指南（TESTING）

四层验收：**数学 → 应用集成 → 视觉/交互 → 发布**。前两层可自动重跑，
后两层需要浏览器与线上环境。

## 1. 单元测试（`npm run test`）

位置 `src/tests/geometry.test.ts`，共 29 个用例，按组：

| 组 | 覆盖 | 关键用例 |
|---|---|---|
| fold model | 不变量与变换 | `no fold, no cut keeps the whole sheet`、`each patch transform is an isometry and its own inverse`、`foldedness 0 and 1 hit the exact identity / mirror matrices` |
| golden diamond | 黄金样例 | `removes a diamond of area 2d^2 and leaves 4a^2 - 2d^2`、`the hole is the set｜x｜+｜y｜< d`、`invariant under both axis reflections`、`changing the offset changes the hole size by the real geometry` |
| invariants & edge cases | 鲁棒性 | 子集、面积上下界、`paper + removed = 4`、空交集、NaN/Infinity、非单位法向量、确定性 |
| scoring | 评分 | IoU=1、错误解不通过、空区域不产生 NaN、容差内仍判通过 |
| shipped levels | 关卡数据 | 6 关唯一、每关标准解 IoU=1、每关初始猜测不通过、关卡互不相同、标准解可被 UI 复现 |
| export | 导出 | SVG 有 `evenodd` 与 2 个子路径、文件名稳定 |

断言口径：允许 `1e-9` 级浮点误差（`toBeCloseTo(x, 9)`）；
结构一致性用路径字符串完全相等（确定性）。

## 2. 浏览器端验证（`tools/ui_check.py`）

用本机 Edge 的 CDP 做真实交互，覆盖：首页渲染、6 个关卡卡片、无横向溢出、
关卡页 4 层纸绘制、**用滑块复现标准解并通关**、评分卡可见、工作室双画布、
导出按钮存在、5 张数学卡片、能力边界表、移动端 390px 布局。

运行方式（必须**同一次 shell 调用**内起浏览器 → 跑脚本 → 收尾，否则进程会被回收）：

```bash
PROF="C:/Users/hfwei/AppData/Local/Temp/edge-prof-foldyssey"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
rm -rf "$PROF"; mkdir -p "$PROF"
"$EDGE" --headless=new --remote-debugging-port=9231 --user-data-dir="$PROF" \
  --no-first-run --no-default-browser-check --no-proxy-server --disable-gpu about:blank &
for i in $(seq 1 20); do sleep 1; curl -s --noproxy '*' http://127.0.0.1:9231/json/version && break; done
EDGE_ATTACH_PORT=9231 python tools/ui_check.py
```

脚本输出 `PASS/FAIL` 与 `tools/shots/*.png` 截图；退出码 0 表示全通过。

## 3. 设备矩阵

| 视口 | 检查点 |
|---|---|
| 1440×980（桌面） | 双栏布局、评分卡无需滚动可见、无横向溢出 |
| 390×844（手机） | 单栏、导航可横向滚动、画布不超出视口、按钮可点 |
| `prefers-reduced-motion: reduce` | 动画直接到终态，不循环播放 |

## 4. 质量闸门

发布前必须全部为真：

1. `npm run typecheck` 无输出（0 error）。
2. `npm run test` 全绿。
3. `npm run build` 成功。
4. `tools/ui_check.py` 全 PASS 且 `console issues: 0`。
5. 线上链接在无痕窗口能打开并完成一关（见 `docs/DEPLOYMENT.md`）。

## 5. 不做的事

- 不把"单元测试通过"当成"页面能用"；两层都要跑。
- 不在没有实际执行的情况下写"全部通过"。
- 不用截图相似度替代几何评分（有可靠几何时）。
