# Database Optimization Plan

## Current Issues

### 1. Large Base64 Data in JSON Columns
The `response` column in `eval_results` stores provider responses as JSON, which includes base64-encoded images and audio. This causes:
- Database bloat (multi-GB database files)
- Slow query performance
- High memory usage
- Poor cache efficiency

### 2. Inefficient Indexing Strategy
- Too many indexes on JSON field extractions
- Missing compound indexes for common query patterns
- Indexes on large JSON columns that may not be used effectively

### 3. Schema Design Issues
- Storing large binary data inline violates database normalization principles
- No separation between frequently accessed metadata and large payloads
- No data lifecycle management (archival, cleanup)

## Optimization Recommendations

### Phase 1: Immediate Improvements (Already Implemented)
✅ **Asset Storage System**
- Store images/audio as files on disk
- Reference assets by URL in database
- Automatic deduplication
- Migration tool for existing data

### Phase 2: Schema Optimization

#### 2.1 Remove Inefficient JSON Indexes
```sql
-- Remove indexes that are rarely used and expensive to maintain
DROP INDEX IF EXISTS eval_result_response_idx;
DROP INDEX IF EXISTS eval_result_test_case_vars_idx;
DROP INDEX IF EXISTS eval_result_named_scores_idx;
```

#### 2.2 Add Efficient Compound Indexes
```sql
-- For loading all results for an eval
CREATE INDEX eval_results_lookup_idx ON eval_results(evalId, promptIdx, testIdx);

-- For time-based queries
CREATE INDEX eval_results_updated_idx ON eval_results(updatedAt);

-- For filtering by success/failure
CREATE INDEX eval_results_success_idx ON eval_results(evalId, success);
```

#### 2.3 Separate Large Data
Consider creating a separate table for large responses:
```sql
CREATE TABLE eval_responses (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL REFERENCES eval_results(id),
  response_data TEXT, -- Large JSON data
  created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Phase 3: Data Lifecycle Management

#### 3.1 Archival Strategy
- Move old evaluations to archive tables after N days
- Compress archived data
- Store only summary statistics for very old data

#### 3.2 Cleanup Policies
```sql
-- Add cleanup metadata
ALTER TABLE evals ADD COLUMN archived_at INTEGER;
ALTER TABLE evals ADD COLUMN retention_days INTEGER DEFAULT 90;
```

#### 3.3 Partitioning Strategy
For very large deployments, consider:
- Monthly tables (eval_results_2024_01, etc.)
- Separate databases per time period
- Union views for querying across periods

## Implementation Plan

### Step 1: Measure Current Performance
```sql
-- Get database statistics
SELECT 
  name,
  COUNT(*) as row_count,
  SUM(LENGTH(response)) as total_response_size
FROM eval_results
GROUP BY evalId
ORDER BY total_response_size DESC
LIMIT 10;
```

### Step 2: Enable Asset Storage
1. Set `PROMPTFOO_USE_ASSET_STORAGE=true`
2. Run migration: `promptfoo assets migrate`
3. Monitor disk usage vs database size reduction

### Step 3: Index Optimization
1. Analyze query patterns with `EXPLAIN QUERY PLAN`
2. Drop unused indexes
3. Add compound indexes
4. Measure query performance improvement

### Step 4: Schema Refactoring (Optional)
Only if needed for large deployments:
1. Create new schema with separated tables
2. Migrate data in batches
3. Update application code
4. Switch over with minimal downtime

## Performance Targets

- **Query Performance**: 
  - Load eval results: < 100ms for 1000 results
  - Search by metadata: < 50ms
  
- **Storage Efficiency**:
  - Database size: < 10% of current size after migration
  - No single row > 1MB
  
- **Scalability**:
  - Support 1M+ evaluations
  - Support 100M+ results
  - Maintain performance with concurrent access

## Monitoring

Track these metrics:
1. Database file size growth rate
2. Query execution time (p50, p95, p99)
3. Memory usage during operations
4. I/O operations per second
5. Asset storage disk usage

## Best Practices Going Forward

1. **Never store binary data in SQLite**
   - Use file storage for images, audio, video
   - Store only references in database

2. **Design for data lifecycle**
   - Plan for archival from day one
   - Implement retention policies
   - Automate cleanup

3. **Index strategically**
   - Index based on actual query patterns
   - Avoid indexing large text/json columns
   - Use compound indexes for common filters

4. **Monitor and iterate**
   - Regular VACUUM operations
   - Analyze query performance
   - Adjust indexes based on usage