# Issue #1013: Concurrent Editing Analysis

## Executive Summary

**The primary issue described in #1013 has already been fixed.** The complaint was about "sending the entire table for updates" - this was the version 3 behavior. Version 4+ (current) already implements partial updates that only modify the specific result being rated.

The remaining theoretical issues are edge cases with low probability and limited impact. This document analyzes whether additional work is warranted.

---

## Issue Background

**Original complaint:**

> Multiple users concurrently editing evaluations in PromptFoo WebUI causes data overwrites due to the handleRating function sending the entire table for updates.

**Proposed solutions in issue:**

1. Partial Updates ← **ALREADY IMPLEMENTED** (v4+)
2. Optimistic Locking ← Not implemented

---

## Current State (Version 4+)

### What's Fixed

When a user rates a result, the client sends a POST to `/eval/:evalId/results/:id/rating` with **only** the `gradingResult` for that specific result:

```typescript
// src/app/src/pages/eval/components/ResultsTable.tsx:414-421
if (version && version >= 4) {
  response = await callApi(`/eval/${evalId}/results/${resultId}/rating`, {
    method: 'POST',
    body: JSON.stringify({ ...gradingResult }), // Only this result's data
  });
}
```

The server updates only that specific `EvalResult` record in the database. **Two users rating different results will NOT overwrite each other's work.**

### What's Theoretically Still At Risk

| Issue            | Description                                               | Probability | Impact                                     |
| ---------------- | --------------------------------------------------------- | ----------- | ------------------------------------------ |
| Same-result race | Two users rate the exact same result within milliseconds  | Very Low    | Medium - one rating lost                   |
| Metrics race     | Two concurrent ratings corrupt aggregate pass/fail counts | Low         | Low - off by 1, self-corrects on page load |
| Stale UI         | User doesn't see another user's rating until refresh      | Common      | Low - UX issue, not data loss              |

---

## Critical Analysis: Do We Need More Work?

### Same-Result Race Condition

**Scenario:** User A and User B both click thumbs-up on result #47 at the exact same moment.

**Reality check:**

- In a table of 100+ results, the probability of two users clicking on the _same_ result within the ~50ms database write window is extremely low
- Even if it happens, "last write wins" is a valid semantic - the second user's rating is still correct from their perspective
- No data corruption occurs - one rating simply replaces the other

**Evidence this is a real problem:** None. Issue has 0 comments since filing. No user reports of lost ratings.

### Metrics Race Condition

**Scenario:** User A rates result X (fail→pass) while User B rates result Y (fail→pass). Both read metrics, both increment, second write overwrites first's increment.

**Reality check:**

- Requires exact timing overlap on rating submissions
- Both ratings must change pass/fail status (not just add comments)
- Impact is aggregate metrics off by 1 (e.g., showing 85% pass rate instead of 86%)
- Metrics are recalculated from source data on page load anyway

**Evidence this is a real problem:** None. No user reports of incorrect metrics.

### Stale UI

**Scenario:** User A rates something, User B doesn't see it until they refresh.

**Reality check:**

- This is standard web app behavior without real-time collaboration
- Not a "data overwrite" issue - it's a feature request for real-time sync
- Most users working asynchronously, not staring at same screen

**Evidence this is a real problem:** Not mentioned in issue #1013. Would be a separate feature request.

---

## Options

### Option A: Do Nothing (Recommended for now)

**Rationale:**

- Primary issue (full table overwrites) is already fixed
- Remaining edge cases are theoretical with no evidence of real-world impact
- Issue has been open since early 2024 with no follow-up complaints
- Engineering effort better spent on higher-impact issues

**Action:**

- Close issue #1013 as resolved (v4 partial updates)
- Add comment explaining what was fixed and remaining theoretical edge cases
- Create separate issue for "real-time collaboration" if that becomes a priority

### Option B: Minimal Defensive Fix

**If we want to be extra cautious without major complexity:**

Add optimistic locking for same-result conflicts only:

```typescript
// Server: Check if result was modified since client loaded it
if (expectedUpdatedAt && result.updatedAt > expectedUpdatedAt) {
  return res.status(409).json({
    error: 'conflict',
    message: 'This result was modified. Please refresh.',
    currentState: result,
  });
}
```

```typescript
// Client: Send expectedUpdatedAt, handle 409
if (response.status === 409) {
  showToast('Rating conflict - refreshing...', 'warning');
  await fetchEvalData(evalId);
}
```

**Effort:** ~2-4 hours
**Benefit:** Prevents the very rare same-result race condition
**Downside:** Adds code paths, error handling, edge case testing

### Option C: Full Real-Time Collaboration

**Not recommended unless explicitly requested:**

- WebSocket broadcast for all rating changes
- Client-side state reconciliation
- Conflict resolution UI
- Significant testing burden

**Effort:** 2-3 days
**Benefit:** Real-time collaboration experience
**Downside:** High complexity for low-priority feature

---

## Recommendation

**Close issue #1013 with explanation.** The core problem (sending entire table) is fixed. Remaining issues are theoretical edge cases with:

- No evidence of real-world impact
- No user complaints in 10+ months
- Low probability of occurrence
- Self-correcting behavior (metrics recalculate on reload)

If a user reports an actual concurrent editing problem, revisit with Option B.

---

## Appendix: Code References

| Component                       | File                                                 | Lines   |
| ------------------------------- | ---------------------------------------------------- | ------- |
| Client rating handler           | `src/app/src/pages/eval/components/ResultsTable.tsx` | 288-441 |
| Server rating endpoint          | `src/server/routes/eval.ts`                          | 548-616 |
| EvalResult model                | `src/models/evalResult.ts`                           | 61-359  |
| Database schema (has updatedAt) | `src/database/tables.ts`                             | 79-119  |
| Legacy PATCH endpoint (v3)      | `src/server/routes/eval.ts`                          | 116-131 |
