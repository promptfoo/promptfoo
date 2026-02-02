#!/usr/bin/env bash
# Determine whether to do incremental or full review based on event context
# Outputs: scope, base_sha, head_sha to GITHUB_OUTPUT
#
# Required environment variables:
#   EVENT_ACTION    - GitHub event action (opened, synchronize, ready_for_review)
#   EVENT_BEFORE    - SHA before synchronize event
#   EVENT_AFTER     - SHA after synchronize event
#   PR_BASE_SHA     - PR base branch SHA
#   PR_HEAD_SHA     - PR head SHA
#   GITHUB_OUTPUT   - GitHub Actions output file

set -euo pipefail

# Validate SHA format (40 hex chars, not null SHA) and verify it exists
is_valid_sha() {
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] &&
    [[ "$sha" != "0000000000000000000000000000000000000000" ]] &&
    git rev-parse --verify "$sha^{commit}" >/dev/null 2>&1
}

# Check if a commit is a merge commit (has 2+ parents)
# Used to detect "merge main into branch" which should trigger full review
is_merge_commit() {
  local sha="$1"
  git rev-parse --verify "$sha^2" >/dev/null 2>&1
}

# For synchronize events with valid SHAs and no merge commits, do incremental review
# Merge commits (e.g., merging main into branch) trigger full review to avoid
# reviewing main branch changes that aren't part of this PR
if [ "$EVENT_ACTION" = "synchronize" ] &&
  is_valid_sha "$EVENT_BEFORE" &&
  is_valid_sha "$EVENT_AFTER" &&
  ! is_merge_commit "$EVENT_AFTER"; then
  {
    echo "scope=incremental"
    echo "base_sha=$EVENT_BEFORE"
    echo "head_sha=$EVENT_AFTER"
  } >>"$GITHUB_OUTPUT"
else
  # Full review for: opened, ready_for_review, force push, or merge commits
  {
    echo "scope=full"
    echo "base_sha=$PR_BASE_SHA"
    echo "head_sha=$PR_HEAD_SHA"
  } >>"$GITHUB_OUTPUT"
fi
