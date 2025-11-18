# Migration: Add Video Feed Indexes

## Purpose
This migration adds composite and individual indexes to optimize video feed queries that were failing with "Out of sort memory" errors on datasets with 3500+ records.

## Problem
The feed query with `moderationFilter=unmoderated` was causing MySQL to run out of sort buffer memory:
```
Error: Out of sort memory, consider increasing server sort buffer size
```

**Root causes:**
1. No index on `is_moderated` column - MySQL did full table scan on 3500+ records
2. Using `SKIP` + `ORDER BY` on large result sets (when most videos are unmoderated)
3. MySQL tried to sort all matching records in memory before applying SKIP and LIMIT
4. JOINs with `video_topics` table made it worse

## Solution
Added indexes for common filter combinations:
- `idx_feed_filters`: Composite index on `(is_moderated, is_adult_content, cefr_level, speech_speed)`
- `idx_speech_speed`: Individual index on `speech_speed`
- `idx_adult_content`: Individual index on `is_adult_content`
- `idx_moderated`: Individual index on `is_moderated`

## How to Apply

### Option 1: Using Prisma (if you have shadow database access)
```bash
npx prisma migrate deploy
```

### Option 2: Manual SQL (for production without shadow DB)
```bash
mysql -u username -p database_name < prisma/migrations/20251118_add_video_feed_indexes/migration.sql
```

### Option 3: Via SQL client
Execute the SQL from `migration.sql` in your MySQL client.

## Expected Impact
- **Query time**: Reduced from ~2-5s to <100ms
- **Memory usage**: Significantly reduced (no more full table scans)
- **Scalability**: Will handle 50,000+ records without issues

## Code Changes
Also optimized `fetchRandomizedPool` in `videoLearning.service.ts`:

**Before (caused "Out of sort memory"):**
- Used `skip` + `orderBy` on full table
- MySQL sorted all 3500 records, then skipped N records, then took M records

**After (fast):**
1. Get min/max ID range using aggregate query (1 fast query)
2. Generate random ID in range
3. Fetch records with `id >= randomId` (uses PRIMARY KEY index, no sorting needed)
4. Load full data with JOIN only for selected IDs

This eliminates the need to sort large datasets and uses indexes efficiently.
