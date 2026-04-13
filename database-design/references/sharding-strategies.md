### 4. Sharding Strategies

#### Hash-Based Sharding
```python
# Simple modulo sharding
def get_shard(user_id, num_shards=8):
    return user_id % num_shards

# Example: user_id = 12345, num_shards = 8
shard_id = 12345 % 8 = 1
table_name = f"users_{shard_id}"  # users_1

Pros:
✅ Even distribution
✅ Simple to implement

Cons:
❌ Hard to reshard (add/remove shards)
❌ No range queries across all data
❌ Data must be redistributed when shard count changes
```

#### Range-Based Sharding
```python
# Shard by ID range
def get_shard(user_id):
    if user_id < 1000000:
        return 0
    elif user_id < 2000000:
        return 1
    elif user_id < 3000000:
        return 2
    # ...

Pros:
✅ Easy to add new shards (next range)
✅ Range queries within a shard

Cons:
❌ Uneven distribution (hot shards)
❌ Newer data gets more traffic (last shard is hot)
```

#### Consistent Hashing
```python
# Used in distributed caching (Redis, Memcached)
import hashlib

def consistent_hash(key, num_shards=8, num_virtual_nodes=150):
    # Create ring with virtual nodes
    ring = []
    for shard_id in range(num_shards):
        for v in range(num_virtual_nodes):
            hash_value = int(hashlib.md5(f"{shard_id}:{v}".encode()).hexdigest(), 16)
            ring.append((hash_value, shard_id))
    ring.sort()
    
    # Find shard for key
    key_hash = int(hashlib.md5(key.encode()).hexdigest(), 16)
    for hash_value, shard_id in ring:
        if key_hash <= hash_value:
            return shard_id
    return ring[0][1]

Pros:
✅ Minimal data movement when adding/removing shards
✅ Even distribution with virtual nodes

Cons:
❌ More complex implementation
❌ No range queries
```

#### Geographic Sharding
```python
def get_shard(user_id, region):
    return {
        'us-east': 0,
        'us-west': 1,
        'eu-west': 2,
        'ap-southeast': 3,
    }.get(region)

Pros:
✅ Data locality (low latency)
✅ Compliance with data residency laws
✅ Fault isolation

Cons:
❌ Uneven distribution by region
❌ Cross-region queries are expensive
```

#### Challenges with Sharding
```
1. Cross-Shard Queries
   Problem: Query needs data from multiple shards
   Solutions:
   - Denormalize data to co-locate related data
   - Use application-level joins (scatter-gather)
   - Materialize views for common joins
   - Use a search engine (Elasticsearch) for cross-shard search

2. Distributed Transactions
   Problem: Transaction spans multiple shards
   Solutions:
   - Avoid distributed transactions (redesign to single shard)
   - Use eventual consistency
   - Implement SAGA pattern
   - Use 2PC (slow, blocking) only if necessary

3. Auto-Increment IDs
   Problem: Each shard generates IDs independently (collisions)
   Solutions:
   - UUID (globally unique, but not sequential)
   - Snowflake ID (Twitter's solution: timestamp + machine ID + sequence)
   - Database sequence with offset (shard 0: 0,8,16..., shard 1: 1,9,17...)

4. Joins
   Problem: JOINs across shards are expensive
   Solutions:
   - Denormalize data
   - Use application-level joins
   - Design schema to avoid cross-shard joins
   - Keep related data in same shard (co-location)
```
