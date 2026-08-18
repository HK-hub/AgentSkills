# Page Editor Output Format Reference

## Overview

When the user clicks "保存" in the editor, two things happen:
1. `page-edits.json` is written to disk (path configurable via `--output`)
2. A structured summary is printed to stdout for the agent to read

Both contain the same data. The agent should primarily use the stdout JSON for quick parsing, and reference `page-edits.json` for the full detail.

## Top-Level Structure

```json
{
  "version": "3.2",
  "savedAt": "ISO 8601 timestamp",
  "targetFile": "absolute path to the HTML file being edited (or URL if --url mode)",
  "targetAnalysis": { ... },
  "summary": { "totalChanges": 12, "elementsModified": 5 },
  "patterns": [ ... ],
  "byElement": [ ... ],
  "changes": [ ... ]
}
```

## targetAnalysis

Analysis of the target file to help the agent decide HOW to apply changes.

```json
{
  "type": "single-file-html | multi-file | build-artifact | remote-url",
  "hasInlineStyles": true,
  "externalCSS": ["styles.css", "theme.css"],
  "hasScripts": true,
  "detectedFramework": "react/next.js | vue | astro | null",
  "cssFramework": "tailwind | null",
  "recommendation": "human-readable suggestion on where to edit"
}
```

| type | meaning |
|------|---------|
| `single-file-html` | All styles are inline `<style>` tags — edit the HTML file directly |
| `multi-file` | Has external CSS files — use `matchedRule.file` in each change to locate the right file |
| `build-artifact` | Minified/hashed output — must edit source files and rebuild |
| `remote-url` | Editing a remote URL — agent needs to locate source files manually |

## changes[] — Individual Change Records

Each entry in the `changes` array represents one property change on one element.

```json
{
  "selector": ".hero-title",
  "alternateSelectors": ["#page > h1:nth-of-type(1)"],
  "property": "color",
  "oldValue": "#333333",
  "value": "#1e3a8a",
  "type": "style",
  "source": "modified",
  "context": { ... },
  "strategy": "修改 styles.css 中 '.hero-title' 规则的 color 属性",
  "meta": null,
  "timestamp": 1776135524456
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `selector` | string | CSS selector targeting the element. Primary selector, most specific. |
| `alternateSelectors` | string[]? | Alternative selectors (different strategies — ID-based, class-based, nth-child) for fallback |
| `property` | string | CSS property (camelCase) or special: `textContent`, `src`, `__delete__`, `__reorder__` |
| `oldValue` | string? | Previous value (null if property was not set before) |
| `value` | string? | New value (null for deletions) |
| `type` | string | Change type: `style`, `text`, `attribute`, `cssVariable`, `delete`, `reorder` |
| `source` | string | `added` (new property), `modified` (changed existing), `removed` (cleared) |
| `context` | object | Rich context about the element — see below |
| `strategy` | string | AI-generated suggestion on how to apply this change |
| `meta` | object? | Editor metadata (rarely used) |
| `timestamp` | number | Unix ms timestamp |

### Change Type Details

#### `type: "style"` — CSS Property Change
```json
{
  "selector": ".btn-primary",
  "property": "backgroundColor",
  "oldValue": "#ff6600",
  "value": "#1e3a8a",
  "type": "style",
  "source": "modified"
}
```
Apply by updating the CSS rule or inline style for the matching selector.

#### `type: "text"` — Text Content Change
```json
{
  "selector": ".hero-title",
  "property": "textContent",
  "oldValue": "旧标题",
  "value": "新标题",
  "type": "text"
}
```
Apply by updating the text node in the HTML template/component.

#### `type: "attribute"` — HTML Attribute Change
```json
{
  "selector": ".banner-img",
  "property": "src",
  "oldValue": "/old-image.jpg",
  "value": "/new-image.jpg",
  "type": "attribute"
}
```

#### `type: "cssVariable"` — CSS Custom Property (Token) Change
```json
{
  "selector": ":root",
  "property": "--color-primary",
  "oldValue": "#ff6600",
  "value": "#1e3a8a",
  "type": "cssVariable",
  "context": {
    "tag": "html",
    "definedIn": ":root",
    "file": "globals.css"
  }
}
```
This means the user changed a CSS variable definition globally. Apply by updating the variable value in the CSS file where it's defined (indicated by `context.file`). **All elements referencing this variable will be affected.**

#### `type: "delete"` — Element Removed
```json
{
  "selector": null,
  "property": "__delete__",
  "oldValue": "div",
  "value": null,
  "type": "delete",
  "context": { "tag": "div" }
}
```

#### `type: "reorder"` — Child Elements Reordered
```json
{
  "selector": ".card-list",
  "property": "__reorder__",
  "oldValue": "div,div,div",
  "value": "div,div,div",
  "type": "reorder"
}
```

## context — Element Context

Each change's `context` provides rich information for accurate code modification.

```json
{
  "tag": "h1",
  "id": "hero-title",
  "classList": ["text-2xl", "font-bold", "text-gray-900"],
  "role": "heading",
  "dataAttributes": { "data-testid": "hero-title" },

  "parentTag": "section",
  "parentId": "hero",
  "parentClassList": ["flex", "items-center"],
  "parentDisplay": "flex",

  "styleOrigin": "stylesheet",
  "matchedRule": {
    "selector": ".hero-title",
    "file": "styles.css",
    "value": "#333"
  },
  "cssVariable": {
    "name": "--text-primary",
    "value": "#333333",
    "rawExpression": "var(--text-primary, #333)",
    "fallback": "#333",
    "definedIn": ":root",
    "file": "globals.css"
  },
  "cssFramework": {
    "name": "tailwind",
    "confidence": "high"
  },
  "tailwindHint": {
    "remove": ["text-gray-900"],
    "add": ["text-blue-900"],
    "note": "color #1e3a8a maps to Tailwind blue-900"
  },
  "pseudoState": ":hover"
}
```

### Key Context Fields

| Field | When Present | Usage |
|-------|-------------|-------|
| `styleOrigin` | Always (for style changes) | `"inline"` → edit inline style; `"stylesheet"` → edit CSS file; `"inherited"` → may need new rule |
| `matchedRule` | When property comes from a CSS rule | Tells you exactly which file and selector to edit |
| `cssVariable` | When property uses `var(--xxx)` | Consider modifying the variable definition instead of overriding inline |
| `cssFramework` | When Tailwind/utility classes detected | Use `tailwindHint` for class-based changes instead of inline styles |
| `tailwindHint` | When cssFramework is Tailwind | Specific class add/remove suggestions |
| `pseudoState` | When editing :hover/:focus/:active | Apply change to the pseudo-state CSS rule, not the base rule |

## byElement[] — Grouped View

Changes grouped by element, with intent analysis and group-level strategy.

```json
{
  "selector": ".hero-title",
  "tag": "h1",
  "role": "heading",
  "changes": [
    { "property": "color", "oldValue": "#333", "newValue": "#1e3a8a", "type": "style", ... },
    { "property": "fontSize", "oldValue": "24px", "newValue": "32px", "type": "style", ... }
  ],
  "intent": "调整配色和字号",
  "strategy": "修改 styles.css 中 '.hero-title' 规则"
}
```

### intent Values

Auto-inferred from the changes:
- `调整配色` — Color-related changes
- `调整字体` — Font size/weight changes
- `调整间距` — Padding/margin/gap changes
- `调整尺寸/位置` — Width/height/position changes
- `更新文案` — Text content changes
- `更新图片` — Image source changes
- `综合调整` — Multiple types of changes

## patterns[] — Cross-Element Patterns

Detected when multiple elements have the same type of change, suggesting a batch CSS modification.

```json
{
  "type": "batch-same-change",
  "description": "3 个 <button> 元素都将 backgroundColor 改为 #1e3a8a",
  "elements": [".btn-primary", ".btn-secondary", ".btn-tertiary"],
  "commonSelector": ".btn",
  "commonTag": "button",
  "change": {
    "property": "backgroundColor",
    "oldValue": [],
    "newValue": "#1e3a8a"
  },
  "suggestion": "建议修改 .btn 的共同样式规则，而非逐个元素修改"
}
```

**When patterns are detected, prefer following the `suggestion` over applying changes one by one.**

## Stdout Output

The server prints a human-readable summary followed by a complete JSON object to stdout:

```
📋 ─── PAGE EDITOR CHANGES ───
目标文件: ./dist/index.html
修改元素: 5 个
  .hero-title (h1) — 2 处改动 (color, fontSize)
  .hero-section (section) — 1 处改动 (backgroundColor)
模式检测: 1 个批量修改模式
  → 3 个 <button> 元素都将 backgroundColor 改为 #1e3a8a

详细 JSON: ./page-edits.json
{ ... full JSON ... }
─── END CHANGES ───
```

## Framework-Specific Application Guide

### Plain HTML (single file)
- Style changes → Add/modify `<style>` block rules matching the selector
- Text changes → Find and update text nodes directly
- If `styleOrigin` is `"inline"` → Modify the element's `style` attribute

### HTML + External CSS
- Use `matchedRule.file` to locate the correct CSS file
- Use `matchedRule.selector` to find the rule to modify
- CSS variable changes → Find the `:root` block in the indicated file

### React + Tailwind
- If `tailwindHint` is present → Use the add/remove class suggestions
- Text changes → Update JSX text content
- If no tailwind hint → Use inline style or create a CSS class

### Vue SFC
- Style changes → Update `<style>` block CSS rules
- Text changes → Update `<template>` text content
- CSS variable changes → Update the variable in the shared CSS file

### Build Artifacts (Next.js, Vite, etc.)
- The HTML file is a build output — do NOT edit it directly
- Use `context.classList`, `context.dataAttributes` to find the source component
- Apply changes to the source files, then rebuild
