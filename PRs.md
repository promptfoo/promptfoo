# Pull Request Status Report

Generated: 2025-01-28T16:00:00Z

## Summary

This document provides an overview of open pull requests and their readiness for merging.

Total Open PRs: 46
- Ready for review: 6
- Has conflicts: 9  
- Draft PRs: 6
- Others: 25

## Criteria for Merge Readiness

- ✅ All CI checks passing
- ✅ No merge conflicts
- ✅ Has approvals (if required)
- ✅ No requested changes pending
- ✅ Not a draft PR

## Open Pull Requests

### Ready to Merge (Pending Review Only)

These PRs have all CI checks passing and no merge conflicts but need review approval:

1. **[#5067](https://github.com/promptfoo/promptfoo/pull/5067)** - feat: add max-score assertion for objective output selection
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~1 day ago

2. **[#5032](https://github.com/promptfoo/promptfoo/pull/5032)** - feat: Apply plugin modifiers for crescendo
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~4 days ago

3. **[#4975](https://github.com/promptfoo/promptfoo/pull/4975)** - feat: add CI package verification to prevent dependency misconfiguration
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~10 days ago

4. **[#4950](https://github.com/promptfoo/promptfoo/pull/4950)** - fix(import): resolve transaction promise error for better-sqlite3 compatibility
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~11 days ago

5. **[#4909](https://github.com/promptfoo/promptfoo/pull/4909)** - feat(webui): add cloud status indicator to navbar
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~14 days ago

6. **[#4872](https://github.com/promptfoo/promptfoo/pull/4872)** - feat(cli): add self-upgrade command
   - Status: All CI checks passing ✅
   - Mergeable: Yes ✅
   - Review Decision: REVIEW_REQUIRED ⏳
   - Created: ~16 days ago

### Needs Attention (Merge Conflicts)

These PRs have merge conflicts that need to be resolved:

- **[#5041](https://github.com/promptfoo/promptfoo/pull/5041)** - fix: Increased the number of characters for displaying test variables (CONFLICTING)
- **[#4997](https://github.com/promptfoo/promptfoo/pull/4997)** - fix(evaluator): comprehensive assertion property interpolation with file:// support (CONFLICTING)
- **[#4977](https://github.com/promptfoo/promptfoo/pull/4977)** - chore(webui): Metrics filtering improvements (CONFLICTING, Draft)
- **[#4902](https://github.com/promptfoo/promptfoo/pull/4902)** - feat: lazy load CLI command actions for improved startup performance (CONFLICTING)
- **[#4886](https://github.com/promptfoo/promptfoo/pull/4886)** - feat(export): add metadata to exported evaluation files (CONFLICTING)
- **[#4841](https://github.com/promptfoo/promptfoo/pull/4841)** - feat(test-cases): add xlsx/xls support as optional peer dependency (CONFLICTING)
- **[#4840](https://github.com/promptfoo/promptfoo/pull/4840)** - feat: add Microsoft Prompty file format support (CONFLICTING)
- **[#4797](https://github.com/promptfoo/promptfoo/pull/4797)** - chore: breakdown provider file, rename, etc (CONFLICTING, Draft)
- **[#4760](https://github.com/promptfoo/promptfoo/pull/4760)** - feat: add output handler support with file:// prefix and extension-based inference (CONFLICTING, Draft)

### Draft PRs

These are still work in progress:

- **[#5047](https://github.com/promptfoo/promptfoo/pull/5047)** - feat(webui): Eval Results Performance Tab (Draft)
- **[#4977](https://github.com/promptfoo/promptfoo/pull/4977)** - chore(webui): Metrics filtering improvements (Draft, CONFLICTING)
- **[#4876](https://github.com/promptfoo/promptfoo/pull/4876)** - chore(internals): Posthog key loading (Draft)
- **[#4797](https://github.com/promptfoo/promptfoo/pull/4797)** - chore: breakdown provider file, rename, etc (Draft, CONFLICTING)
- **[#4760](https://github.com/promptfoo/promptfoo/pull/4760)** - feat: add output handler support with file:// prefix and extension-based inference (Draft, CONFLICTING)

## Detailed Analysis

### Merge Recommendations

**Immediate merge candidates** (after review approval):
1. **#5067** - New feature (max-score assertion) with all checks passing
2. **#5032** - Feature enhancement for crescendo plugin
3. **#4975** - CI improvement for package verification
4. **#4950** - Bug fix for import/export functionality

**Next priority** (after review):
- **#4909** - UI enhancement (cloud status indicator)
- **#4872** - CLI enhancement (self-upgrade command)

### Action Items

1. **Request reviews** for the 6 PRs that are ready to merge
2. **Resolve conflicts** for the 9 PRs with merge conflicts
3. **Follow up** on draft PRs to see if they're ready for review
4. **Consider** the age of some PRs (e.g., #4288, #4251 from over a month ago)

## Commands to Check Individual PRs

```bash
# Check detailed status of a specific PR
gh pr view <PR_NUMBER> --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup

# Check CI status for a specific PR
gh pr checks <PR_NUMBER>

# Get list of requested reviewers
gh pr view <PR_NUMBER> --json reviewRequests
``` 