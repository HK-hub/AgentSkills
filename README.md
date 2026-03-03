<p align="right">
  <strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# AgentSkills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/HK-hub/AgentSkills?style=social)](https://github.com/HK-hub/AgentSkills/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/HK-hub/AgentSkills)](https://github.com/HK-hub/AgentSkills/commits/main)

A curated collection of Claude Code / agent skills for real-world engineering and creative workflows.

## About

This repository is a **skills portfolio**, not a single deployable application.
Most top-level folders are standalone skills with:

- `SKILL.md` (required entrypoint)
- optional `references/`, `scripts/`, `examples/`, `assets/`

## Quick Start (3 Steps)

1. Pick a skill from the [Skill Index](#skill-index-clickable).
2. Open that skill's `SKILL.md` and read the trigger + workflow instructions.
3. Run any skill-specific scripts/commands in that skill context.

## Skill Index (Clickable)

| Category | Jump | Skills |
|---|---|---|
| Agent & Skill Engineering | [Go](#agent-skill-engineering) | [Agent Development](./Agent%20Development/SKILL.md) · [Skill Development](./Skill%20Development/SKILL.md) · [skill-creator](./skill-creator/SKILL.md) · [dispatching-parallel-agents](./dispatching-parallel-agents/SKILL.md) · [find-skills](./find-skills/SKILL.md) · [skill-lookup](./skill-lookup/SKILL.md) · [mcp-builder](./mcp-builder/SKILL.md) |
| Backend Architecture / API / Security | [Go](#backend-api-security) | [architecture-patterns](./architecture-patterns/SKILL.md) · [backend-patterns](./backend-patterns/SKILL.md) · [api-design-principles](./api-design-principles/SKILL.md) · [auth-implementation-patterns](./auth-implementation-patterns/SKILL.md) · [microservices-patterns](./microservices-patterns/SKILL.md) · [postgresql-table-design](./postgresql-table-design/SKILL.md) |
| Event-Driven & CQRS | [Go](#event-driven-cqrs) | [cqrs-implementation](./cqrs-implementation/SKILL.md) · [event-store-design](./event-store-design/SKILL.md) · [projection-patterns](./projection-patterns/SKILL.md) · [saga-orchestration](./saga-orchestration/SKILL.md) |
| CI/CD & Delivery Quality | [Go](#cicd-delivery-quality) | [deployment-pipeline-design](./deployment-pipeline-design/SKILL.md) · [github-actions-templates](./github-actions-templates/SKILL.md) · [gitlab-ci-patterns](./gitlab-ci-patterns/SKILL.md) · [code-reviewer](./code-reviewer/SKILL.md) |
| Frontend Design & Testing | [Go](#frontend-design-testing) | [frontend-design](./frontend-design/SKILL.md) · [ui-ux-pro-max](./ui-ux-pro-max/SKILL.md) · [vue-best-practices](./vue-best-practices/SKILL.md) · [web-artifacts-builder](./web-artifacts-builder/SKILL.md) · [webapp-testing](./webapp-testing/SKILL.md) |
| Documentation & Office Automation | [Go](#docs-office-automation) | [doc-coauthoring](./doc-coauthoring/SKILL.md) · [readme-generate](./readme-generate/SKILL.md) · [internal-comms](./internal-comms/SKILL.md) · [docx](./docx/SKILL.md) · [pdf](./pdf/SKILL.md) · [pptx](./pptx/SKILL.md) · [xlsx](./xlsx/SKILL.md) |
| Visualization & Creative Design | [Go](#visualization-creative-design) | [mermaid-visualizer](./mermaid-visualizer/SKILL.md) · [excalidraw-diagram](./excalidraw-diagram/SKILL.md) · [algorithmic-art](./algorithmic-art/SKILL.md) · [canvas-design](./canvas-design/SKILL.md) · [theme-factory](./theme-factory/SKILL.md) · [brand-guidelines](./brand-guidelines/SKILL.md) · [slack-gif-creator](./slack-gif-creator/SKILL.md) |
| Domain-Specific | [Go](#domain-specific) | [Add Admin API Endpoint](./Add%20Admin%20API%20Endpoint/SKILL.md) |

## Skill Categories

<a id="agent-skill-engineering"></a>
### 1) Agent & Skill Engineering
- [Agent Development](./Agent%20Development/SKILL.md)
- [Skill Development](./Skill%20Development/SKILL.md)
- [skill-creator](./skill-creator/SKILL.md)
- [dispatching-parallel-agents](./dispatching-parallel-agents/SKILL.md)
- [find-skills](./find-skills/SKILL.md)
- [skill-lookup](./skill-lookup/SKILL.md)
- [mcp-builder](./mcp-builder/SKILL.md)

<a id="backend-api-security"></a>
### 2) Backend Architecture / API / Security
- [architecture-patterns](./architecture-patterns/SKILL.md)
- [backend-patterns](./backend-patterns/SKILL.md)
- [api-design-principles](./api-design-principles/SKILL.md)
- [auth-implementation-patterns](./auth-implementation-patterns/SKILL.md)
- [microservices-patterns](./microservices-patterns/SKILL.md)
- [postgresql-table-design](./postgresql-table-design/SKILL.md)

<a id="event-driven-cqrs"></a>
### 3) Event-Driven & CQRS
- [cqrs-implementation](./cqrs-implementation/SKILL.md)
- [event-store-design](./event-store-design/SKILL.md)
- [projection-patterns](./projection-patterns/SKILL.md)
- [saga-orchestration](./saga-orchestration/SKILL.md)

<a id="cicd-delivery-quality"></a>
### 4) CI/CD & Delivery Quality
- [deployment-pipeline-design](./deployment-pipeline-design/SKILL.md)
- [github-actions-templates](./github-actions-templates/SKILL.md)
- [gitlab-ci-patterns](./gitlab-ci-patterns/SKILL.md)
- [code-reviewer](./code-reviewer/SKILL.md)

<a id="frontend-design-testing"></a>
### 5) Frontend Design & Testing
- [frontend-design](./frontend-design/SKILL.md)
- [ui-ux-pro-max](./ui-ux-pro-max/SKILL.md)
- [vue-best-practices](./vue-best-practices/SKILL.md)
- [web-artifacts-builder](./web-artifacts-builder/SKILL.md)
- [webapp-testing](./webapp-testing/SKILL.md)

<a id="docs-office-automation"></a>
### 6) Documentation & Office Automation
- [doc-coauthoring](./doc-coauthoring/SKILL.md)
- [readme-generate](./readme-generate/SKILL.md)
- [internal-comms](./internal-comms/SKILL.md)
- [docx](./docx/SKILL.md)
- [pdf](./pdf/SKILL.md)
- [pptx](./pptx/SKILL.md)
- [xlsx](./xlsx/SKILL.md)

<a id="visualization-creative-design"></a>
### 7) Visualization & Creative Design
- [mermaid-visualizer](./mermaid-visualizer/SKILL.md)
- [excalidraw-diagram](./excalidraw-diagram/SKILL.md)
- [algorithmic-art](./algorithmic-art/SKILL.md)
- [canvas-design](./canvas-design/SKILL.md)
- [theme-factory](./theme-factory/SKILL.md)
- [brand-guidelines](./brand-guidelines/SKILL.md)
- [slack-gif-creator](./slack-gif-creator/SKILL.md)

<a id="domain-specific"></a>
### 8) Domain-Specific
- [Add Admin API Endpoint](./Add%20Admin%20API%20Endpoint/SKILL.md) (Ghost Admin API)

## Repository Structure

```text
.
├── <skill-name>/
│   ├── SKILL.md
│   ├── references/   (optional)
│   ├── scripts/      (optional)
│   ├── examples/     (optional)
│   └── assets/       (optional)
├── CLAUDE.md
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## Common Commands (Skill-Specific)

There is no single root build/lint/test pipeline. Run commands in each skill context.

```bash
# Validate an agent file
bash "Agent Development/scripts/validate-agent.sh" <path-to-agent.md>

# Initialize and bundle a web artifact project
bash scripts/init-artifact.sh <project-name>
bash scripts/bundle-artifact.sh

# Run Playwright automation with local server lifecycle management
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py

# Generate README for a Spring Boot module
python readme-generate/scripts/readme_generator.py <spring-module-path>

# Skill evaluation and packaging loop
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
python -m scripts.run_loop --eval-set <eval.json> --skill-path <skill-path> --model <model-id> --max-iterations 5 --verbose
python -m scripts.package_skill <path/to/skill-folder>
```

## Contributing

Contributions are welcome.

1. Fork this repository and create a feature branch.
2. Keep changes scoped to the target skill directory.
3. Update related docs/examples when workflow behavior changes.
4. Run skill-specific validation scripts where applicable.
5. Open a PR with clear summary and test/verification notes.

## Roadmap

- [ ] Add lightweight metadata cards for each skill (purpose, inputs, outputs, stack).
- [ ] Add discoverability tags and cross-links between related skills.
- [ ] Add automated link checks for `SKILL.md` and referenced docs.
- [ ] Add contribution templates for new skill submissions.

## Acknowledgements

- Claude Code and the broader agent engineering ecosystem.
- Contributors and maintainers sharing reusable workflows.

## License

MIT
