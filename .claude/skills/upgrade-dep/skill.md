---
name: upgrade-dep
description: Review dependency upgrade PRs for breaking changes, new features, and testing
---

# Dependency Upgrade Review

You are reviewing a dependency upgrade PR to ensure it's safe, beneficial, and properly tested.

## Inputs

- PR URL (required): GitHub PR link
- OR detect from current git branch if working in a PR branch

## Workflow

### 1. Fetch PR Context

- Use GitHub tools to get PR details
- Extract:
  - Dependency name(s) being upgraded
  - Old version → New version
  - Is it direct or dev dependency? (check package.json)
  - PR description for any context
  - **CI status** - Check immediately to see if there are any failing checks

### 2. Gather Release Information

For EACH upgraded dependency:

- Construct changelog URL (try common patterns):
  - `https://github.com/{owner}/{repo}/blob/main/CHANGELOG.md`
  - `https://github.com/{owner}/{repo}/releases`
  - Check package.json "homepage" or "repository" fields
- Use WebFetch to get release notes between old and new versions
- If changelog isn't available, search for "breaking changes", "migration", "upgrade guide"

### 3. Analyze Our Usage

- Use Grep to find ALL imports/usage of the dependency:
  - `import ... from '<package>'`
  - `require('<package>')`
  - `from '<package>' import`
- For each usage location, use Read to examine the code
- Document:
  - Which files use it
  - What APIs/exports we're using
  - How critical is each usage (core functionality vs optional)

### 4. Impact Analysis

Create a structured analysis:

#### Breaking Changes

- List each breaking change from release notes
- For each breaking change:
  - Does it affect our code? (cross-reference with usage)
  - If yes: What needs to change?
  - If no: Document why we're not affected

#### New Features & Improvement Opportunities

- List ALL new features/APIs added in the upgrade
- For EACH feature, analyze deeply:
  - **Concrete benefit**: How would this improve our codebase? (performance, reliability, UX, DX)
  - **Implementation strategy**: Specific files/functions to modify
  - **New capabilities unlocked**: What can we build now that we couldn't before?
  - **Configuration additions**: New config properties/options we should expose to users
  - **Breaking vs additive**: Can we adopt incrementally or does it require refactoring?

**Be proactive and creative:**

- Don't just note features exist - propose HOW to use them
- Suggest new provider capabilities we could add
- Identify opportunities to simplify existing code
- Think about what users would want that we couldn't do before
- Propose specific config schema additions (with examples)

#### Deprecations

- List any deprecation warnings
- Check if we use deprecated APIs
- Note when they'll be removed

#### Bug Fixes

- List notable bug fixes
- Check if any fix issues we've worked around
- Identify workarounds we can remove

#### Security Fixes

- Highlight any CVEs or security patches
- Note severity if mentioned

### 5. Create Test Plan

Based on usage analysis, create a specific test plan:

#### Unit Tests

- List specific test files to run based on usage locations
- Example: `npx vitest src/providers/__tests__/openai.test.ts`

#### Integration Tests

- Identify integration tests that exercise the dependency
- Example: `npm run test:integration`

#### Manual Testing

- Create step-by-step manual test scenarios
- Focus on areas touched by breaking changes
- Include edge cases

#### Build Verification

- `npm run build` - must pass
- `npm run tsc` - type check
- `npm run lint` - linting

### 6. Execute Tests

- Run each test from the test plan
- Document results (pass/fail/errors)
- If failures occur:
  - Analyze the error
  - Determine if it's related to the upgrade
  - Suggest fixes if needed

### 6.5. Verify CI Status

**CRITICAL: CI must be passing before recommending approval.**

- Check PR CI status using GitHub tools: `pull_request_read` with `method: 'get_status'`
- Document ALL CI check results:
  - ✅ Passing checks
  - ⏳ In-progress checks (wait for completion if reasonable)
  - ❌ Failing checks (investigate and fix)
  - 🚫 Blocked/Pending checks (not yet started)

**Handling Different CI States:**

- **All Passing (✅)**: Can recommend APPROVE if everything else looks good
- **In Progress (⏳)**: Note "Pending CI completion" in recommendation
- **Failed (❌)**:
  - Identify which check failed (e.g., "Unit Tests", "Integration Tests", "Lint")
  - Use `pull_request_read` with `method: 'get_files'` to see what changed
  - Correlate failures with dependency changes
  - Run the same tests locally to reproduce
  - Propose fixes for CI failures
  - **DO NOT recommend APPROVE**
- **Not Started/Blocked (🚫)**:
  - Note that CI hasn't run yet
  - Explain that approval is pending CI execution
  - Recommend: "⏳ PENDING CI - Review again after CI runs"

**Rule: NEVER recommend APPROVE with failing or blocked CI checks.**

### 7. Code Changes (if needed)

If breaking changes require fixes OR beneficial new features should be adopted:

- Create a clear todo list of changes needed
- Make changes one at a time
- Re-run relevant tests after each change
- DO NOT make changes unless:
  - Required for breaking changes, OR
  - User explicitly approves adopting new features

### 8. Generate Summary

Create a comprehensive summary with the following structure:

````markdown
## Dependency Upgrade Review: <package-name>

**Version:** `<old>` → `<new>`

### Changes Summary

- X breaking changes (Y affecting us)
- X new features (Y applicable to us)
- X bug fixes
- X security fixes

### Impact on Our Codebase

<detailed analysis of current usage>

### Breaking Changes

<each breaking change with impact analysis>

### Proposed Enhancements (NEW FEATURES TO BUILD)

For each new feature that unlocks capabilities:

#### Enhancement 1: <Descriptive Name>

**What it enables:** <Clear explanation of the new capability>
**Why we should add it:** <Business/technical value>
**Implementation approach:**

- File(s) to modify: `path/to/file.ts:line-range`
- New config properties:
  ```typescript
  {
    new_option?: boolean;  // Description of what this does
    new_setting?: string;  // How users would use this
  }
  ```
````

- Code changes: <Specific functions/methods to update>
- Estimated complexity: <Simple/Medium/Complex>
- Backward compatibility: <Yes/No + migration notes if needed>

**Example usage:**

```yaml
providers:
  - id: my-provider
    config:
      new_option: true
      new_setting: 'example'
```

<Repeat for each meaningful enhancement>

### Test Results

#### Local Tests

✅ Unit tests: X/Y passed
✅ Integration tests: passed
✅ Build: successful
✅ Linting: passed
✅ Type checking: passed

#### CI Status (CRITICAL)

<List each CI check with status>
✅ CI Check Name 1: Passing
✅ CI Check Name 2: Passing
⏳ CI Check Name 3: In Progress
❌ CI Check Name 4: Failed (with explanation)

**Overall CI Status:** <✅ All Passing / ⏳ Pending / ❌ Failing>

### Recommendation

<APPROVE / APPROVE WITH CHANGES / REQUEST CHANGES / PENDING CI>

**CI Requirements:**

- If all CI passing: Can recommend APPROVE
- If CI pending: Recommend "PENDING CI" - wait for completion
- If CI failing: Recommend "REQUEST CHANGES" or "APPROVE WITH CHANGES" with fixes

### Required Changes (Breaking Changes Only)

<list of code changes needed to fix breaking changes>
```

## Important Notes

- **CI STATUS IS CRITICAL** - Never recommend APPROVE with failing CI
- ALWAYS check CI status before making a recommendation
- ALWAYS use `--no-cache` when running evaluations during testing
- NEVER assume a feature is irrelevant - check our actual usage
- If changelog is unclear, use WebSearch to find migration guides
- Document everything thoroughly - this review will be referenced later
- If tests fail, investigate thoroughly before suggesting changes
- **Be proactive about enhancements** - think like a product engineer, not just a reviewer
- Propose concrete, actionable improvements with code examples
- Consider what competitors might do with these new features
- Think about user pain points the new features could solve
- When CI fails, reproduce locally and propose specific fixes

## Output

**DO NOT automatically post to the PR.**

Instead:

1. Present the complete summary to the user in the chat
2. Ask if they want you to post it as a PR comment
3. Ask if they want you to implement any of the proposed enhancements
4. Only post to PR if explicitly approved by the user

**Be helpful but not presumptuous** - the user should decide what action to take.
