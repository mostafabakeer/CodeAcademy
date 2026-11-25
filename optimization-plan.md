# CodeAcademy Backend Optimization Plan

## Overview
This plan identifies key bottlenecks in the CodeAcademy platform and proposes optimizations to reduce backend load while maintaining full functionality. The focus is on Supabase query efficiency, caching strategies, and data flow optimization.

## Key Bottlenecks Identified

### 1. **Bootstrap Data Loading** (High Impact)
- **Problem**: Current bootstrap loads ALL content on every page load, even when unchanged
- **Current TTL**: 30 minutes (BOOTSTRAP_TTL), but caching is per-user with in-flight deduplication
- **Optimization**: 
  - Server-side content versioning (already implemented via CONTENT_VERSION)
  - Client-side stale-while-revalidate pattern (partially implemented)
  - Need: Incremental content loading instead of full bootstrap

### 2. **Admin Dashboard Stats** (High Impact)
- **Problem**: `adminStats()` makes 8 separate count queries OR falls back to RPC
- **Current**: 
  - RPC `admin_dashboard_stats` (preferred, single query)
  - Fallback: 8 parallel count queries (`users`, `courses`, `lessons`, `exams`, `notes`, `code_files`)
- **Optimization**: 
  - Ensure RPC `admin_dashboard_stats` is always available
  - Add caching layer for admin stats with 1-minute TTL
  - Cache the RPC result to avoid re-computation

### 3. **Student Stats Computation** (Medium-High Impact)
- **Problem**: `computeStudentStats()` makes N+5 queries per student (1 per student × 5 data types)
- **Current**: 
  - `listResultsByUser(userId)` - 1 query
  - `listProgressByUser(userId)` - 1 query  
  - `listLessonIdsAndDurations(grade)` - 1 query
  - `countExamsByGrade(grade)` - 1 query
  - `getLevels()` - 1 query (cached 60s)
- **Optimization**: 
  - Use `computeStudentStatsBatch()` for multiple students (reduces to ~5 queries total)
  - Cache levels data more aggressively
  - Pre-compute exam stats in batch operations

### 4. **Progress Merge Operations** (Medium Impact)
- **Problem**: `mergeProgressBatch()` makes 2 queries per batch + 1 upsert
- **Current**: 
  - `sb.from('lessons').select('id,duration').in('id', lessonIds)` - 1 query
  - `sb.from('progress').select('*').eq('user_id', userId).in('lesson_id', lessonIds)` - 1 query
  - `sb.from('progress').upsert(rows)` - 1 upsert
- **Optimization**: 
  - Batch progress updates more aggressively
  - Cache lesson durations to avoid repeated queries
  - Use in-memory tracking for recent updates

### 5. **Exam Leaderboards** (Medium Impact)
- **Problem**: `listExamLeaderboards()` uses RPC or legacy fallback with N queries
- **Current**: 
  - RPC `exam_top3_leaderboards` (preferred, single query)
  - Legacy fallback: 1 exams query + 1 exam_results query + memory aggregation
- **Optimization**: 
  - Ensure RPC is properly migrated and always available
  - Cache leaderboard results with 1-minute TTL
  - Add Redis-like caching if available

### 6. **Content Bootstrap Caching** (Medium Impact)
- **Problem**: Per-user localStorage + memory cache, but no server-side incremental updates
- **Current**: 
  - `BOOTSTRAP_TTL = 30 minutes`
  - `MEMORY_CACHE_TTL = 30 minutes`
  - In-flight request deduplication
- **Optimization**: 
  - Server-side content version tracking
  - Client-side selective content re-fetch on visibility change
  - Implement "diff" approach: only fetch changed content since last version

### 7. **Password Reset Diagnostics** (Low Impact)
- **Problem**: `getPasswordResetDiagnostics()` makes 3+ queries
- **Current**: 
  - Single RPC `password_reset_diagnostics`
  - Fallback: count + status aggregation + unmatched counter
- **Optimization**: 
  - Keep RPC as primary, ensure it's always functional
  - Cache results with 1-minute TTL

## Specific Optimization Recommendations

### A. **Server-Side Caching Layer**
Add Redis or Supabase `app_config`-based caching for:
- Content version hashes
- Admin statistics (1-minute TTL)
- Level configurations (already cached 60s)
- Leaderboard results (1-minute TTL)

### B. **Query Optimization Patterns**

1. **Selective Projection**: Always select only needed columns (already done in most places)
   - Example: `select('id,full_name,phone,grade,role,subscription,blocked,created_at')` instead of `select('*')`

2. **Batch Operations**: Group multiple operations into single queries
   - `computeStudentStatsBatch()` already implements this pattern
   - Apply similar pattern to other N+1 query scenarios

3. **RPC Centralization**: Move complex aggregations to Supabase RPCs
   - `admin_dashboard_stats` - use instead of 8 queries
   - `exam_top3_leaderboards` - use instead of legacy fallback
   - `password_reset_diagnostics` - use instead of 3 queries

4. **Incremental Content Loading**: Instead of full bootstrap on every load
   - Track content version on server
   - Client requests only diff since last version
   - Server returns only changed/added content

### C. **Frontend-Backend Coordination**

1. **Bootstrap Versioning** (Already partially implemented):
   - Server increments `CONTENT_VERSION` when content changes
   - Client sends `?v=` query parameter on bootstrap requests
   - Server responds with `notModified` if version unchanged
   - **Need**: Ensure this is wired up in admin mutation handlers

2. **Stale-While-Revalidate**:
   - Display cached data immediately
   - Background refresh without blocking UI
   - Show "updating" indicator if refresh fails
   - **Current**: Partially implemented in `useBootstrapData`

3. **Progress Web Sync**:
   - Client sends only delta changes (new watch time)
   - Server merges with existing progress
   - Avoids full progress re-fetch on every interaction

### D. **Database-Level Optimizations**

1. **Add Proper Indexes**: Ensure all frequently-filtered columns have indexes
   - `users(phone)` - already unique index
   - `progress(user_id, lesson_id)` - primary key covers this
   - `exam_results(user_id, exam_id)` - primary key covers this
   - `code_files(user_id)` - index exists
   - `lessons(course_id, grade)` - index exists

2. **Connection Pooling**: Supabase handles this, but ensure:
   - Not opening too many concurrent connections per user
   - Using single-flight pattern for repeated requests (already in `api.ts` for session refresh)

### E. **Monitoring & Analytics**

Add logging for:
- Slow queries (>100ms)
- Cache miss rates
- RPC fallback usage
- Bootstrap version change frequency
- Progress merge operation frequency

## Implementation Priority

### Phase 1 (Immediate - 1-2 weeks)
1. ✅ Ensure `admin_dashboard_stats` RPC is functional and cached
2. ✅ Add 1-minute TTL cache for level configurations (`getLevels()`)
3. ✅ Verify `exam_top3_leaderboards` RPC is always preferred over legacy
4. ✅ Add content version tracking on admin mutations (already partially done)

### Phase 2 (Short-term - 2-4 weeks)
1. 📋 Implement `computeStudentStatsBatch()` for admin screens
2. 📋 Add server-side content version diff endpoint
3. 📋 Implement stale-while-revalidate pattern fully in `useBootstrapData`
4. 📋 Add request timing middleware for performance monitoring

### Phase 3 (Medium-term - 1-3 months)
1. 📋 Implement Redis or Supabase-based distributed caching
2. 📋 Add incremental content loading (diff-based bootstrap)
3. 📋 Optimize progress tracking with delta sync
4. 📋 Add comprehensive query performance monitoring

### Phase 4 (Long-term - 3-6 months)
1. 📋 Migrate to edge functions for frequently-requested data
2. 📋 Implement GraphQL or tRPC for precise data fetching
3. 📋 Add query plan analysis and index optimization
4. 📋 Consider database sharding for scale