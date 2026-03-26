# Java 代码风格审查模板（可直接复用）

## Summary

- 审查范围：`<模块/PR/目录>`
- 技术上下文：`JDK <xx> / Spring Boot <xx> / ORM <xx>`
- 结论：`通过 / 有条件通过 / 需整改`
- 总体风险：`低 / 中 / 高`

## Findings

### CRITICAL（必须整改）

#### 1) [E-L1-06] 生产日志违规输出
- 位置：`src/main/java/.../OrderService.java:87`
- 问题：使用 `System.out.println` 输出生产日志。
- 依据：日志规约-8（第36页）禁止 `System.out/System.err/printStackTrace`。
- 影响：日志不可控、滚动策略失效、排障信息分散。
- 建议改法：改为 `logger.info("orderId={}, ...", orderId)` 并保留结构化字段。

#### 2) [F-L1-02] SQL 注入风险
- 位置：`src/main/resources/mapper/UserMapper.xml:43`
- 问题：使用 `${orderBy}` 直接拼接参数。
- 依据：ORM映射-4（第46页）参数必须使用 `#{}`。
- 影响：可被构造恶意 SQL。
- 建议改法：白名单枚举映射字段 + `#{}` 绑定值。

### MAJOR（建议尽快整改）

#### 1) [C-L2-02] Getter 中混入业务逻辑
- 位置：`src/main/java/.../UserProfile.java:52`
- 问题：`getScore()` 内根据条件动态加减分。
- 依据：OOP规约-22（第13页）。
- 影响：语义不稳定，排障困难。
- 建议改法：将计算逻辑迁移至 `calculateScore()`，getter 仅返回字段。

#### 2) [D-L2-01] 线程命名不可观测
- 位置：`src/main/java/.../AsyncConfig.java:31`
- 问题：线程池线程名默认，无法快速定位来源。
- 依据：并发处理-2（第20页）。
- 影响：jstack、监控排查成本高。
- 建议改法：配置 ThreadFactory 命名模板，如 `order-sync-worker-%d`。

### MINOR（可优化）

#### 1) [B-L2-02] 可读性空行不足
- 位置：`src/main/java/.../CouponService.java:116-148`
- 问题：三段业务逻辑无空行分隔。
- 依据：代码格式-13（第10页）。
- 影响：阅读负担增加。
- 建议改法：按“校验/转换/持久化”分段添加单空行。

## Recommended Refactor Plan

1. **先改 CRITICAL**：日志输出与 SQL 参数化（阻断线上风险）。
2. **再改 MAJOR**：Getter 语义、线程池可观测性。
3. **最后清理 MINOR**：可读性和格式统一。

## Verification Checklist

- [ ] 编译通过、单测通过
- [ ] 关键链路回归通过
- [ ] 日志输出符合门面规范（SLF4J）
- [ ] SQL 全部参数化，无 `${}` 注入入口
- [ ] 修改未改变业务语义

## Rule Index（本次引用）

- `E-L1-06` → 日志规约-8（第36页）
- `F-L1-02` → ORM映射-4（第46页）
- `C-L2-02` → OOP规约-22（第13页）
- `D-L2-01` → 并发处理-2（第20页）
- `B-L2-02` → 代码格式-13（第10页）
