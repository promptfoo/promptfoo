# Old Open GitHub Issues Analysis

Generated: 2025-12-07

## Recently-Addressed Issues (PRs Open)

| Issue                                                 | Age      | Status               |
| ----------------------------------------------------- | -------- | -------------------- |
| **#1037** - Provider errors not displayed in webui    | Jun 2024 | ✅ **PR #6552 open** |
| **#2266** - Object variables become `[object Object]` | -        | ✅ **PR #6553 open** |

---

## High-Priority Solvable Issues

### 🐛 Bugs

| #         | Title                                                      | Age      | Notes                                                    |
| --------- | ---------------------------------------------------------- | -------- | -------------------------------------------------------- |
| **#1781** | evaluateOptions not working if filename != promptfooconfig | Sep 2024 | Clear repro, @eharris128 said they'd look but no PR      |
| **#1613** | File content not loaded in nested vars                     | Sep 2024 | `good-first-issue`, repro provided, volunteer interested |
| **#810**  | Markdown double-rendering on manual fail                   | May 2024 | Was fixed, regressed in v0.62.0                          |
| **#3797** | Truncated test name in CLI progress bar                    | Apr 2025 | `good-first-issue`, @adityabharadwaj198 has a fix        |

### 🌟 Good First Issues (Features)

| #         | Title                                           | Age      | Notes                                     |
| --------- | ----------------------------------------------- | -------- | ----------------------------------------- |
| **#1499** | Add permalink to test result in eval view       | Aug 2024 | Simple URL parameter feature              |
| **#1440** | Configure which vars show by default in results | Aug 2024 | Add config option for var visibility      |
| **#1431** | Allow caching when `repeat > 1`                 | Aug 2024 | Solution outlined, touches multiple files |

### 📋 Older Feature Requests (Actionable)

| #        | Title                              | Age      | Notes                                 |
| -------- | ---------------------------------- | -------- | ------------------------------------- |
| **#145** | Fail eval early on non-chat errors | Sep 2023 | 14+ months old, no activity           |
| **#244** | Web view variables ordering        | Oct 2023 | Solution: add `varOrder` config field |

---

## Issue Details

### #1781 - evaluateOptions not working if file name != promptfooconfig

**Bug Description:**
The `evaluateOptions` is not effective if the promptfoo config file is different from `promptfooconfig.yaml`

**To Reproduce:**

1. With a `promptfooconfig.yaml` set `evaluateOptions: { repeat: 2, cache: false }` and write a test
2. Execute `promptfoo eval` or `promptfoo eval -c promptfooconfig.yaml`
3. The test is well repeated 2 times and the cache is disabled
4. Rename `promptfooconfig.yaml` into `promptfooconfig-test.yaml`
5. Execute `promptfoo eval -c promptfooconfig-test.yaml`
6. The test is executed only once, and the cache is enabled

**Status:** @eharris128 said they would take a swing at this

---

### #1613 - File content not loaded when used in vars dict

**Bug Description:**
When vars contain a complex map of nested values, reading content of files with `file://` prefix doesn't work.

**To Reproduce:**

```yaml
tests:
  - vars:
      reporting_period:
        current:
          period: '2023-12-31'
        previous:
          period: '2024-02-15'
          report: file://data/mixed_report_tables.html.txt
```

The prompt template is injected with the file path string, not the file content.

**Status:** `good-first-issue`, @adityabharadwaj198 volunteered, @mldangelo provided test cases

---

### #810 - Markdown appearing when manually failing test case

**Bug Description:**
When rendering with markdown in the web viewer, if manually failing the test case (thumbs down), the markdown appears AND is rendered (double display).

**Status:** Was fixed in v0.61.0, regressed in v0.62.0

---

### #3797 - Truncated Test Name in CLI Progress Bar

**Bug Description:**
The CLI progress bar doesn't display enough characters to see which test is being run.

**Status:** `good-first-issue`, @adityabharadwaj198 implemented a small fix

---

### #1499 - Add perma/direct link to test result in eval view

**Feature Request:**
Add the ability to permalink directly to a result row in the eval view.

**Status:** `good-first-issue`, no progress

---

### #1440 - Add ability to configure which vars show in result table by default

**Feature Request:**
Many variables are needed but not useful to view in test results by default. Request for:

- A way to mark default visibility for variables in promptfoo config
- A separate config file for `promptfoo view` with default visibility settings

**Status:** `good-first-issue`, no progress

---

### #1431 - Allow caching when evaluateOptions.repeat is greater than 1

**Feature Request:**
PromptFoo never caches responses when repeat > 1. Would be great if cache works in this situation.

**Implementation Notes from @mldangelo:**

1. `src/cache.ts`: Modify `fetchWithCache` to include repeat number in cache key
2. Provider-specific files: Update cache key generation (26 instances of `cacheKey`)
3. `src/evaluator.ts`: Pass repeat number to provider calls
4. Test files: Update existing tests and add new ones
5. Documentation: Update docs for new caching capabilities

**Status:** `good-first-issue`, detailed implementation plan provided

---

### #145 - Fail eval early if there's a non-chat related failure

**Feature Request:**
If eval can't connect to model or doesn't support an assertion type, it keeps running for all prompts. Request for fast-failing on comms/support errors.

**Status:** No comments, 14+ months old

---

### #244 - Web view variables ordering

**Feature Request:**
Variables in web view don't keep the same ordering as in CSV - they are sorted.

**Proposed Solution from @typpo:**

- Add `varOrder: [...]` field
- Or make columns reorderable on frontend
- Don't sort when datasource is spreadsheet

**Status:** Solution proposed, no implementation

---

## Recommendations

### Quick Wins

1. **#3797** - Already has a fix, just needs PR submitted
2. **#1499** - Simple permalink feature, add URL hash param
3. **#810** - Debug markdown regression

### Medium Effort

4. **#1781** - evaluateOptions bug, needs investigation
5. **#1613** - Nested file loading, has clear repro

### Larger but Well-Defined

6. **#145** - Early fail on errors (good UX improvement)
7. **#244** - varOrder config field
