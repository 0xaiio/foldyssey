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
| 待执行 | 更新发布 v0.2.0（AI 灵感设计师） | **未执行**：本地已验证 AI 页 13/13，线上仍是 v0.1.0 |

> 后续任何改动都必须重新执行「更新发布」；平台**不会**自动同步，
> 链接保持不变。每次更新后需重跑上面的核验命令并在本表追加一行。

## 已知异常

无。若访问返回 5xx 或白屏，先确认是否刚发布完成（等待数秒重试），
再检查 `dist/` 是否为最新构建。
