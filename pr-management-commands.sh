#!/bin/bash

# PR Management Commands using GitHub CLI

# Set PAGER to avoid issues
export PAGER=cat

# 1. List PRs ready for review (no conflicts, not draft)
echo "=== PRs Ready for Review ==="
gh pr list --state open --json number,title,isDraft,mergeable,mergeStateStatus,reviewDecision | \
  jq -r '.[] | select(.isDraft == false and .mergeable == "MERGEABLE" and .mergeStateStatus == "BEHIND") | 
  "#\(.number) - \(.title)"'

# 2. Check which PRs have all CI checks passing
echo -e "\n=== Checking CI Status for Non-Draft PRs ==="
for pr in $(gh pr list --state open --json number,isDraft | jq -r '.[] | select(.isDraft == false) | .number'); do
  echo -n "PR #$pr: "
  if gh pr checks $pr | grep -q "FAIL\|PENDING"; then
    echo "❌ Has failing or pending checks"
  else
    echo "✅ All checks passing"
  fi
done

# 3. Request review for a specific PR
# Usage: gh pr review <PR_NUMBER> --request-reviewer <USERNAME>

# 4. Merge a PR after approval
# Usage: gh pr merge <PR_NUMBER> --merge

# 5. Update PR branch with main
# Usage: gh pr comment <PR_NUMBER> --body "@dependabot rebase" 
# Or manually: gh pr checkout <PR_NUMBER> && git pull origin main && git push

# 6. Get detailed PR info including reviews
# gh pr view <PR_NUMBER> --json reviews,reviewRequests,reviewDecision

# 7. List PRs with conflicts
echo -e "\n=== PRs with Merge Conflicts ==="
gh pr list --state open --json number,title,mergeable | \
  jq -r '.[] | select(.mergeable == "CONFLICTING") | "#\(.number) - \(.title)"'

# 8. List draft PRs
echo -e "\n=== Draft PRs ==="
gh pr list --state open --json number,title,isDraft | \
  jq -r '.[] | select(.isDraft == true) | "#\(.number) - \(.title)"'

# 9. List PRs by age (oldest first)
echo -e "\n=== Oldest PRs (consider reviewing) ==="
gh pr list --state open --json number,title,createdAt | \
  jq -r 'sort_by(.createdAt) | .[:5] | .[] | "#\(.number) - \(.title) (created: \(.createdAt | split("T")[0]))"' 