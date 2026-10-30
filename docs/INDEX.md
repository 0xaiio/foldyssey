# 文档索引

Foldyssey（一刀万象）的工程文档。**文档与代码同步演进**：任何影响用户行为、API 或数据格式的改动，
必须同时更新对应文档与 `CHANGELOG.md`。

## 我是谁，我该读什么

| 读者 | 建议顺序 |
|---|---|
| 第一次接触项目的人 | `README.md` → `docs/REQUIREMENTS.md` → `docs/GEOMETRY_SPEC.md` |
| 要改几何算法的人 | `docs/GEOMETRY_SPEC.md` → `docs/SCISSOR_CURVES.md` → `docs/TESTING.md` → `src/geometry/*.ts` → `src/tests/geometry.test.ts` |
| 要改关卡或分级的人 | `docs/SCISSOR_CURVES.md` → `src/puzzle/skill.ts` → `src/puzzle/levels.ts` → `docs/PATTERNS.md` |
| 要改界面/动画的人 | `docs/ARCHITECTURE.md` → `src/components/PaperStage.tsx` → `docs/TESTING.md` |
| 要发布上线的人 | `docs/DEPLOYMENT.md` → `submission/publish_verification.md` |
| 接手维护的人 | `PROJECT_STATUS.md` → `TASKS.md` → `docs/adr/` → `CHANGELOG.md` |

## 文档清单

| 路径 | 内容 | 维护责任 |
|---|---|---|
| `README.md` | 产品定位、真实功能、快速开始、限制 | 每次发布 |
| `PROJECT_STATUS.md` | 当前里程碑、SHA、已知问题、下一步 | 每次里程碑结束 |
| `TASKS.md` | 需求逐项状态、实现位置、验证证据 | 每次功能变更 |
| `CHANGELOG.md` | 版本化的新增/修复/已知限制 | 每次发布 |
| `CONTRIBUTING.md` | 贡献流程、代码规范、PR 清单 | 工作流变化时 |
| `TEST_REPORT.md` | 实际测试执行记录与证据 | 每次测试运行 |
| `docs/REQUIREMENTS.md` | 用户故事、需求编号、优先级、验收标准 | 需求变化时 |
| `docs/ASSUMPTIONS.md` | 歧义解释、假设、依据、风险 | 出现歧义时 |
| `docs/ARCHITECTURE.md` | 分层、数据流、边界 | 架构变更时 |
| `docs/GEOMETRY_SPEC.md` | 数学模型、坐标约定、切割语义、不变量 | 几何算法变更时 |
| `docs/DEVELOPMENT.md` | 环境、脚本、编码约定、调试入口 | 开发流程变化时 |
| `docs/TESTING.md` | 测试矩阵、执行方式、质量闸门 | 测试范围变化时 |
| `docs/UX_REDESIGN.md` | 交互与判定重设计：容差、诊断、实时对照、阶段划分 | 交互/判定变化时 |
| `docs/PATTERNS.md` | 16 个图案的折叠结构 / 切割逻辑 / 展开效果 + 研究引用边界 | 图案增删时 |
| `docs/SCISSOR_CURVES.md` | 曲线剪的模型与误差界、「剪刀能力」四级判定与边界、曲线相关的交互设计 | 刀具或分级变化时 |
| `docs/DEPLOYMENT.md` | 构建、发布、更新发布、线上核验 | 发布流程变化时 |
| `docs/GITHUB_WORKFLOW.md` | Git 规范、分支、提交、推送 | Git 规则变化时 |
| `docs/SECURITY.md` | 密钥、隐私、依赖、漏洞披露 | 安全边界变化时 |
| `docs/AI_INTEGRATION.md` | 运行时 AI 的设计与未上线说明 | AI 相关决策变化时 |
| `docs/adr/ADR-000X-*.md` | 关键技术决策记录 | 决策做出/改变时 |
| `submission/*` | 参赛介绍、截图、演示脚本、核验记录 | 每次提交材料变化时 |

## 维护约定

1. **单一可信源**：`src/geometry/` 与 `src/puzzle/levels.ts` 是形状的事实来源；
   文档中的数值示例必须能在测试里找到对应断言。
2. **不写未实现的能力**：`README` / About 页 / 投稿文案只描述已经跑通并被测试覆盖的功能；
   计划中的内容一律进 Roadmap。
3. **数值必须可复现**：`docs/GEOMETRY_SPEC.md` 中的黄金样例（`d = 0.4√2`、面积 `2d²`）
   对应 `src/tests/geometry.test.ts` 的同名用例。
4. **断链自检**：新增文档后检查 `docs/INDEX.md` 与本表是否同步。
