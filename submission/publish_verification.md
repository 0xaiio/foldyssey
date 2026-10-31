# 发布核验记录（Publish Verification）

## 正式链接

**https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z**

- 平台：WorkBuddy 网站应用（`deployedAs: web-page`）
- 首次发布：2026-10-30（北京时间）
- 发布结果：`verified: true`
- 如需在站内跳转到具体页面，链接后追加 hash，例如
  `…/?sharecode=AXD6562N6Z#/puzzle/diamond`（hash 路由，刷新不会 404）。

> 管理入口：**前往「设置—数据管理—应用」中管理**。

## 核验方式

用**全新的 Edge profile**（`--user-data-dir` 指向空目录，无任何 Cookie、无登录态）
以无头模式打开上面的公开链接，通过 CDP 执行真实交互：

```bash
EDGE_ATTACH_PORT=9232 \
FOLDYSSEY_URL="https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z" \
python tools/ui_check.py
```

## 核验结果（2026-10-30）

| 检查 | 结果 |
|---|---|
| 页面标题 | PASS（`Foldyssey 一刀万象 · 折叠，剪一刀，展开惊喜`） |
| 首页 6 个关卡卡片 | PASS（6） |
| 首页画布渲染纸张路径 | PASS（12 条） |
| 桌面 1440px 无横向溢出 | PASS（1425 ≤ 1440） |
| 进入关卡页 | PASS |
| 四层纸渲染 | PASS（12 条 path） |
| 用滑块复现标准解 | PASS |
| 「剪一刀」可点击 | PASS |
| **通关判定** | PASS（完全匹配） |
| 评分指标 | PASS（IoU 100.0% / 对称差 0.0% / 实得面积 3.36） |
| 评分卡无需滚动即可见 | PASS |
| 工坊双画布 + 导出按钮 | PASS |
| 工坊保存 → 作品集出现卡片 | PASS（1 件） |
| 作品集「编辑」→ 载入回工坊 | PASS |
| 数学页 5 张卡片 / 关于页能力边界 | PASS |
| 移动端 390×844 无横向溢出 / 画布 358px | PASS |
| `prefers-reduced-motion: reduce` 下仍可渲染 | PASS（8 条 path） |
| 浏览器控制台错误 | **0** |

合计：**23 / 23 PASS，console issues: 0**。

## 未登录访问

- 打开链接不需要登录、不需要填写表单、没有弹窗拦截。
- 使用全新 profile 的核验即等价于"未登录访客"，全部功能可用。

## 更新发布

| 时间 | 动作 | 结果 |
|---|---|---|
| 2026-10-30 | 首次发布（`dist/` 静态产物） | 成功，`verified: true`，链接见上 |
| 2026-10-30 | 更新发布（修正作品卡片标签宽度） | 成功，**链接不变**，线上复核 23/23 PASS |
| 2026-10-31 | 更新发布（AI 契约 v2 + 镂空/锯齿 + 校验容错） | 成功，**链接不变**；线上真实调用 `glm-5.3-flash` 3.2s，`ai_check` 14/14，console 0 |
| 2026-10-31 | 更新发布（判定分级 + 一键诊断 + 实时对照 + 三阶段） | 成功，**链接不变**；线上 `ui_check` 37/37，含「差在哪？」诊断与阶段 1 自动提示，console 0 |
| 2026-10-31 | 更新发布（5 个典藏图案 + 图案库） | 成功，**链接不变**；线上 `ui_check` 45/45，含 11 张卡片、阶段筛选、档案展开，console 0 |
| 待执行 | 更新发布 v0.2.0（AI 灵感设计师） | **未执行**：本地已验证 AI 页 13/13，线上仍是 v0.1.0 |

> 后续任何改动都必须重新执行「更新发布」；平台**不会**自动同步，
> 链接保持不变。每次更新后需重跑上面的核验命令并在本表追加一行。

## 已知异常

无。若访问返回 5xx 或白屏，先确认是否刚发布完成（等待数秒重试），
再检查 `dist/` 是否为最新构建。

---

## v0.7.0 更新发布（2026-10-31）

| 项 | 值 |
|---|---|
| 时间 | 2026-10-31 01:4x（北京时间） |
| 结果 | `verified: true`，`deployedAs: http-service` |
| 链接 | **不变**：https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z |
| sandboxId | `16a3e4ba68274884aa9bd7f3ca2e67aa` |
| 提交 | `9275067`（部署修复）/ `3959b7e`（曲线剪本体） |

### 第一次尝试失败，原因与修复

第一次更新返回 `SITES_START_FAILED`：`service did not become reachable on port 3000 within 60s`。
进程表里能看到 `vite --host 127.0.0.1 --host 0.0.0.0`——部署器按 `dev` 脚本启动，
而 Vite 忽略了注入的 `PORT`，仍然监听 5173；同时它的 host 检查也会拒绝反向代理域名。

修复（提交 `9275067`）：

- `vite.config.ts`：`server` / `preview` 读 `process.env.PORT`（未注入时回落 5173 / 4173），
  绑定 `0.0.0.0`，注入 `PORT` 时 `strictPort`，并设 `allowedHosts: true`；
- `package.json`：补显式 `"start": "vite"`，给部署器一个正确的启动入口。

本地验证：`PORT=4192 npm start` → `/puzzle/scallop` 返回 `200`（Vite 报 "ready" 并监听 4192）。
重新发布后返回 `verified: true`。

> **注意**：失败的那次已经把旧链接背后的 sandbox 换掉，中间存在几分钟的打不开窗口；
> 现在已恢复。本次发布**没有**做浏览器级复验——本机 Edge/Chromium 启动即退出
> （见 `TEST_REPORT.md` 第八轮），只有部署器的端口探测与本地 `PORT` 验证。
> 因此线上版本建议由人打开看一眼：首页图案库应为 **16 张**、阶段筛选 **6 个**，
> 关卡列表末四关为 波边 / 旋风 / 葫芦 / 花窗。
