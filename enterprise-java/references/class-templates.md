## Code Generation Standards

### Standard Class Template

```java
package com.example.{module}.{layer};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.{Annotation};
import org.springframework.transaction.annotation.Transactional;

/**
 * {Class purpose and responsibility}
 *
 * <p>Key features:
 * <ul>
 *   <li>Feature 1</li>
 *   <li>Feature 2</li>
 * </ul>
 *
 * @author Enterprise Java Developer
 * @since {Version}
 */
@Slf4j
@RequiredArgsConstructor
@{Annotation}
public class {ClassName} {
    
    private final Dependency dependency;
    
    /**
     * {Method purpose}
     *
     * @param param parameter description
     * @return return value description
     * @throws BusinessException when business rules violated
     */
    @Transactional(rollbackFor = Exception.class)
    public Result methodName(Param param) {
        log.info("Method started, param: {}", param);
        
        try {
            // 1. Validate input
            validateParam(param);
            
            // 2. Execute business logic
            Result result = executeBusinessLogic(param);
            
            // 3. Return result
            log.info("Method completed successfully");
            return result;
            
        } catch (BusinessException e) {
            log.error("Business error: {}", e.getMessage(), e);
            throw e;
        } catch (Exception e) {
            log.error("System error occurred", e);
            throw new SystemException("Unexpected error", e);
        }
    }
    
    private void validateParam(Param param) {
        if (param == null) {
            throw new IllegalArgumentException("Param cannot be null");
        }
        // Additional validations...
    }
    
    private Result executeBusinessLogic(Param param) {
        // Implementation...
        return new Result();
    }
}
```

### Layered Architecture Pattern

```
controller/    - HTTP endpoints, request/response handling
├── dto/       - Data Transfer Objects
└── vo/        - View Objects

service/       - Business logic, orchestration
├── impl/      - Service implementations

repository/    - Data access layer
├── entity/    - JPA entities
└── mapper/    - MyBatis mappers

domain/        - Domain models (DDD)
├── model/     - Domain objects
├── service/   - Domain services
└── event/     - Domain events

config/        - Configuration classes
exception/     - Custom exceptions
util/          - Utility classes
constant/      - Constants and enums
```
