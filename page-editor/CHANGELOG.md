# Page Editor — 版本迭代日志

## v2.3.5 (2026-06-08)

### 新增
- 大同/Beacon 数据埋点全套接入（Appkey: `0WEB070FKPM08M1L`，应用 ID: `dt_page_editor`）
  - `scripts/track.sh` — 零依赖 Shell 上报脚本，适配 CodeBuddy/Claude Code/OpenClaw/BoxAI
  - `tools/report.sh` — 统一上报工具（init/complete/event/batch/debug 子命令）
  - `hooks/hooks.py` + `hooks/_common.py` — 多平台 Hook 分发器（CodeBuddy/Claude Code 事件名双映射）
  - `trackmate/tracking_plan.md` — 埋点方案文档
  - `trackmate/dashboard_prompt.md` — 数据看板生成提示词
- SKILL.md 新增「数据上报（MANDATORY）」章节：skill_invoked / task_completed / error_occurred 三时机上报

### 优化
- SKILL.md 示例命令中 Appkey 已替换为真实值，无残留占位符

---

## v2.3.4 (2026-05-29)

### 新增
- 字号输入控件升级：同时支持自由输入和下拉选择常用网页字号（10px~128px）
  - 使用自定义下拉组件替代原生 datalist（下拉箭头更明显）
  - 支持下拉选择后自动应用，视口边界自动翻转

### 修复
- 项目隔离问题：修改记录（端口文件 `.page-editor.port`、编辑输出 `page-edits.json`）存储到目标项目目录
  - 避免多项目同时使用全局 skill 时的数据串扰
  - 端口文件 JSON 新增 `targetDir` 字段用于冲突校验

### 优化
- 更新 `SKILL.md`，新增「⚠️ 项目隔离（重要）」章节
  - 明确两种使用模式（项目级 skill / 全局 skill）的优劣
  - 建议使用项目级 skill 模式以获得最佳体验
- 版本号统一升级到 2.3.4

---

## v2.3.3 (2026-04-24)

### 新增
- 图片属性面板增强：所有非黑名单元素（div/section/button/span 等）均可添加背景图
  - 无图片时只显示 header + `+` 按钮；点 `+` 打开图片选择器
  - 有图片时显示图片行（缩略图 + 文件名 + 适配模式 + `-` 删除按钮）
  - 点 `-` 删除背景图（容器本身保留），行消失回到 `+` 状态
  - 黑名单排除 SVG/表单控件/媒体元素/IMG（IMG 走 src 逻辑）

### 优化
- 坐标行（X/Y）右侧增加按钮列留白，与布局/内边距/外边距行对齐

---

## v2.3.2 (2026-04-20)

### 修复
- 修复：改变元素顺序（前移/后移）后，选中态的四个锚点（ResizeHandles）不跟随更新位置
- 修复：undo/redo 后锚点同样不更新，一并修复
- 修复：字号（font-size）控件由纯下拉选择改为支持自由输入，同时保留预设候选值；支持 Enter 确认和 ↑↓ 箭头 ±1px（Shift ±10px）微调

---

## v2.3.1 (2026-04-17)

### 修复
- （初始记录版本，正式引入 CHANGELOG）

---

## v2.3.0

### 新增
- 双进程闭环工作流：`--monitor` 阻塞监听，用户保存后自动输出变更 JSON 并退出
- `--reload` 模式：通知运行中的编辑器刷新预览
- 一致性扫描器（Consistency Scanner）：检测字号/间距/色值不规范，一键修复

---

## v2.2.0

### 新增
- 属性面板：Flex 布局可视化 + 9宫格对齐
- Number Scrubber：按住标签左右拖动数值微调
- 撤销/重做（UndoStack）
- 顺序控制（Order Section）：前移/后移/直接选择位置

---

## v2.1.0

### 新增
- 颜色拾取器（ColorPickerPanel）：支持 solid / 线性渐变 / 径向渐变
- 填充 / 描边 / 阴影三段式面板
- CSS Token 颜色库（从页面 CSS 变量自动提取）

---

## v2.0.0

### 重构
- 属性面板拆分为独立模块：`pp-layout.js`、`pp-appearance.js`、`pp-helpers.js`
- 选中元素时面板浮动定位（不再固定在角落）

---

## v1.x

- 初始版本：基础点选 + 属性编辑 + 保存为 page-edits.json
