### 5. Query Optimization Process

#### Step 1: Identify Slow Queries
```sql
-- Enable slow query log (MySQL)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- Log queries > 1 second
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

-- Find slow queries (PostgreSQL)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### Step 2: Analyze with EXPLAIN
```sql
EXPLAIN SELECT u.username, COUNT(o.order_id) as order_count
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
WHERE u.status = 1
GROUP BY u.user_id
ORDER BY order_count DESC
LIMIT 10;

Key things to look for:
1. type: 
   - ALL = full table scan (bad)
   - index = index scan (ok)
   - range = range scan (good)
   - ref = non-unique index lookup (good)
   - eq_ref = unique index lookup (excellent)
   - const = constant lookup (excellent)

2. rows: 
   - High number = many rows scanned (optimize)

3. Extra:
   - "Using filesort" = Expensive sort operation (add index for ORDER BY)
   - "Using temporary" = Temp table created (optimize GROUP BY)
   - "Using where" = Filter applied after reading rows (ok)
   - "Using index" = Covering index (excellent)
   - "Using index condition" = Index pushdown (good)
```

#### Step 3: Optimize
```sql
-- Before: Full table scan
EXPLAIN SELECT * FROM orders WHERE status = 1 ORDER BY created_at DESC LIMIT 10;
-- type: ALL, rows: 1,000,000

-- After: Add index
CREATE INDEX idx_status_created ON orders(status, created_at DESC);
-- type: ref, rows: 10

-- Before: Filesort
EXPLAIN SELECT * FROM orders WHERE user_id = 123 ORDER BY created_at DESC;
-- Extra: Using filesort

-- After: Include ORDER BY column in index
CREATE INDEX idx_user_created ON orders(user_id, created_at DESC);
-- Extra: Using index

-- Before: Correlated subquery (executes for each row)
SELECT u.username,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) as order_count
FROM users u;

-- After: Use JOIN
SELECT u.username, COUNT(o.order_id) as order_count
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
GROUP BY u.user_id;
```
