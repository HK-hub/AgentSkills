### 6. Data Migration Strategy

#### Online Migration (Zero Downtime)
```
Phase 1: Preparation
- Design target schema
- Write migration scripts
- Set up dual-write logic
- Test in staging

Phase 2: Backfill Historical Data
- Copy existing data from old DB to new DB
- Verify data integrity
- Monitor lag

Phase 3: Dual-Write
Application writes to BOTH old and new DB:

def create_user(data):
    # Write to old DB
    old_user = old_db.users.create(data)
    
    # Write to new DB
    try:
        new_user = new_db.users.create(transform(data))
    except Exception as e:
        log_error(e)
        # Continue - don't fail if new DB write fails
    
    return old_user

Phase 4: Sync & Validate
- Continuously sync changes from old to new
- Compare data periodically
- Fix inconsistencies

Phase 5: Cutover
- Switch reads to new DB (gradual rollout)
- Monitor error rates and performance
- Stop writes to old DB
- Final sync
- Rollback plan ready

Phase 6: Cleanup
- Remove dual-write logic
- Decommission old DB (after retention period)
```

#### CDC (Change Data Capture)
```
Tools: Debezium, Maxwell, Canal, AWS DMS

How it works:
1. CDC tool reads database transaction log (binlog in MySQL)
2. Streams changes to Kafka or other message queue
3. Consumer applies changes to target database

Pros:
✅ Low latency (near real-time)
✅ No code changes in application
✅ Can replay from any point in time

Cons:
❌ Requires access to transaction log
❌ Additional infrastructure (Kafka, etc.)
❌ Schema changes need careful handling
```

### 7. Backup & Recovery

#### Backup Strategy (3-2-1 Rule)
```
3 copies of data:
  - Production database
  - Local backup
  - Remote backup

2 different media:
  - Disk
  - Tape or cloud storage

1 offsite copy:
  - Different datacenter or cloud region
```

#### Backup Schedule
```
Full Backup:
  - Frequency: Weekly (Sunday 2 AM)
  - Retention: 4 weeks
  - Method: mysqldump or xtrabackup

Incremental Backup:
  - Frequency: Every 6 hours
  - Retention: 7 days
  - Method: Binary log backup

Transaction Log Backup:
  - Frequency: Every 15 minutes
  - Retention: 7 days
  - Enables point-in-time recovery
```

#### Point-in-Time Recovery (PITR)
```bash
# Restore full backup
mysql < full_backup_sunday.sql

# Apply incremental backups
mysql < incremental_monday.sql
mysql < incremental_tuesday.sql

# Apply transaction logs up to specific time
mysqlbinlog --stop-datetime="2025-01-15 14:30:00" \
  binlog.000001 binlog.000002 | mysql

# Result: Database restored to 2025-01-15 14:30:00
```

#### Disaster Recovery
```
RTO (Recovery Time Objective): 
  How long can you be down?
  - 4 hours RTO = Need hot standby or quick restore

RPO (Recovery Point Objective):
  How much data loss is acceptable?
  - 1 hour RPO = Need backups every hour or replication

Strategies by RTO/RPO:
1. RTO: Minutes, RPO: Seconds
   → Active-Active multi-region with synchronous replication

2. RTO: 1 hour, RPO: 5 minutes  
   → Active-Passive with async replication + automated failover

3. RTO: 4 hours, RPO: 1 hour
   → Regular backups + manual restore procedure

4. RTO: 24 hours, RPO: 24 hours
   → Daily backups
```
