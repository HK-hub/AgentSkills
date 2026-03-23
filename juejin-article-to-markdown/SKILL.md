---
name: juejin-article-to-markdown
description: 将掘金(juejin.cn)文章转换为整洁的 Markdown 文件，自动去除导航栏、评论区、推荐文章等无关内容，正确处理代码块、表格、图片等格式。当用户提供掘金文章链接或要求保存掘金文章时使用此技能。
---

# 掘金文章转 Markdown

## 概述

掘金文章页面包含大量无关内容（导航栏、侧边栏、评论区、推荐文章、代码块按钮等），直接复制粘贴会产生格式问题。此 Skill 提供一套完整的处理流程，将掘金文章转换为干净、规范的 Markdown 文件。

## 触发条件

- 用户提供掘金文章链接（`juejin.cn/post/`）
- 用户说"保存掘金文章"、"另存掘金为 Markdown"
- 用户想要整理掘金文章到笔记库

## 完整处理流程

### 第一步：获取文章内容

**同时获取 HTML 和 Markdown 两种格式**（并行请求）：

```
# 请求 1：HTML 格式（用于提取元信息和图片位置）
mcp__ScraplingServer__stealthy_fetch
  - url: 掘金文章链接
  - extraction_type: html
  - main_content_only: true
  - wait: 2000

# 请求 2：Markdown 格式（用于提取正文内容）
mcp__ScraplingServer__stealthy_fetch
  - url: 掘金文章链接
  - extraction_type: markdown
  - main_content_only: true
  - wait: 2000
```

### 第二步：提取文章元信息

从 HTML 或 Markdown 开头提取：

| 字段 | 提取方式 | 说明 |
|------|---------|------|
| 标题 | `<h1>` 或 `# 标题` | 文章主标题 |
| 作者 | 作者名称字段 | 作者用户名 |
| 发布日期 | 日期字段 | 格式：YYYY-MM-DD |
| 阅读量 | 阅读数字段 | 可选 |
| 标签 | 标签列表 | 文章标签 |
| 专栏 | 专栏名称 | 可选 |

### 第三步：清理无关内容

**必须移除的内容：**

1. **导航栏和页眉**
   - 首页、沸点、课程、数据标注、AI Coding 等导航
   - 搜索框
   - 创作者中心
   - 登录/注册按钮

2. **侧边栏和推荐**
   - 搜索建议
   - 精选内容
   - 为你推荐文章列表
   - 目录（可选择性保留简化版）

3. **评论区**
   - 评论列表
   - 评论输入框
   - 点赞、屏蔽、举报按钮

4. **页脚和推广**
   - 下载APP提示
   - 微信公众号二维码
   - 新浪微博链接
   - AI代码助手推广

5. **代码块无关内容**
   - "体验AI代码助手"按钮文字
   - "代码解读"按钮文字
   - "复制代码"按钮文字

6. **互动元素**
   - 点赞、收藏、分享按钮
   - 关注按钮
   - 专栏订阅按钮

### 第四步：处理代码块

掘金代码块会包含无关的按钮文字，需要清理：

**清理模式：**

```markdown
# 原始（有问题）
```bash

体验AI代码助手

代码解读

复制代码

# 实际代码
git clone https://github.com/xxx
```

# 清理后
```bash
# 实际代码
git clone https://github.com/xxx
```
```

**处理规则：**
1. 识别代码块开始（```language）
2. 删除代码块开头的空白行
3. 删除"体验AI代码助手"、"代码解读"、"复制代码"等无关行
4. 保留实际代码内容
5. 确保代码块正确闭合

### 第五步：处理图片

**掘金图片特点：**

| 域名 | 处理方式 | 说明 |
|------|---------|------|
| `p*-xtjj-sign.byteimg.com` | **保留** | 文章正文图片 |
| `p*-juejin-sign.byteimg.com` | **保留** | 文章正文图片 |
| `p1-juejin.byteimg.com` | **保留** | 封面图等 |
| `lf-web-assets.juejin.cn` | **丢弃** | Logo、图标等装饰 |
| `p*-passport.byteacctimg.com` | **丢弃** | 用户头像 |

**图片链接格式：**
```
https://p9-xtjj-sign.byteimg.com/tos-cn-i-73owjymdk6/xxx~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:q75.awebp?rk3s=xxx&x-expires=xxx&x-signature=xxx
```

**处理方式：**
- 保留完整链接（包括签名参数）
- 链接有时效性，但通常较长

### 第六步：处理链接

**掘金外链跳转格式：**
```
https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fxxx
```

**处理规则：**
1. 解析 `target` 参数，提取真实 URL
2. URL 解码（%3A → :, %2F → /）
3. 替换为真实链接

**示例：**
```markdown
# 原始
[GitHub 仓库](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2F598572%2Fxzll-im-server)

# 处理后
[GitHub 仓库](https://github.com/598572/xzll-im-server)
```

### 第七步：处理表格

掘金使用标准 Markdown 表格格式，需要确保：

1. 表头分隔行正确（`| --- | --- |`）
2. 列对齐符号正确（`:---`, `:---:`, `---:`）
3. 表格前后有空行

**表格示例：**
```markdown
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Long | 全局唯一ID |
| name | String | 用户名 |
```

### 第八步：处理 Mermaid 图表

掘金使用 `bytemd-mermaid` 类渲染 Mermaid 图表，需要特殊处理。

**重要发现：原始 Mermaid 代码存储在 `window.__NUXT__` 数据中**

掘金在服务端将 Mermaid 代码渲染为 SVG 用于页面显示，但原始 Mermaid 代码保存在页面的 `window.__NUXT__` JavaScript 变量中。

#### 方案 A：从 `__NUXT__` 提取原始 Mermaid 代码（推荐）

**优点**：保留可编辑的源码，Obsidian/Typora 等工具可直接渲染

**提取方法**：

1. 在 HTML 中查找 `<script>window.__NUXT__=` 标签
2. 提取脚本内容
3. 解码转义序列（`\n` → 换行，`\uXXXX` → Unicode 字符）
4. 使用正则表达式提取 ` ```mermaid\n...\n``` ` 代码块

**Python 示例代码**：

```python
import re

# 找到 __NUXT__ 脚本
script_match = re.search(r'<script[^>]*>window\.__NUXT__\s*=', html_content)
if script_match:
    script_start = script_match.start()
    script_end = html_content.find('</script>', script_start)
    script_content = html_content[script_start:script_end]

    # 解码 Unicode 转义
    decoded = re.sub(r'\\u([0-9a-fA-F]{4})',
                     lambda m: chr(int(m.group(1), 16)), script_content)
    decoded = decoded.replace('\\n', '\n')

    # 提取 Mermaid 代码块
    pattern = r'```mermaid\n(.*?)```'
    mermaid_blocks = re.findall(pattern, decoded, re.DOTALL)
```

**输出格式**：
```markdown
\`\`\`mermaid
sequenceDiagram
    participant C as 客户端
    C->>G: 登录请求
\`\`\`
```

#### 方案 B：提取 SVG 并保存为文件（备选）

**适用场景**：`__NUXT__` 中没有 Mermaid 代码时

**提取方法**：

从 HTML 中查找以下结构：
```html
<div class="bytemd-mermaid" style="line-height: initial;">
  <svg aria-roledescription="flowchart-v2" ...>...</svg>
</div>
```

**处理步骤**：
1. 在 HTML 中查找 `class="bytemd-mermaid"` 元素
2. 检查是否包含 `<svg>` 内容
3. 如果有 SVG，提取完整的 `<svg>...</svg>` 内容
4. 保存为 `.svg` 文件，命名为对应章节标题
5. 在 Markdown 中使用图片引用

**注意事项**：
- 部分 `bytemd-mermaid` div 可能是空的（作者未添加内容），需要跳过
- SVG 文件较大（通常 30-50KB），需要单独存储
- 使用相对路径引用：`![流程图](images/日期-文章名/图表名.svg)`：
```markdown
![流程图](https://mermaid.ink/img/Z3JhcGggVEQ7IEEtLT5COw==)
```

#### 方案 C：截图保存（备选）

如果无法提取原始代码，可以截图渲染后的 SVG：

```javascript
// Playwright 截图示例
const element = await page.$('.bytemd-mermaid svg');
await element.screenshot({ path: 'mermaid-diagram.png' });
```

**注意**：此方法需要额外的图片存储。

#### 处理建议

| 场景 | 推荐方案 |
|------|---------|
| 使用 Obsidian/Typora | 方案 A（保留代码） |
| 需要通用兼容 | 方案 B（mermaid.ink 图片） |
| 离线使用 | 方案 C（截图保存） |

### 第九步：处理列表

**有序列表：**
```markdown
1. 第一步
2. 第二步
3. 第三步
```

**无序列表：**
```markdown
- 项目一
- 项目二
- 项目三
```

**嵌套列表：**
```markdown
1. 主项目
   - 子项目一
   - 子项目二
2. 下一个主项目
```

**处理规则：**
1. 确保列表项前后有空行
2. 嵌套使用 2 或 4 空格缩进
3. 列表符号统一（无序用 `-`，有序用 `1.` `2.` 等）

### 第十步：添加元信息

在文件开头添加 YAML frontmatter：

```markdown
---
title: 文章标题
author: 作者名称
source: 原始链接
date_saved: 保存日期
tags: [掘金, 其他标签]
---
```

### 第十一步：保存文件

**文件命名规则：**
- 格式：`YYYY-MM-DD-标题摘要.md`
- 标题摘要：取标题前 30 字符，去除特殊字符
- 示例：`2026-03-19-开源分布式IM系统介绍.md`

---

## 常见问题处理

### 问题 1：代码块格式混乱

**原因**：掘金代码块包含按钮文字

**解决方案**：
```
清理代码块开头的前 3-5 行无关内容
保留实际代码
确保语言标识正确
```

### 问题 2：链接无法访问

**原因**：使用掘金跳转链接

**解决方案**：
```
解析 link.juejin.cn?target=xxx
提取并解码真实 URL
直接使用真实链接
```

### 问题 3：图片无法显示

**原因**：
1. 图片链接过期
2. 使用了头像等无关图片

**解决方案**：
```
保留 p*-xtjj-sign.byteimg.com 和 p*-juejin-sign.byteimg.com 域名图片
丢弃 lf-web-assets.juejin.cn 和 passport 相关图片
```

### 问题 4：表格格式错乱

**原因**：表格前后缺少空行

**解决方案**：
```
确保表格前后各有一个空行
检查表头分隔符
确保每行列数一致
```

### 问题 5：Mermaid 图表丢失或显示异常

**原因**：
1. 需要从 `window.__NUXT__` 数据中提取原始 Mermaid 代码
2. `bytemd-mermaid` div 可能为空（作者未添加内容）

**解决方案**：
```
方案 A：从 __NUXT__ 提取原始 Mermaid 代码（推荐）
  - 查找 <script>window.__NUXT__= 标签
  - 解码 Unicode 转义序列（\uXXXX）
  - 解码换行符（\n → 实际换行）
  - 用正则提取 ```mermaid ... ``` 代码块
  - 直接嵌入 Markdown 文件

方案 B：提取 SVG 保存为文件（备选）
  - 仅当 __NUXT__ 中没有 Mermaid 代码时使用
  - 查找 .bytemd-mermaid 内的 <svg> 标签
  - 保存为 .svg 文件

方案 C：跳过空图表
  - 检查 bytemd-mermaid div 是否包含 SVG
  - 如果为空，保留章节标题但不添加图表
  - 这是作者原文就没有图表，不是转换问题
```

**代码示例**（提取 Mermaid 源码）：
```python
import re

# 找到 __NUXT__ 脚本
script_match = re.search(r'<script[^>]*>window\.__NUXT__\s*=', html)
if script_match:
    script_end = html.find('</script>', script_match.start())
    script = html[script_match.start():script_end]

    # 解码转义
    decoded = re.sub(r'\\u([0-9a-fA-F]{4})',
                     lambda m: chr(int(m.group(1), 16)), script)
    decoded = decoded.replace('\\n', '\n')

    # 提取 Mermaid 代码
    blocks = re.findall(r'```mermaid\n(.*?)```', decoded, re.DOTALL)
    for code in blocks:
        print(code)  # 输出原始 Mermaid 代码
```

---

## 输出模板

```markdown
---
title: {{文章标题}}
author: {{作者}}
source: {{原始链接}}
date_saved: {{保存日期}}
tags: [掘金, {{其他标签}}]
---

# {{文章标题}}

> 作者：{{作者名称}}
> 来源：掘金
> 链接：{{原始链接}}
> 发布日期：{{发布日期}}

![封面图片]({{封面图片链接}})

{{正文内容}}

---

*本文由 [juejin-article-to-markdown] 自动转换*
*保存自掘金文章，仅供个人学习使用*
```

---

## 示例工作流

用户输入：
```
保存这篇掘金文章 https://juejin.cn/post/7549107076905173028
```

处理步骤：
1. **并行获取** HTML 和 markdown 两种格式
2. **提取元信息**：标题、作者、日期、标签
3. **清理导航栏**：移除首页、沸点、课程等
4. **清理代码块**：删除"体验AI代码助手"等按钮文字
5. **处理链接**：解析跳转链接，提取真实 URL
6. **处理图片**：保留正文图片，丢弃装饰图片
7. **格式化表格**：确保表格格式正确
8. **添加 frontmatter**：元信息
9. **保存文件**：按命名规则保存

---

## 与微信文章处理的区别

| 特性 | 微信公众号 | 掘金 |
|------|----------|------|
| 图片域名 | mmbiz.qpic.cn | byteimg.com |
| 外链处理 | 通常无外链 | 需解析 link.juejin.cn |
| 代码块 | 无特殊按钮 | 需清理按钮文字 |
| Mermaid图表 | 无 | 需提取原始代码或转图片 |
| 评论 | 需移除评论区 | 需移除评论区 |
| 推荐 | 无推荐文章 | 需移除推荐列表 |
| 目录 | 通常无目录 | 可选择性保留 |

---

## 注意事项

1. **版权提醒**：保存的文章仅供个人学习使用，请勿二次传播
2. **图片时效**：掘金图片链接带签名，有时效性
3. **代码块**：特别注意清理按钮文字
4. **外链**：记得解析跳转链接
5. **表格**：确保格式正确，前后有空行
6. **Mermaid 图表**：掘金将 Mermaid 渲染为 SVG，需提取 SVG 保存为文件；部分 `bytemd-mermaid` div 可能为空（作者未添加内容）
7. **不要添加原文不存在的内容**：保持文章原意，避免曲解作者意图

## 相关技能

- `wechat-article-to-markdown` - 处理微信公众号文章
- `pdf` - 处理 PDF 文件
- `docx` - 处理 Word 文档