---
name: superpowers
description: "A complete software development methodology and skill composition system, ported from obra/superpowers. Provides structured, repeatable workflow: brainstorming, design, planning, TDD, subagent-driven dev, code review, finishing branch. Use for coding, building projects, refactoring, bug fixing, or any programming tasks."
---

# Superpowers

## Overview

Superpowers is a complete software development methodology that provides AI agents with a structured, repeatable workflow. Ported from the obra/superpowers project, it breaks down the software development process into 7 core phases, each with dedicated skills and checkpoints to ensure high-quality, maintainable code output.

## Core Workflow

Superpowers follows a strict 7-phase workflow. Each phase is mandatory and cannot be skipped:

### 1. Brainstorming
**Trigger**: Automatically activates at the start of any development task.
**Goal**: Clarify the user's real needs through questioning, explore alternatives, and produce a verifiable design document.
**Key Actions**:
- Ask what the user really wants to achieve (not just surface requirements)
- Explore multiple design approaches and trade-offs
- Break design into readable chunks (max 200 words each)
- Generate design document and save to `design.md`
- Get user sign-off on the design

### 2. Design Validation
**Trigger**: After Brainstorming completes.
**Goal**: Ensure the design is complete, feasible, and meets user expectations.
**Key Actions**:
- Present design chunks for user review
- Ask "Is this section clear?"
- Confirm technical feasibility and constraints
- Record feedback and update design

### 3. Implementation Planning
**Trigger**: After design validation passes.
**Goal**: Decompose the design into executable, fine-grained development tasks.
**Key Actions**:
- Create detailed task list, each task taking 2-5 minutes
- Each task includes: exact file paths, complete code, verification steps
- Follow YAGNI (You Aren't Gonna Need It) and DRY (Don't Repeat Yourself)
- Generate plan document and save to `plan.md`

### 4. Test-Driven Development (TDD)
**Trigger**: Automatically activates during implementation.
**Goal**: Enforce the Red-Green-Refactor cycle.
**Key Actions**:
- Write a failing test first (Red)
- Write minimal code to pass the test (Green)
- Refactor to keep code clean
- Delete any code written before tests
- Follow this cycle for every feature

### 5. Subagent-Driven Development
**Trigger**: After plan approval.
**Goal**: Use subagents to execute tasks in parallel or sequentially.
**Key Actions**:
- Create fresh subagent per task
- Two-stage review: spec compliance, then code quality
- Set human checkpoints during batch execution
- Stop and report immediately if subagent deviates from plan

### 6. Code Review
**Trigger**: Between tasks or upon completion.
**Goal**: Ensure code meets plan and quality standards.
**Key Actions**:
- Review code against the plan
- Report issues by severity: Critical (blocking), Major, Minor
- Critical issues must be fixed before proceeding
- Generate review report and save to `review.md`

### 7. Finishing Development Branch
**Trigger**: After all tasks complete.
**Goal**: Cleanly finish the development cycle.
**Key Actions**:
- Verify all tests pass
- Present options: merge, create PR, keep branch, discard
- Clean up workspace
- Generate final report

## Core Principles

### 1. Test-Driven Development
- Always write tests first
- Red-Green-Refactor cycle
- Tests serve as documentation and design tools

### 2. Systematic over Ad-Hoc
- Follow process rather than guessing
- Every decision has a rationale
- Document all assumptions and decisions

### 3. Complexity Reduction
- Simplicity is the primary goal
- Remove unnecessary code
- Prefer the simplest viable solution

### 4. Evidence over Claims
- Verify rather than declare success
- Use tests to prove functionality
- Use data to support decisions

## Skill Trigger Mechanism

Superpowers is a mandatory workflow, not an optional suggestion. When any of the following is detected, the corresponding skill must activate:

1. **User mentions development/programming** -> Start Brainstorming
2. **Design complete** -> Start Implementation Planning
3. **Starting to write code** -> Start TDD
4. **Tasks need parallelism** -> Start Subagent-Driven Development
5. **Code complete** -> Start Code Review
6. **Project complete** -> Start Finishing

## Deliverables

Each phase produces documentation to ensure traceability:

| Phase | Output File | Purpose |
|-------|------------|---------|
| Brainstorming | `design.md` | Complete design document |
| Planning | `plan.md` | Detailed implementation plan |
| Development | `code/` | Source code |
| Review | `review.md` | Code review report |
| Finish | `final_report.md` | Project summary |

## Example Workflow

**User Request**: "Build me a todo app"

1. **Brainstorming**: Ask about requirements (Web/Mobile? Auth needed? Data storage?)
2. **Design**: Generate UI design, architecture diagram, API design
3. **Planning**: Break down into: create project structure, implement auth, build CRUD, add frontend
4. **TDD**: Write tests for each feature first
5. **Subagent**: Dispatch subagents to develop different modules in parallel
6. **Review**: Review code quality of each module
7. **Finish**: Merge code, generate deployment docs

## Troubleshooting

**Issue**: Subagent deviates from plan
**Solution**: Stop immediately, analyze the deviation, adjust plan or re-dispatch

**Issue**: Tests failing
**Solution**: Return to Red phase, analyze failure cause, fix tests or code

**Issue**: Requirements change
**Solution**: Return to Brainstorming phase, re-evaluate design

## Reference Resources

For detailed workflow guides and best practices, see `references/workflow.md` and `references/best_practices.md`.

## Resources

This skill includes bundled resource directories for organizing different types of content:

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

### references/
Documentation and reference material intended to be loaded into context to inform the agent's process and thinking.

**Examples from other skills:**
- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information to reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output produced.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

Any unneeded directories can be deleted. Not every skill requires all three types of resources.