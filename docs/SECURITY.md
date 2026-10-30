# 安全与隐私（SECURITY）

## 1. 密钥

- 前端**没有任何模型 API Key**。运行时模型走 WorkBuddy 云服务的 keyless 通道：
  浏览器只持有 `endpoint` 与 `publishableKey`（见 `src/ai/cloudConfig.ts`）。
- `publishableKey` 只标识"哪个应用"，本身不带权限；服务端还会校验请求来源（Origin），
  所以把源码原样搬到别的域名也调不通。
- 真正的模型凭据与渠道配置留在服务端，永远不出现在前端 bundle、Git 历史或分享链接里。
- `.env.example` 只有占位注释；`.env` / `.env.*` 已在 `.gitignore` 中排除。

## 2. 数据与隐私

| 数据 | 位置 | 说明 |
|---|---|---|
| 作品（折叠预设 + 切口 + 配色 + 标题） | 浏览器 localStorage | 不上传，无账号 |
| 关卡进度（attempts / bestIou / cleared） | 浏览器 localStorage | 同上 |
| AI 限流计数（次数 / 上次时间） | 浏览器 sessionStorage | 关标签页即清空 |
| AI 输入的一句主题描述 | 发送给云服务模型 | 仅在用户点击「生成设计」时发送；不发送作品、进度或身份信息 |

- 无第三方统计脚本、无外部字体、无 CDN 图片。除 AI 灵感页外，全部功能断网可用。
- 清除浏览器数据会删除作品，界面已明确提示并提供 SVG/PNG 导出。

## 3. 依赖

| 依赖 | 用途 | 许可 |
|---|---|---|
| react / react-dom | UI | MIT |
| polygon-clipping | 多边形布尔运算 | MIT |
| motion | 界面过渡动画 | MIT |
| zod | 模型输出校验 | MIT |
| @tencent-ai/workbuddy-cloud-sdk | 运行时模型通道（懒加载） | MIT |
| vite / typescript / vitest / tailwindcss | 构建与测试 | MIT |

运行 `npm audit` 检查已知漏洞；升级依赖后必须重跑 `npm run test` 与浏览器验证
（几何库的升级尤其要重跑黄金样例）。

## 4. 渲染安全

- 不渲染用户提供的 HTML/SVG 字符串。图案由几何引擎生成路径后写进
  `<path d="...">`，不存在 `dangerouslySetInnerHTML`。
- **模型输出一律视为不可信**：先 `JSON.parse`，再经 zod `strict()` 校验；
  颜色必须是 `#RRGGBB`（防 CSS 注入），枚举之外一律拒绝；数值只参与几何运算。
  不 `eval`、不拼接 HTML、不当作路径或 URL 使用。
- 作品标题只作为文本节点渲染；导出 SVG 时经过 `escapeXml` 转义。
- 无 `eval`、无动态 `new Function`。

## 5. 运行时模型的成本与滥用防护

| 措施 | 值 |
|---|---|
| 输入长度 | ≤ 120 字，去控制字符 |
| 并发 | 单飞（一次只允许一个请求在途） |
| 频率 | 同一标签页两次生成间隔 ≥ 5 秒 |
| 会话预算 | 每会话最多 12 次 |
| 超时 | 30 秒 AbortController |
| 输出上限 | `max_tokens: 700` |

这些是**客户端**限制：能挡住普通用户连点，挡不住刻意绕过（改前端即可）。
真正的额度兜底在平台侧的账号配额。

## 6. 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| localStorage 被清空 | 作品丢失 | 导出 SVG/PNG；界面提示 |
| 极端参数导致布尔运算退化 | 出图异常 | 输入校验 + `try/catch` + 面积阈值过滤 + 确定性回退 |
| 模型返回不合规 JSON | 本次生成失败 | Schema 校验 + 明确报错 + 重试 + 改用预设 |
| 第三方几何库 bug | 形状错误 | 黄金样例与不变量测试常驻 |

## 7. 漏洞报告

本仓库为参赛作品，未开设公开漏洞奖励。发现问题请通过仓库 Issue 描述：
复现步骤、期望结果、实际结果、浏览器版本。**不要在 Issue 里贴任何密钥或个人隐私数据。**
