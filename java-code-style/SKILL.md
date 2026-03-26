---
name: java-code-style
description: This skill should be used when the user asks to "制定 Java 代码风格规范", "审查 Java 代码风格", "按团队规范重构 Java 代码", "统一 Spring Boot 后端代码风格", "将个人编码心得沉淀为规范", or asks for Java style guides, review checklists, naming conventions, exception/logging standards, or code-style-based refactoring. Use proactively for Java/Spring backend style discussions even when the user only says "帮我看下这段代码是否规范".
version: 0.1.0
---

# Java Code Style Skill

将个人经验、团队约定与业界规范沉淀为可执行的 Java 代码风格工作流。

## Skill Goal

在 Java 后端场景中完成以下任务：

1. 产出可落地的代码风格规范（不是口号式原则）。
2. 对现有代码进行结构化风格审查（分级、可追踪、可修复）。
3. 在不改变业务语义的前提下提供最小改动的重构建议。
4. 统一团队在命名、异常、日志、边界分层、并发与数据库访问上的实践。

## Baseline Reference

优先参考以下资料作为基础规范源：

- `references/阿里巴巴Java开发规范（嵩山版）.md`

在引用规则时，尽量给出“章节 + 页码段”定位，避免泛化描述。

已知目录主干（来自手册）：

- 编程规约（命名、常量、格式、OOP、日期时间、集合、并发、控制语句、注释、前后端、其他）
- 异常日志（错误码、异常处理、日志规约）
- 单元测试
- 安全规约
- MySQL 数据库（建表、索引、SQL、ORM）
- 工程结构（应用分层、二方库依赖、服务器）
- 设计规约

## Operating Mode

默认按以下模式工作：

1. 先识别任务类型：规范制定 / 代码审查 / 代码改写。
2. 再识别技术上下文：JDK 版本、Spring Boot 版本、ORM、日志框架、构建工具。
3. 再应用规则：强制项优先于推荐项。
4. 最后输出可执行结果：问题清单、改写建议、统一模板。

## Required Inputs

在信息不足时，先补齐最小上下文：

- Java 与 Spring Boot 版本（例如 JDK 17 + Spring Boot 3.x）。
- 架构风格（分层/DDD/Clean Architecture）。
- 团队禁用项（如字段注入、通配符导入、`System.out.println`）。
- 当前目标（写新代码 / 审查旧代码 / 统一历史代码）。

若用户未提供，先按“通用企业级后端默认值”执行，并在输出中明确假设。

## Rule Hierarchy

将规则分成三层：

- **L1 强制（Blocking）**：违反后必须修改。
- **L2 推荐（Important）**：建议修改，影响可维护性与协作效率。
- **L3 参考（Nice-to-have）**：优化项，可在时间允许时处理。

将手册中的【强制 / 推荐 / 参考】映射到上述等级，并保持一致。

## Style Dimensions

审查或制定规范时，至少覆盖以下维度：

### 1) 命名与语义

- 统一类名、方法名、变量名风格。
- 禁止歧义缩写与混乱命名。
- 保证命名可表达业务含义与边界语义。

### 2) 常量与魔法值

- 抽离魔法值。
- 常量命名语义完整。
- 明确常量作用域（类内/模块内/跨模块）。

### 3) 代码结构与可读性

- 方法复杂度不设硬性上限，但必须保证可读性与可维护性。
- 强制使用卫语句（early return）减少分支金字塔。
- 工具类保持单一职责，优先复用成熟生态工具（如 Apache Commons Lang3、Commons Collections4、Guava），避免重复造轮子。
- 简单循环场景优先使用 `for` / `while`，禁止使用 `stream().forEach(...)`。
- 禁止在 Stream 管道中编写复杂业务逻辑或超长 lambda/匿名内部类；复杂逻辑先抽离为具名方法。
- Service 按 DDD 语义拆分，避免“万能服务类”。

### 4) OOP 与分层边界

- 严格区分 DTO / VO / DO / Entity / Command / Query。
- 实体类优先使用 Lombok 减少样板 getter/setter 代码。
- Service/DAO 默认采用接口 + Impl 模式。
- 保留 Manager 层，用于第三方适配、通用能力下沉与多 DAO 组合复用。
- 禁止跨层泄漏（Controller 直接拼 SQL、Repository 承担业务编排等）。
- 保持接口契约清晰，避免“万能服务类”。

### 5) 集合与并发

- 明确集合类型选择依据。
- 并发问题优先通过业务流程拆解降低冲突，再考虑锁策略。
- 优先减少分布式锁使用，避免将锁作为默认方案。
- JDK >= 21 时，优先评估虚拟线程方案。
- 明确并发访问场景与线程安全策略，避免无边界并发、隐式共享可变状态。

### 6) 控制流与防御性编程

- 强制卫语句，减少深层嵌套。
- 判空统一优先使用 `Objects.isNull` / `Objects.nonNull`。
- 相等判断统一优先使用 `Objects.equals`。
- 字符串判空/非空统一优先使用 `StringUtils.isEmpty` / `StringUtils.isNotEmpty`。
- 集合判空/非空统一优先使用 `CollectionUtils.isEmpty` / `CollectionUtils.isNotEmpty`。
- `if` 判断中禁止直接使用逻辑非 `!`，布尔判断优先使用 `BooleanUtils.isFalse` / `BooleanUtils.isTrue`。
- `Optional` 与 `null` 不做过度限制，按上下文选择。
- 对集合型返回（如 DB/RPC 查询 List），无数据或参数不合法时默认返回空列表。
- 在系统边界进行输入校验。

### 7) 异常、错误码、日志

- 业务异常体系主要用于 Controller 内部调用链（Manager/Service/Repository）。
- 端点 Controller 与 RPC 返回以 Result 结构为主，统一承载 success/errorCode/errorMessage。
- `RuntimeException` 可直接使用，不强制必须自定义业务异常。
- 项目存在错误码规范时遵循现有规范；不存在时按通用规范与项目经验建立。
- 日志避免“无意义、无上下文”输出；敏感信息与日志级别策略按具体项目场景定义。

### 8) 数据库与 ORM

- 以 MyBatis Plus 为主，兼容 MyBatis Flex、Jimmer 等 ORM 选型。
- SQL 可读、可维护、可索引命中。
- ORM 映射避免 N+1 与隐式全表扫描风险。
- 更新语句必须维护 `update_time`。
- SQL 风格不做硬编码约束，优先询问项目/团队偏好后统一（如关键字大小写、别名习惯、分页写法）。
- 索引设计与查询模式一致。

### 9) 缓存与一致性

- Redis 操作强制优先使用 Redisson；仅在无法满足需求时才可评估其他框架。
- 涉及本地缓存或分布式缓存时，必须建立 `XXXCacheManager` 作为统一入口。
- 所有缓存 `get/set/refresh` 等操作必须通过 `XXXCacheManager`，禁止业务代码直接操作缓存客户端。
- 缓存 Key 规范、TTL 策略与一致性策略必须集中定义并可审查；缓存刷新策略不设统一硬规则，按具体项目约定执行。

### 10) 测试与可验证性

- 关键业务规则必须可单元测试。
- 复杂分支必须有边界场景用例。
- 风格改写不改变行为，需有回归验证建议。

### 11) 工程结构与设计一致性

- 目录结构与架构分层一致。
- 模块职责边界清晰。
- 避免循环依赖与跨模块隐式耦合。

## Output Contracts

### A. 规范制定输出模板

按如下结构输出：

1. **适用范围**（技术栈、模块范围、执行阶段）
2. **规则分级表**（L1/L2/L3）
3. **禁止项清单**（可直接放进团队 code review）
4. **示例对照**（Bad / Good）
5. **落地机制**（审查节奏、自动化检查建议）

默认附带以下**固定禁止项 Top 10**：

1. 禁止在 `if` 条件中直接使用逻辑非 `!`，统一使用 `BooleanUtils.isFalse/isTrue`。
2. 禁止手写 `obj == null` / `obj != null` 判空链式判断，统一使用 `Objects.isNull/nonNull`。
3. 禁止使用存在空指针风险的相等判断（如 `a.equals(b)`），统一使用 `Objects.equals(a, b)`。
4. 禁止手写字符串判空表达式（如 `str == null || str.length() == 0`），统一使用 `StringUtils.isEmpty/isNotEmpty`。
5. 禁止手写集合判空表达式（如 `list == null || list.isEmpty()`），统一使用 `CollectionUtils.isEmpty/isNotEmpty`。
6. 禁止在简单遍历场景使用 `stream().forEach(...)`，统一使用 `for`/`while`。
7. 禁止在 Stream 管道中编写复杂业务逻辑、超长 lambda 或庞大匿名内部类。
8. 禁止跨层职责泄漏（如 Controller 直接拼 SQL、Repository 承担业务编排）。
9. 禁止在更新链路遗漏 `update_time` 维护。
10. 禁止输出无意义、无上下文日志。

### B. 代码审查输出模板

按如下格式输出：

- **Summary**：总体结论（通过 / 需整改）
- **Findings**：
  - `CRITICAL`：阻断问题（必须改）
  - `MAJOR`：重要问题（建议尽快改）
  - `MINOR`：优化问题
- 每条问题必须包含：
  1. 位置（文件/类/方法）
  2. 问题说明
  3. 违反规则
  4. 修改建议（尽量给出示例）

### C. 改写建议输出模板

- 先给“最小变更方案”（优先）。
- 再给“增强方案”（可选）。
- 标注潜在影响面（接口、事务、SQL、并发语义）。

## Refactor Guardrails

执行代码风格重构时，遵循以下护栏：

1. 保持业务语义不变。
2. 保持对外契约不变（除非用户明确要求）。
3. 单次改动聚焦一种问题，避免混合重构。
4. 不引入与任务无关的新抽象。
5. 避免“顺手大改”。

## Conflict Resolution Policy

当“个人习惯、团队约定、手册规则”冲突时，按以下优先级处理：

1. 项目既有强约束（lint、框架约束、历史兼容要求）
2. 团队明确约定
3. 手册强制项
4. 个人风格偏好

输出时明确说明冲突点与取舍理由。

## Default Java/Spring Backend Defaults

当用户未给团队规则时，使用以下默认基线：

- Controller 层只做协议转换与参数校验，对外以 Result 结构返回。
- Service 层承载业务编排，按 DDD 进行职责拆分。
- 保留 Manager 层用于第三方适配、通用能力下沉和多 DAO 组合复用。
- Repository/Mapper 层只处理持久化。
- 事务边界不做硬性限制，可根据场景位于 Service/Manager/定时任务。
- ORM 默认 MyBatis Plus，兼容 MyBatis Flex/Jimmer。
- 更新语句默认维护 `update_time`。
- JDK >= 21 时优先评估虚拟线程。
- 优先构造器注入，避免隐藏依赖。

## Trigger Examples

以下用户表达应触发本技能：

- “帮我做一份 Java 后端代码规范。”
- “这段 Spring Boot 代码风格不统一，帮我审查。”
- “把我的编码习惯沉淀成团队 SKILL。”
- “给我一套 Java 异常和日志规范模板。”
- “按阿里规范 + 团队经验，给出可执行检查表。”

## Non-Goals

以下内容不作为默认目标，除非用户显式要求：

- 大规模架构迁移
- 业务逻辑重写
- 与风格无关的性能专项优化
- 与风格无关的基础设施改造

## Additional Resources

### Reference Files

- `references/阿里巴巴Java开发规范（嵩山版）.md`：原始规范全文（转换版）
- `references/rules-mapping.md`：本 Skill 的 L1/L2/L3 映射与规则索引

### Example Files

- `examples/review-output-template.md`：标准化审查报告模板
- `examples/refactor-before-after.md`：常见风格改写对照（Bad/Good）

## Quick Checklist

交付前至少检查：

- 是否明确适用范围。
- 是否给出分级规则。
- 是否给出可执行禁止项。
- 是否包含 Bad/Good 示例。
- 是否给出落地与审查机制。
- 是否区分“必须改”与“可优化”。

## Collaboration Questions for Tailoring

每轮优化优先询问并固化以下偏好：

1. 命名与分层：DO/DTO/VO/Entity/Command/Query 边界、Service 接口化、Manager 职责。
2. 代码结构：是否强制卫语句、工具类复用策略、DDD 拆分粒度。
3. 空值策略：`Optional` 使用边界、`null` 语义、空列表返回约定。
4. 异常体系：业务异常与 RuntimeException 的边界、Result 使用场景。
5. 错误码：沿用项目规范或新建规范的原则。
6. 日志规范：上下文字段、级别约束、敏感信息处理策略。
7. ORM/SQL：技术选型、update_time 约束、SQL 风格约束强度。
8. 并发与事务：事务边界、锁策略优先级、虚拟线程采用条件。

在后续版本中，根据真实审查案例持续补充例外规则与反例库。