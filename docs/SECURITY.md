# 安全与隐私（SECURITY）

## 1. 密钥

- 本项目**不包含任何模型 API Key**，也不需要在客户端配置密钥。
- `.env.example` 只有占位注释；`.env` / `.env.*` 已在 `.gitignore` 中排除。
- 若将来接入服务端模型代理：密钥只存在于服务端环境变量，
  绝不能进入前端 bundle、Git 历史或分享链接。

## 2. 数据与隐私

| 数据 | 位置 | 说明 |
|---|---|---|
| 作品（折叠预设 + 切口 + 配色 + 标题） | 浏览器 localStorage | 不上传，无账号 |
| 关卡进度（attempts / bestIou / cleared） | 浏览器 localStorage | 同上 |
| 用户输入的主题描述 | 不存在 | 本版没有 AI 输入框 |

- 无第三方统计脚本、无外部字体、无 CDN 图片，**断网也能完整运行**。
- 清除浏览器数据会删除作品，界面已明确提示并提供 SVG/PNG 导出。

## 3. 依赖

| 依赖 | 用途 | 许可 |
|---|---|---|
| react / react-dom | UI | MIT |
| polygon-clipping | 多边形布尔运算 | MIT |
| motion | 界面过渡动画 | MIT |
| vite / typescript / vitest / tailwindcss | 构建与测试 | MIT |

运行 `npm audit` 检查已知漏洞；升级依赖后必须重跑 `npm run test` 与浏览器验证
（几何库的升级尤其要重跑黄金样例）。

## 4. 渲染安全

- 不渲染用户提供的 HTML/SVG 字符串。图案由几何引擎生成路径后写进
  `<path d="...">`，不存在 `dangerouslySetInnerHTML`。
- 作品标题只作为文本节点渲染；导出 SVG 时经过 `escapeXml` 转义。
- 无 `eval`、无动态 `new Function`。

## 5. 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| localStorage 被清空 | 作品丢失 | 导出 SVG/PNG；界面提示 |
| 极端参数导致布尔运算退化 | 出图异常 | 输入校验 + `try/catch` + 面积阈值过滤 |
| 第三方几何库 bug | 形状错误 | 黄金样例与不变量测试常驻 |

## 6. 漏洞报告

本仓库为参赛作品，未开设公开漏洞奖励。发现问题请通过仓库 Issue 描述：
复现步骤、期望结果、实际结果、浏览器版本。**不要在 Issue 里贴任何密钥或个人隐私数据。**
