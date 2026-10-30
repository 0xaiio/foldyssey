# AI 集成说明（AI_INTEGRATION）

> 状态：**已上线（v0.2.0）**。运行时模型通过 WorkBuddy 云服务的 LLM 通道接入，
> 无需用户提供 API Key。本文记录它的契约、边界与验证方式。

## 1. 角色边界：模型不画图

```
用户一句话
   └─ 模型（glm-5.3-flash 等，云端）
        └─ 只返回受约束的 JSON 参数（枚举 + 数值范围）
             └─ zod 校验 → 拒绝 / 降级
                  └─ 几何引擎：motif → 直线切割 → 逐层逆映射 → 展开
                       └─ SVG 渲染 / 评分 / 导出
```

模型**不生成图片、不生成 SVG、不生成代码**。它输出的每个数值都会落在
`schema.ts` 的枚举与区间内，超出即整体拒绝。

## 2. 数据契约

```json
{
  "theme": "spring_festival",
  "style": "traditional_papercut",
  "symmetry": { "type": "quad", "order": 4 },
  "palette": { "paper": "#B93645", "background": "#F8F3E9" },
  "motifs": [
    { "type": "diamond", "size": 0.45, "rotation": 45 },
    { "type": "pinwheel", "size": 0.30, "rotation": 22 }
  ],
  "title": "八瓣红窗花",
  "note": "四重镜像下以菱形孔为主，斜切风车刀让瓣缘微微旋转。"
}
```

| 字段 | 允许值 | 越界处理 |
|---|---|---|
| `theme` | `spring_festival` / `snowflake` / `mid_autumn` / `modern_geo` | 拒绝 |
| `style` | `traditional_papercut` / `minimal` / `geometric` | 拒绝 |
| `symmetry.order` | **1 / 2 / 4**（本版只能折这几种） | 拒绝 |
| `symmetry.type` | `none` / `mirror` / `quad` | 与 order 不一致时按 order 处理并提示 |
| `palette.*` | `/^#[0-9a-fA-F]{6}$/` | 拒绝（防 CSS 注入） |
| `motifs[].type` | `diamond` / `pinwheel` / `chamfer` / `band` / `wedge` | 拒绝 |
| `motifs[].size` | `0.08 – 0.95` | 拒绝 |
| `motifs[].rotation` | `0 – 179` | 拒绝 |
| `motifs` 数量 | `1 – 3` | 拒绝 |
| `title` / `note` | 先截断到 24 / 80 字再校验 | 不因超长而丢整份设计 |
| 未知字段 | — | `<schema>.strict()` 拒绝 |

**motif → 切线的映射是固定的**（`motifToCut()`），同样的数值永远得到同样的纸：

| motif | 几何含义 |
|---|---|
| `diamond` | 45° 角切，距离 `size/√2`，剪负侧 → 菱形孔 `|x|+|y| < size` |
| `pinwheel` | 任意倾角（12–78°）的角切 → 四重镜像下是八边形风车孔 |
| `chamfer` | 远端角落削平，`offset = 1.42 − size×0.55` → 展开后四个角被削 |
| `band` | 90° 横切 → 一条横带被剪掉 |
| `wedge` | 斜切，改的是剪影而非孔洞 |

## 3. 安全与成本

| 项 | 做法 |
|---|---|
| 密钥 | **前端没有任何模型密钥**。SDK 只用 `endpoint` + `publishableKey`；后者只标识应用，服务端再校验 Origin |
| 输入 | 截断 120 字、去控制字符；空/过短直接拒绝，不发请求 |
| 并发 | 单飞：一次只允许一个请求在途 |
| 频率 | 同一标签页两次生成间隔 ≥ 5 秒；每会话最多 12 次（`sessionStorage`） |
| 超时 | 30 秒 `AbortController`，超时后提示可重试 |
| 输出 | 只 `JSON.parse` 后走 zod；不 `eval`、不拼 HTML、不写 `innerHTML` |
| 隐私 | 只发送用户输入的那一句描述；不发作品、进度或身份信息 |
| 降级 | 任何失败都保留核心功能；`AI 灵感` 页是懒加载的独立 chunk，加载失败不影响其他页面 |

## 4. 失败态

| 情况 | `error.code` 前缀 | UI 行为 |
|---|---|---|
| 超时 | —（AbortError） | 「模型响应超时（30 秒），可以重试一次」+ 重试 |
| 未授权 / Origin 不匹配 | `auth_` | 说明是域名或云服务状态问题，不引导用户登录 |
| 额度或限流 | `quota_` | 「额度已用尽或触发限流」；仅 `rate_limited` 时可重试 |
| 参数被拒 | `request_` | 提示换个说法重试 |
| 网关 / 模型不可用 | `gateway_` `model_` | 「稍后重试」 |
| 内部错误 | `internal_` | 提示稍后重试，保留 requestId 供排查 |
| 模型没返回 JSON / 不符合 Schema | — | 「模型没有返回可解析的 JSON」+ 重试 + **改用预设模板** |

任一失败都不会清空上一张成功的设计。

## 5. 系统指令

见 `src/ai/prompt.ts` 的 `DESIGN_SYSTEM_PROMPT`。要点：

- 只输出 JSON，不输出解释、Markdown 或代码块；
- 明确列出四种折叠与五种 motif 的几何含义，并声明不支持曲线/文字/动物；
- 禁止编造"任意图案一刀可剪"、形式化证明、模型能力或学术来源；
- 给出一个 one-shot 示例（input → JSON），显著提升合规率。

## 6. 验证

| 层 | 方式 | 结果 |
|---|---|---|
| Schema | `src/tests/ai.test.ts`（17 例） | 未知字段/枚举/越界/注入/降级全覆盖 |
| 真实调用 | `FOLDYSSEY_LIVE_AI=1 npx vitest run src/tests/ai.live.test.ts` | 通过：`glm-5.3-flash`，~3.2s，输出合法 JSON 并渲染 |
| 浏览器 | `tools/ai_check.py` | 13/13：生成、渲染、限流、失败保留上一张、交接工坊、核心功能不受影响 |

## 7. 已知限制

1. 模型目录里可选的模型很多，客户端按偏好列表挑一个可用的；若中途全部被禁用会报「模型不可用」。
2. 未做服务端配额计量（依赖平台侧额度）；客户端限流只能挡住普通用户。
3. `motifs` 的表达力受几何引擎约束：只有五种直线切割原型，不能生成任意窗花。
4. 生成结果是数字图案，不是经核验的实体折剪模板。
