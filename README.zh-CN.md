<p align="right">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>

# AgentSkills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/HK-hub/AgentSkills?style=social)](https://github.com/HK-hub/AgentSkills/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/HK-hub/AgentSkills)](https://github.com/HK-hub/AgentSkills/commits/main)

精选的 Claude Code / Agent Skills 合集，面向真实工程与创意生产场景。

## 项目说明

这个仓库是一个 **Skills 作品集**，不是单一可部署应用。
大多数一级目录是独立 Skill，通常包含：

- `SKILL.md`（必需入口）
- 可选 `references/`、`scripts/`、`examples/`、`assets/`

## 快速开始（3 步）

1. 在 [Skills 可点击索引](#skills-可点击索引) 中选择一个 Skill。
2. 打开该 Skill 的 `SKILL.md`，阅读触发条件与工作流说明。
3. 在对应 Skill 目录上下文中执行相关脚本/命令。

## Skills 可点击索引

| 分类 | 跳转 | Skills |
|---|---|---|
| Agent / Skill 工程化 | [前往](#agent-skill-工程化) | [Agent Development](./Agent%20Development/SKILL.md) · [Skill Development](./Skill%20Development/SKILL.md) · [skill-creator](./skill-creator/SKILL.md) · [dispatching-parallel-agents](./dispatching-parallel-agents/SKILL.md) · [find-skills](./find-skills/SKILL.md) · [skill-lookup](./skill-lookup/SKILL.md) · [mcp-builder](./mcp-builder/SKILL.md) |
| 后端架构 / API / 安全 | [前往](#后端架构-api-安全) | [architecture-patterns](./architecture-patterns/SKILL.md) · [backend-patterns](./backend-patterns/SKILL.md) · [api-design-principles](./api-design-principles/SKILL.md) · [auth-implementation-patterns](./auth-implementation-patterns/SKILL.md) · [microservices-patterns](./microservices-patterns/SKILL.md) · [postgresql-table-design](./postgresql-table-design/SKILL.md) |
| 事件驱动与 CQRS | [前往](#事件驱动与-cqrs) | [cqrs-implementation](./cqrs-implementation/SKILL.md) · [event-store-design](./event-store-design/SKILL.md) · [projection-patterns](./projection-patterns/SKILL.md) · [saga-orchestration](./saga-orchestration/SKILL.md) |
| CI/CD 与交付质量 | [前往](#cicd-与交付质量) | [deployment-pipeline-design](./deployment-pipeline-design/SKILL.md) · [github-actions-templates](./github-actions-templates/SKILL.md) · [gitlab-ci-patterns](./gitlab-ci-patterns/SKILL.md) · [code-reviewer](./code-reviewer/SKILL.md) |
| 前端设计与测试 | [前往](#前端设计与测试) | [frontend-design](./frontend-design/SKILL.md) · [ui-ux-pro-max](./ui-ux-pro-max/SKILL.md) · [vue-best-practices](./vue-best-practices/SKILL.md) · [web-artifacts-builder](./web-artifacts-builder/SKILL.md) · [webapp-testing](./webapp-testing/SKILL.md) |
| 文档与 Office 自动化 | [前往](#文档与-office-自动化) | [doc-coauthoring](./doc-coauthoring/SKILL.md) · [readme-generate](./readme-generate/SKILL.md) · [internal-comms](./internal-comms/SKILL.md) · [docx](./docx/SKILL.md) · [pdf](./pdf/SKILL.md) · [pptx](./pptx/SKILL.md) · [xlsx](./xlsx/SKILL.md) |
| 可视化与创意设计 | [前往](#可视化与创意设计) | [mermaid-visualizer](./mermaid-visualizer/SKILL.md) · [excalidraw-diagram](./excalidraw-diagram/SKILL.md) · [algorithmic-art](./algorithmic-art/SKILL.md) · [canvas-design](./canvas-design/SKILL.md) · [theme-factory](./theme-factory/SKILL.md) · [brand-guidelines](./brand-guidelines/SKILL.md) · [slack-gif-creator](./slack-gif-creator/SKILL.md) |
| 领域专项 | [前往](#领域专项) | [Add Admin API Endpoint](./Add%20Admin%20API%20Endpoint/SKILL.md) |

## Skills 分类

<a id="agent-skill-工程化"></a>
### 1）Agent / Skill 工程化
- [Agent Development](./Agent%20Development/SKILL.md)
- [Skill Development](./Skill%20Development/SKILL.md)
- [skill-creator](./skill-creator/SKILL.md)
- [dispatching-parallel-agents](./dispatching-parallel-agents/SKILL.md)
- [find-skills](./find-skills/SKILL.md)
- [skill-lookup](./skill-lookup/SKILL.md)
- [mcp-builder](./mcp-builder/SKILL.md)

<a id="后端架构-api-安全"></a>
### 2）后端架构 / API / 安全
- [architecture-patterns](./architecture-patterns/SKILL.md)
- [backend-patterns](./backend-patterns/SKILL.md)
- [api-design-principles](./api-design-principles/SKILL.md)
- [auth-implementation-patterns](./auth-implementation-patterns/SKILL.md)
- [microservices-patterns](./microservices-patterns/SKILL.md)
- [postgresql-table-design](./postgresql-table-design/SKILL.md)

<a id="事件驱动与-cqrs"></a>
### 3）事件驱动与 CQRS
- [cqrs-implementation](./cqrs-implementation/SKILL.md)
- [event-store-design](./event-store-design/SKILL.md)
- [projection-patterns](./projection-patterns/SKILL.md)
- [saga-orchestration](./saga-orchestration/SKILL.md)

<a id="cicd-与交付质量"></a>
### 4）CI/CD 与交付质量
- [deployment-pipeline-design](./deployment-pipeline-design/SKILL.md)
- [github-actions-templates](./github-actions-templates/SKILL.md)
- [gitlab-ci-patterns](./gitlab-ci-patterns/SKILL.md)
- [code-reviewer](./code-reviewer/SKILL.md)

<a id="前端设计与测试"></a>
### 5）前端设计与测试
- [frontend-design](./frontend-design/SKILL.md)
- [ui-ux-pro-max](./ui-ux-pro-max/SKILL.md)
- [vue-best-practices](./vue-best-practices/SKILL.md)
- [web-artifacts-builder](./web-artifacts-builder/SKILL.md)
- [webapp-testing](./webapp-testing/SKILL.md)

<a id="文档与-office-自动化"></a>
### 6）文档与 Office 自动化
- [doc-coauthoring](./doc-coauthoring/SKILL.md)
- [readme-generate](./readme-generate/SKILL.md)
- [internal-comms](./internal-comms/SKILL.md)
- [docx](./docx/SKILL.md)
- [pdf](./pdf/SKILL.md)
- [pptx](./pptx/SKILL.md)
- [xlsx](./xlsx/SKILL.md)

<a id="可视化与创意设计"></a>
### 7）可视化与创意设计
- [mermaid-visualizer](./mermaid-visualizer/SKILL.md)
- [excalidraw-diagram](./excalidraw-diagram/SKILL.md)
- [algorithmic-art](./algorithmic-art/SKILL.md)
- [canvas-design](./canvas-design/SKILL.md)
- [theme-factory](./theme-factory/SKILL.md)
- [brand-guidelines](./brand-guidelines/SKILL.md)
- [slack-gif-creator](./slack-gif-creator/SKILL.md)

<a id="领域专项"></a>
### 8）领域专项
- [Add Admin API Endpoint](./Add%20Admin%20API%20Endpoint/SKILL.md)（Ghost Admin API）

## 仓库结构

```text
.
├── <skill-name>/
│   ├── SKILL.md
│   ├── references/   （可选）
│   ├── scripts/      （可选）
│   ├── examples/     （可选）
│   └── assets/       （可选）
├── CLAUDE.md
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## 常用命令（按 Skill 场景）

本仓库没有统一的根级 build/lint/test 流程；命令按具体 Skill 使用。

```bash
# 校验 agent 文件
bash "Agent Development/scripts/validate-agent.sh" <path-to-agent.md>

# 初始化并打包 web artifact 项目
bash scripts/init-artifact.sh <project-name>
bash scripts/bundle-artifact.sh

# 启动并执行本地 Web 自动化测试
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py

# 生成 Spring Boot 模块 README
python readme-generate/scripts/readme_generator.py <spring-module-path>

# Skill 评测与打包
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
python -m scripts.run_loop --eval-set <eval.json> --skill-path <skill-path> --model <model-id> --max-iterations 5 --verbose
python -m scripts.package_skill <path/to/skill-folder>
```

## Contributing

欢迎贡献。

1. Fork 本仓库并创建功能分支。
2. 改动尽量限定在目标 Skill 目录内。
3. 若工作流行为变更，请同步更新相关文档/示例。
4. 按需运行该 Skill 的校验脚本。
5. 提交 PR 时写清楚变更摘要与验证说明。

## Roadmap

- [ ] 为每个 Skill 增加轻量元信息卡（用途、输入、输出、技术栈）。
- [ ] 增加可发现性标签与相关 Skill 交叉链接。
- [ ] 增加 `SKILL.md` 与引用文档的自动链接检查。
- [ ] 提供新 Skill 提交模板。

## Acknowledgements

- Claude Code 及更广泛的 Agent Engineering 生态。
- 持续贡献可复用工作流的维护者与社区成员。

## 许可证

MIT
