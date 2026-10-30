# Git 与协作（GITHUB_WORKFLOW）

## 仓库

- 远程：`https://github.com/0xaiio/foldyssey.git`（`origin`）
- 主线：`main`（单人开发，直接提交；若开启分支保护则改用 `feature/<topic>` + PR）
- 本项目环境限制：`github.com` 的 **HTTPS 在部分网络下被阻断，SSH 可用**。
  推送失败时优先检查 remote 协议，而不是反复重试。

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <说明>

type: feat | fix | docs | test | chore | refactor | perf | build | ci
scope: geometry | game | studio | ui | docs | repo | release
```

示例：

```
feat(geometry): implement validated fold-cut-unfold diamond case
feat(game): add playable puzzle flow and unfold scoring
feat(studio): add editable papercut studio with SVG/PNG export
docs(release): record publish verification and submission material
```

## 提交前检查清单

1. `git status --short`：只应有本次相关的文件。
2. `.gitignore` 覆盖 `node_modules/`、`dist/`、`.env*`（保留 `.env.example`）、
   `tools/shots/` 的临时产物（如需保留截图作为证据，单独放 `submission/screenshots/`）。
3. `npm run typecheck && npm run test && npm run build` 全部通过，并把命令与结果写入
   `TEST_REPORT.md`。
4. 更新 `TASKS.md` / `PROJECT_STATUS.md` / 对应文档 / `CHANGELOG.md`。
5. `git add` → `git commit` → `git rev-parse HEAD` 记录真实 SHA。
6. `git push -u origin main`，再用 `git ls-remote origin main` 与本地 HEAD 比对。

## 禁止

- `git push --force`、`git reset --hard`、`git clean -fd` 除非明确知道后果并说明理由。
- 提交 `node_modules/`、`dist/`、密钥、`.env`、含个人信息的录屏原件。
- 在校验失败时用 `--no-verify` 跳过钩子。

## 里程碑与提交的关系

`PROJECT_STATUS.md` 的「提交记录」表列出每个里程碑对应的真实 SHA。
若某次提交同时覆盖多个里程碑，表里必须如实标注，不虚构"每里程碑一次提交"。
