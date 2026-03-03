# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repository is a curated **skills collection** for Claude Code/agents.
It is not a single deployable application. Most top-level directories are standalone skills with their own `SKILL.md` and optional support files.

## High-level architecture

### 1) Skill-oriented monorepo layout

Typical unit:

```text
<skill-name>/
├── SKILL.md            # Required entrypoint and trigger description
├── references/         # Deep docs loaded on demand
├── scripts/            # Utilities used by the skill
├── examples/           # Usage examples
└── assets/             # Output templates/resources
```

### 2) No root build/test pipeline

There is no root `package.json`, `pyproject.toml`, or CI workflow in this repo root.
Development/validation commands are **skill-specific** and must be run in the relevant skill context.

### 3) Content-first + script-assisted design

Most skills are instruction-heavy (`SKILL.md`) with optional deterministic helpers under `scripts/`.
When editing, preserve the relationship between trigger metadata (frontmatter), workflow body, and referenced resources.

## Common commands used in this repo

> Run these from the proper directory for each skill.

### Agent Development

```bash
bash "Agent Development/scripts/validate-agent.sh" <path-to-agent.md>
```

### web-artifacts-builder

```bash
bash scripts/init-artifact.sh <project-name>
bash scripts/bundle-artifact.sh
```

### webapp-testing

```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

### readme-generate

```bash
python readme-generate/scripts/readme_generator.py <spring-module-path>
```

### skill-creator

```bash
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
python -m scripts.run_loop --eval-set <eval.json> --skill-path <skill-path> --model <model-id> --max-iterations 5 --verbose
python -m scripts.package_skill <path/to/skill-folder>
```

### Add Admin API Endpoint (Ghost-specific skill)

```bash
cd ghost/core && yarn test:single test/e2e-api/admin/{test-file-name}
```

## How to work effectively in this repo

1. Start with the target skill’s `SKILL.md`.
2. Read any referenced `references/` docs before changing process-critical instructions.
3. Keep trigger descriptions explicit and concrete (especially in frontmatter `description`).
4. If a skill already has scripts, prefer reusing/extending them over introducing parallel ad-hoc instructions.
5. Avoid introducing repository-wide assumptions (global npm/pnpm/python workflow) unless you add and document root tooling explicitly.

## Core skill domains in this repository

- Agent/Skill engineering: `Agent Development`, `Skill Development`, `skill-creator`, `find-skills`, `skill-lookup`, `mcp-builder`
- Backend architecture/API/security: `architecture-patterns`, `backend-patterns`, `api-design-principles`, `auth-implementation-patterns`, `microservices-patterns`
- Event-driven systems: `cqrs-implementation`, `event-store-design`, `projection-patterns`, `saga-orchestration`
- CI/CD: `deployment-pipeline-design`, `github-actions-templates`, `gitlab-ci-patterns`
- Frontend/UI/testing: `frontend-design`, `ui-ux-pro-max`, `vue-best-practices`, `web-artifacts-builder`, `webapp-testing`
- Document/office/visual workflows: `docx`, `pdf`, `pptx`, `xlsx`, `mermaid-visualizer`, `excalidraw-diagram`
- Creative/branding: `algorithmic-art`, `canvas-design`, `theme-factory`, `brand-guidelines`, `slack-gif-creator`
- Domain-specific: `Add Admin API Endpoint`
