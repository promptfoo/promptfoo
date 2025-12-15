# GitHub Comment for Issue #1013

---

Hey @pchuri, thanks for filing this one - it's a real concern for teams doing collaborative reviews.

Good news: the core issue you described has been addressed. When you filed this, the rating handler was sending the entire table on every save, which meant concurrent edits would stomp on each other. We've since moved to a v4 data model where ratings hit a dedicated endpoint (`POST /eval/:evalId/results/:id/rating`) that only updates the specific result being modified. Two people rating different rows no longer interfere with each other.

The v4 approach has been the default for a while now, so if you're running a recent version you should already have this fix.

There's still a theoretical edge case where two people rate the *exact same* result at the same instant - in that scenario the second write wins. In practice this seems rare enough that we haven't seen reports of it happening, but if it becomes a problem we can add optimistic locking.

Real-time sync (where you'd see other people's ratings appear without refreshing) would be a nice enhancement for heavier collaborative workflows. That's a bigger lift though - would need WebSocket broadcasts and client-side state reconciliation. If there's interest we could track that separately.

Going to close this one out, but feel free to reopen if you're still hitting issues or if the real-time sync idea is something you'd find valuable.
