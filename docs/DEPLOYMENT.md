# 发布（DEPLOYMENT）

## 1. 构建

```bash
npm ci                # 或 npm install
npm run typecheck
npm run test
npm run build         # 产物在 dist/
```

`vite.config.ts` 中 `base: './'`，因此 `dist/` 可放在任意静态托管的任意子路径下。
路由使用 **hash 路由**（`#/puzzle/diamond`），静态托管**不需要**任何 rewrite 规则。

## 2. WorkBuddy 网站应用发布

1. 在 WorkBuddy 中新建「网站应用」，工程目录指向本仓库根。
2. 构建命令 `npm run build`，产物目录 `dist`。
3. 先「预览」确认首页可交互，再「发布」得到公开 HTTPS 链接。
4. 打开公开链接，**用无痕窗口**走完一关（未登录状态）。
5. 之后任何改动都要重新「**更新发布**」——平台不会自动同步，链接保持不变。

> 预览面板地址、`localhost` 地址、本地文件路径都**不是**可投稿的体验链接。

## 3. 线上核验清单

| 检查 | 方法 | 记录位置 |
|---|---|---|
| 未登录可打开 | 无痕窗口访问公开链接 | `submission/publish_verification.md` |
| 首页 → 关卡 → 通关闭环 | 手动点完，记录 IoU | 同上 |
| 移动端 | 手机或 DevTools 390px | 同上 |
| 控制台无阻断错误 | DevTools Console | 同上 |
| 更新发布生效 | 改一处文案 → 更新发布 → 刷新旧链接 | 同上 |

## 4. 回滚

平台保留历史版本时，直接在发布记录里回退到上一个可用版本。
本地回滚以 Git 里程碑提交为准（见 `PROJECT_STATUS.md` 的提交表），
**不使用** `git reset --hard` 或强推覆盖远端。

## 5. 故障处置

| 症状 | 优先排查 |
|---|---|
| 线上白屏 | `dist/` 是否为最新构建；控制台是否有 404 资源；`base` 是否为 `./` |
| 链接打开是旧版 | 忘记「更新发布」 |
| 折叠后纸张被裁掉一半 | `packetView` 的 `viewBox` y 未取反（见 `docs/GEOMETRY_SPEC.md` §9） |
| 手机上拖不动切线 | `touch-action` 是否被父容器覆盖 |
