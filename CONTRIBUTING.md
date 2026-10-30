# 贡献指南（CONTRIBUTING）

本项目是参赛作品，但代码按可维护标准组织。改动前请先读
`docs/INDEX.md` 与 `PROJECT_STATUS.md`。

## 快速开始

```bash
npm install
npm run dev
npm run test
```

## 改动的四条硬规则

1. **不破坏几何不变量**：`src/tests/geometry.test.ts` 必须全绿。
   新增几何能力时，先加测试再改实现。
2. **不夸大能力**：文档、UI 文案、投稿材料只能描述**已实现且已验证**的功能。
   想加的能力写进 Roadmap 或 `TASKS.md` 的"下一步"。
3. **渲染不改事实**：动画/相机只能改变呈现，不能修改 `CutOutcome`。
4. **文档跟着代码走**：影响用户行为、API、数据格式的改动，必须同时更新
   相关 `docs/*.md`、`CHANGELOG.md`，并在 `TASKS.md` 更新状态。

## 提交前

```bash
npm run typecheck
npm run test
npm run build
git status --short
```

`git status` 里不应出现 `node_modules/`、`dist/`、`.env*`（`.env.example` 除外）。

## 提交信息

```
feat(geometry): ...
fix(studio): ...
docs(testing): ...
```

详见 `docs/GITHUB_WORKFLOW.md`。

## 代码风格

- TypeScript `strict`，不使用 `any` 绕过类型（几何输入用显式校验函数）。
- 几何模块保持纯函数：无 DOM、无 `Date.now()`、无随机。
- 命名见 `docs/DEVELOPMENT.md`。
- 注释解释"为什么"，不复述代码。

## 报告问题

请提供：复现步骤、期望结果、实际结果、浏览器与版本、控制台报错。
**不要**附带任何密钥或个人隐私数据。
