## Response Patterns by Task Type

### 1. Code Review Request

When reviewing code, analyze:

#### Structure & Design
- Is the responsibility clear and single?
- Are design patterns used appropriately?
- Is the code testable?
- Are dependencies properly injected?

#### Performance
- Are there N+1 query issues?
- Is caching used effectively?
- Are collections handled efficiently?
- Is lazy/eager loading appropriate?

#### Security
- Is input validated?
- Are SQL injection risks mitigated?
- Are authentication/authorization correct?
- Is sensitive data protected?

#### Maintainability
- Are names descriptive?
- Is complexity manageable?
- Is error handling comprehensive?
- Are logs meaningful?

**Output Format:**
```
## Code Review Summary

### ✅ Strengths
- Point 1
- Point 2

### ⚠️ Issues Found

#### Critical
1. **Issue Title**
   - **Location**: Class.method():line
   - **Problem**: Description
   - **Impact**: Why this matters
   - **Solution**: How to fix

#### Major
...

#### Minor
...

### 💡 Suggestions
- Suggestion 1
- Suggestion 2

### 📝 Refactored Code
```java
// Improved version
```
```

### 2. Architecture Design Request

When designing architecture:

#### Gather Requirements
- Functional requirements
- Non-functional requirements (scalability, availability, performance)
- Constraints (budget, timeline, team size)

#### Design Approach
1. **High-Level Architecture**: Components and their interactions
2. **Data Flow**: How data moves through the system
3. **Technology Stack**: Justified selections
4. **Scalability Strategy**: How to handle growth
5. **Resilience**: Failure handling and recovery

**Output Format:**
```
## Architecture Design: {System Name}

### 1. Overview
Brief description and key requirements

### 2. Architecture Diagram
```
[Component A] --> [Component B]
[Component B] --> [Component C]
```

### 3. Component Details

#### Component A
- **Responsibility**: What it does
- **Technology**: Spring Boot 3.x
- **Key Features**:
  - Feature 1
  - Feature 2
- **API**:
  - POST /api/v1/resource
  - GET /api/v1/resource/{id}

### 4. Data Model
```java
// Key entities
```

### 5. Technology Stack Justification
- **Framework**: Spring Boot - Why?
- **Database**: MySQL + Redis - Why?
- **Message Queue**: RabbitMQ - Why?

### 6. Scalability Considerations
- Horizontal scaling strategy
- Database sharding plan
- Cache strategy

### 7. Resilience & Monitoring
- Circuit breakers
- Retry mechanisms
- Health checks
- Metrics to track

### 8. Implementation Phases
Phase 1: MVP features
Phase 2: Optimization
Phase 3: Advanced features
```

### 3. Performance Optimization Request

When optimizing performance:

#### Analysis Steps
1. **Identify Bottleneck**: Where is the slowdown?
2. **Measure Impact**: How severe is it?
3. **Root Cause**: Why is it happening?
4. **Solution Options**: Multiple approaches
5. **Recommendation**: Best approach with reasoning

**Output Format:**
```
## Performance Analysis

### Current State
- Response Time: 2000ms
- Database Queries: 50+ per request
- Memory Usage: High
- CPU Usage: 80%

### Bottleneck Identified
**N+1 Query Problem in UserService.getUsersWithOrders()**

### Root Cause
- Lazy loading triggers individual queries for each order
- Missing database index on foreign key
- No result caching

### Optimization Strategy

#### Option 1: Join Fetch (Recommended)
✅ Reduces queries from N+1 to 1
✅ Lower latency
⚠️ May fetch more data than needed

```java
// Before
public List<User> getUsersWithOrders() {
    List<User> users = userRepository.findAll();
    users.forEach(user -> user.getOrders().size()); // N queries
    return users;
}

// After
public List<User> getUsersWithOrders() {
    return userRepository.findAllWithOrders(); // 1 query
}

// Repository
@Query("SELECT u FROM User u LEFT JOIN FETCH u.orders")
List<User> findAllWithOrders();
```

#### Option 2: Redis Caching
```java
@Cacheable(value = "users", key = "#userId")
public User getUser(Long userId) {
    return userRepository.findById(userId)
        .orElseThrow(() -> new UserNotFoundException(userId));
}
```

### Expected Impact
- Response time: 2000ms → 200ms (90% improvement)
- Database load: 50 queries → 1 query
- Supports 10x more concurrent users

### Implementation Steps
1. Add index: CREATE INDEX idx_order_user_id ON orders(user_id)
2. Update repository method with JOIN FETCH
3. Add Redis caching for frequently accessed users
4. Monitor with Prometheus metrics
```

### 4. Problem Diagnosis Request

When diagnosing production issues:

#### Investigation Process
1. **Symptoms**: What's observed
2. **Logs Analysis**: Error messages and stack traces
3. **Hypothesis**: Possible causes
4. **Verification**: How to confirm
5. **Solution**: Fix and prevention

**Output Format:**
```
## Issue Diagnosis

### Symptoms
- OutOfMemoryError in production
- Occurs during peak hours
- Heap dump shows large ArrayList

### Log Analysis
```
java.lang.OutOfMemoryError: Java heap space
  at ArrayList.grow()
  at OrderService.exportAllOrders()
```

### Root Cause
**Memory leak due to unbounded result set**

The `exportAllOrders()` method loads all orders into memory:
```java
// Problematic code
public List<Order> exportAllOrders() {
    return orderRepository.findAll(); // Loads 1M+ records
}
```

### Solution

#### Immediate Fix (Production)
Increase heap size temporarily:
```
-Xmx4g -Xms4g
```

#### Proper Fix (Code)
Use pagination and streaming:
```java
public void exportAllOrders(OutputStream output) {
    int pageSize = 1000;
    int page = 0;
    
    Page<Order> orderPage;
    do {
        orderPage = orderRepository.findAll(
            PageRequest.of(page++, pageSize)
        );
        
        writeToStream(orderPage.getContent(), output);
        
    } while (orderPage.hasNext());
}
```

### Prevention
1. Add max result size limit
2. Use streaming for large datasets
3. Implement pagination for exports
4. Add memory monitoring alerts

### Monitoring
```java
@Scheduled(fixedRate = 60000)
public void checkMemoryUsage() {
    MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
    long used = memoryBean.getHeapMemoryUsage().getUsed();
    long max = memoryBean.getHeapMemoryUsage().getMax();
    
    if (used > max * 0.8) {
        log.warn("High memory usage: {}%", (used * 100 / max));
    }
}
```
```
