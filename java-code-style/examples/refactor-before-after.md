# Java 风格改写对照（Bad → Good）

> 目标：只改风格与可维护性，不改变业务语义。

## 1) equals 调用顺序（防 NPE）

### Bad
```java
if (status.equals("PAID")) {
    process();
}
```

### Good
```java
if ("PAID".equals(status)) {
    process();
}
```

依据：OOP规约-6（第10页）

---

## 2) BigDecimal 构造与比较

### Bad
```java
BigDecimal amount = new BigDecimal(0.1);
if (amount.equals(new BigDecimal("0.10"))) {
    settle();
}
```

### Good
```java
BigDecimal amount = BigDecimal.valueOf(0.1);
if (amount.compareTo(new BigDecimal("0.10")) == 0) {
    settle();
}
```

依据：OOP规约-10/12（第11-12页）

---

## 3) 日志拼接改占位符

### Bad
```java
logger.info("create order id=" + orderId + ", userId=" + userId);
```

### Good
```java
logger.info("create order id={}, userId={}", orderId, userId);
```

依据：日志规约-5（第36页）

---

## 4) 禁止 System.out 生产日志

### Bad
```java
System.out.println("sync success: " + taskId);
```

### Good
```java
logger.info("sync success: taskId={}", taskId);
```

依据：日志规约-8（第36页）

---

## 5) 异常不要吞掉

### Bad
```java
try {
    callThirdParty();
} catch (Exception e) {
    // ignore
}
```

### Good
```java
try {
    callThirdParty();
} catch (Exception e) {
    logger.error("callThirdParty failed, requestId={}", requestId, e);
    throw new ServiceException("third-party call failed", e);
}
```

依据：异常处理-4、日志规约-9（第33/36页）

---

## 6) 线程池创建方式

### Bad
```java
ExecutorService pool = Executors.newFixedThreadPool(200);
```

### Good
```java
ExecutorService pool = new ThreadPoolExecutor(
        20,
        100,
        60,
        TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(2000),
        r -> new Thread(r, "order-worker-" + THREAD_ID.incrementAndGet()),
        new ThreadPoolExecutor.CallerRunsPolicy()
);
```

依据：并发处理-2/4（第20页）

---

## 7) ThreadLocal 使用后回收

### Bad
```java
CONTEXT.set(userContext);
doBusiness();
```

### Good
```java
CONTEXT.set(userContext);
try {
    doBusiness();
} finally {
    CONTEXT.remove();
}
```

依据：并发处理-6（第21页）

---

## 8) SQL 参数化与防注入

### Bad
```java
String sql = "select * from user where name='" + name + "'";
```

### Good
```java
String sql = "select id, name from user where name = ?";
```

依据：安全规约-3（第40页）

---

## 9) if-else 金字塔改卫语句

### Bad
```java
if (req != null) {
    if (req.getUserId() != null) {
        if (req.getAmount() != null) {
            handle(req);
        }
    }
}
```

### Good
```java
if (req == null || req.getUserId() == null || req.getAmount() == null) {
    return;
}
handle(req);
```

依据：控制语句-7（第25页）

---

## 10) 禁止 SELECT *

### Bad
```sql
SELECT * FROM t_order WHERE id = #{id}
```

### Good
```sql
SELECT id, user_id, amount, status, create_time, update_time
FROM t_order
WHERE id = #{id}
```

依据：ORM映射-1（第45页）
