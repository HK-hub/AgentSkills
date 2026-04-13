# Pagination & Rate Limiting Patterns

## Pagination Patterns

### Offset-Based Pagination (Simple)

```
GET /api/v1/posts?page=2&size=20

Pros: Simple, works with SQL LIMIT/OFFSET
Cons: Performance degrades with large offsets, inconsistent with concurrent writes

SQL: SELECT * FROM posts ORDER BY id LIMIT 20 OFFSET 20;
```

### Cursor-Based Pagination (Recommended for real-time feeds)

```
GET /api/v1/posts?cursor=post_123&limit=20

Pros: Consistent, efficient, works with real-time data
Cons: Cannot jump to arbitrary page

Response:
{
  "data": [...],
  "cursor": {
    "next": "post_143",
    "previous": "post_103"
  },
  "has_more": true
}

SQL: SELECT * FROM posts WHERE id > 'post_123' ORDER BY id LIMIT 20;
```

### Keyset Pagination (Best performance)

```
GET /api/v1/posts?after_id=123&after_created_at=2025-01-01T00:00:00Z&limit=20

Pros: Excellent performance, consistent
Cons: Requires indexed columns, more complex

SQL:
SELECT * FROM posts
WHERE (created_at, id) > ('2025-01-01', 123)
ORDER BY created_at, id
LIMIT 20;
```

---

## Rate Limiting Strategies

### Token Bucket Algorithm

```
Bucket capacity: 100 tokens
Refill rate: 10 tokens/second
Request cost: 1 token per request

Headers:
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1735689600

When exceeded:
HTTP 429 Too Many Requests
Retry-After: 60
```

### Implementation

```python
from redis import Redis
import time

redis = Redis()

def check_rate_limit(user_id, limit=100, window=60):
    key = f"rate_limit:{user_id}"
    current = time.time()

    # Remove old entries
    redis.zremrangebyscore(key, 0, current - window)

    # Count current requests
    count = redis.zcard(key)

    if count >= limit:
        return False, 0

    # Add current request
    redis.zadd(key, {str(current): current})
    redis.expire(key, window)

    remaining = limit - count - 1
    return True, remaining
```
