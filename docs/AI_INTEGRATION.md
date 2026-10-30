# AI 集成说明（AI_INTEGRATION）

## 结论先行

**v0.1.0 没有接入运行时大模型。** 公开页面不发起任何模型调用，
不需要 API Key，也不会把用户输入发送到任何服务。
所有几何、关卡、工坊、导出功能在断网状态下完全可用。

本文记录"如果接入，应该怎么接"，以及为什么这次没有接。

## 为什么没有接入

1. 赛事原始页面需要登录才能读取，无法确认"作品内是否强制调用大模型"。
   在未核实前把 AI 做成核心依赖，会让 Gate A 的可发布性受制于第三方服务。
2. 本项目的核心价值是**可验证的几何**；AI 只能做参数建议，
   不能替几何引擎决定形状。把它做成可有可无的一层，产品更稳。
3. 时间窗口极短，接入需要服务端代理、限流、Schema 校验、失败降级、
   端到端测试，这些都会挤占"数学正确性 + 手机可用 + 线上可访问"的预算。

## 如果接入：角色边界

AI **不生成图片**，只输出受约束的参数 JSON；真正画图的是几何引擎。

```json
{
  "theme": "spring_festival",
  "style": "traditional_papercut",
  "symmetry": { "type": "radial", "order": 4 },
  "palette": { "paper": "#B93645", "background": "#F8F3E9" },
  "motifs": [{ "type": "diamond", "size": 0.42, "rotation": 0 }],
  "complexity": "medium",
  "title": "八瓣迎春"
}
```

约束：

| 字段 | 允许值 |
|---|---|
| `theme` | `spring_festival` / `snowflake` / `mid_autumn` / `modern_geo` |
| `style` | `traditional_papercut` / `minimal` / `geometric` |
| `symmetry.type` | `mirror` / `radial`（`order` ∈ 1..8） |
| `palette.*` | `^#[0-9a-fA-F]{6}$` |
| `motifs[].type` | `diamond` / `petal` / `triangle` / `arc` |
| `motifs.length` | ≤ 4 |
| 数值 | 有限、`0 < size ≤ 1`、`-180 ≤ rotation ≤ 180` |

校验：用 Zod 式 Schema 在**服务端与客户端各校验一次**；未知字段拒绝，
未知 motif 降级为 `diamond`。模型返回的任何 HTML/JS/路径指令一律丢弃。

## 安全要求（接入时必须满足）

1. 服务端代理持有密钥；客户端只调用代理端点。
2. 输入长度上限、每 IP 速率限制、单次超时（≤ 15s）、预算上限。
3. 只发送当次创作意图，不发送整个作品库。
4. 失败时显示「失败 / 重试 / 改用预设模板」，核心游戏不受影响。
5. 在 About 与投稿材料中如实披露模型名称、用途与数据流。

## 披露口径

- **开发期**：本项目由 WorkBuddy 辅助开发（代码、文档、测试）。
- **运行期**：无模型调用。
  这两句必须分开写，不能合并成"本应用使用了 AI"。

## 接入时需要改的文件

| 文件 | 改动 |
|---|---|
| `src/ai/schema.ts` | 新增：参数 Schema 与校验 |
| `src/ai/client.ts` | 新增：调用代理、超时、错误归一化 |
| `src/pages/StudioPage.tsx` | 新增入口与降级 UI |
| `docs/TESTING.md` | 新增 AI 端到端用例（拒绝非法 JSON、超界参数、断网降级） |
| `submission/ai_usage_disclosure.md` | 更新运行时披露 |
