# Critical Audit: PR #6611 Ink CLI UI Split Strategy

## Executive Summary

PR #6611 is a **199-file, +45,925 line** PR introducing an Ink-based interactive CLI UI. While well-architected, landing this as a single PR presents significant review and rollback risks. This document provides a critical analysis and actionable PR split strategy.

## PR Statistics

| Category            | Files   | Lines Added |
| ------------------- | ------- | ----------- |
| src/ui/ (new)       | 123     | ~35,000     |
| test/ui/ (new)      | 39      | ~8,000      |
| docs/design/ (new)  | 11      | ~6,000      |
| Commands (modified) | 7       | ~1,100      |
| Other (modified)    | 19      | ~1,800      |
| **Total**           | **199** | **~45,900** |

## Critical Issues Identified

### 1. **Monolithic Dependency on Core Infrastructure**

The current structure has a problem: **you cannot land ANY feature UI without first landing ALL infrastructure**.

**Dependency Chain:**

```text
Feature UIs (auth, cache, list, menu, share)
    └── render.ts
        └── interactiveCheck.ts
            └── constants.ts
    └── components/shared/*
        └── hooks/*
            └── utils/*
```

**Impact:** The "Phase 1: Infrastructure" PR in the existing landing strategy is a prerequisite for everything else, but it's ~3,000 lines of code that does nothing user-visible by itself.

### 2. **Command File Changes Are Deeply Entangled**

Each command modification imports from `src/ui/*`:

| Command  | Lines Changed | UI Imports                  |
| -------- | ------------- | --------------------------- |
| eval.ts  | +396/-27      | evalRunner, shouldUseInkUI  |
| list.ts  | +220/-122     | listRunner, shouldUseInkUI  |
| auth.ts  | +201/-108     | authRunner, shouldUseInkUI  |
| cache.ts | +107/-5       | cacheRunner, shouldUseInkUI |
| init.ts  | +29           | initRunner                  |
| share.ts | +44           | shareRunner                 |
| menu.ts  | +116 (new)    | menuRunner                  |

**Problem:** You cannot split "just the auth UI" without also landing the infrastructure it depends on.

### 3. **Test Files Mirror Source Structure**

Tests are organized 1:1 with source files:

- 13 test files for components
- 7 test files for init
- 4 test files for utils
- etc.

**Implication:** Each PR should include corresponding tests, which inflates PR sizes.

### 4. **The Init Wizard is 40% of the Codebase**

```text
src/ui/init/ - 39 files (~15,000 lines)
test/ui/init/ - 7 files (~2,500 lines)
```

This is the largest single feature and is self-contained, making it a good candidate for deferral.

### 5. **Eval UI is the Core Value**

The eval command changes (+396 lines) and EvalApp/EvalScreen components are the most important user-facing feature. However, they depend on:

- Table components (21 files)
- Eval components (11 files)
- Shared components (6 files)
- Contexts (3 files)
- Machines (1 file)
- Hooks (6 files)
- Utils (8 files)

**Total:** ~60 files just for the eval UI.

---

## Recommended PR Split Strategy

### Approach: Feature-Gated Incremental Landing

Instead of "infrastructure first", land **complete vertical slices** with feature flags.

---

### PR 1: Foundation + Non-Interactive Fallback (LOW RISK)

**Size:** ~2,500 lines | **Review Time:** 1-2 hours

**Files:**

```text
src/ui/constants.ts
src/ui/interactiveCheck.ts
src/ui/render.ts
src/ui/noninteractive/progress.ts
src/ui/noninteractive/textOutput.ts
src/ui/noninteractive/index.ts
src/envars.ts (add PROMPTFOO_ENABLE_INTERACTIVE_UI)
test/ui/noninteractive.test.ts
test/ui/render.test.ts
```

**Why First:**

- Establishes the "is interactive UI enabled?" check (opt-in)
- Provides fallback for when Ink can't be used
- Zero user-visible changes (feature is opt-in)
- Unblocks all subsequent PRs

**Environment Variable:**

```bash
PROMPTFOO_ENABLE_INTERACTIVE_UI=true  # Enable Ink UI (opt-in)
```

---

### PR 2: Hooks + Utils + Shared Components (LOW RISK)

**Size:** ~5,000 lines | **Review Time:** 2-3 hours

**Files:**

```text
src/ui/hooks/*
src/ui/utils/*
src/ui/components/shared/*
test/ui/hooks/*
test/ui/utils/*
test/ui/components/shared/*
```

**Why Second:**

- All leaf modules with no internal dependencies
- Reused across all feature UIs
- Easy to review in isolation
- Pure additions, no command changes

---

### PR 3: Eval UI Core (MEDIUM RISK)

**Size:** ~12,000 lines | **Review Time:** 4-6 hours

**Files:**

```text
src/ui/contexts/*
src/ui/machines/evalMachine.ts
src/ui/evalBridge.ts
src/ui/EvalApp.tsx
src/ui/evalRunner.tsx
src/ui/components/eval/*
src/ui/components/table/*
src/commands/eval.ts (modified)
src/evaluator.ts (modified)
test/ui/eval/*
test/ui/machines/*
test/ui/components/table/*
test/ui/integration/*
```

**Why Third:**

- Core value proposition of the feature
- Requires PR 1 and PR 2
- Command changes are localized to eval.ts
- Includes the full table/results viewing experience

**Feature Flag:**

```bash
promptfoo eval --interactive  # Opt-in
PROMPTFOO_EXPERIMENTAL_INK=1 promptfoo eval  # Env-based opt-in
```

---

### PR 4: Auxiliary UIs (LOW RISK)

**Size:** ~6,000 lines | **Review Time:** 2-3 hours

**Files:**

```text
src/ui/auth/*
src/ui/cache/*
src/ui/list/*
src/ui/menu/*
src/ui/share/*
src/commands/auth.ts (modified)
src/commands/cache.ts (modified)
src/commands/list.ts (modified)
src/commands/menu.ts (new)
src/commands/share.ts (modified)
test/ui/auth/*
test/ui/cache/*
test/ui/list/*
test/ui/menu/*
test/ui/share/*
```

**Why Fourth:**

- Self-contained feature modules
- Each can be enabled independently
- Less critical than eval UI
- Could even be split into 5 separate PRs if desired

---

### PR 5: Init Wizard (MEDIUM RISK)

**Size:** ~18,000 lines | **Review Time:** 6-8 hours

**Files:**

```text
src/ui/init/*
src/commands/init.ts (modified)
src/redteam/commands/init.ts (modified)
test/ui/init/*
```

**Why Last:**

- Largest single feature (~40% of the codebase)
- Self-contained with its own state machines
- Complex user flows requiring thorough testing
- Includes both regular and redteam init wizards

**Feature Flag:**

```bash
PROMPTFOO_EXPERIMENTAL_INIT=1 promptfoo init
```

---

### PR 6: Redteam Generate UI (LOW RISK)

**Size:** ~1,500 lines | **Review Time:** 1 hour

**Files:**

```text
src/ui/redteamGenerate/*
src/redteam/commands/generate.ts (modified)
test/ui/redteamGenerate/*
```

**Why Separate:**

- Small, isolated feature
- Independent from other UIs
- Can be landed anytime after PR 1-2

---

## Alternative: Two-PR Strategy

If the team prefers fewer PRs:

### PR A: Infrastructure + Eval UI (~17,000 lines)

Combines PR 1-3 above.

**Pros:**

- Single review for core functionality
- Faster time to value

**Cons:**

- Large review (~17k lines)
- All-or-nothing for core feature

### PR B: Everything Else (~28,000 lines)

Combines PR 4-6 above.

**Pros:**

- Clear separation between "core" and "extended" features

**Cons:**

- Still a very large PR

---

## Dependency Graph (Visual)

```text
                    ┌─────────────────────┐
                    │ PR 1: Foundation    │
                    │ (interactiveCheck,  │
                    │  render, constants) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ PR 2: Utils/Hooks   │
                    │ (shared components, │
                    │  formatting, etc.)  │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────▼──────┐    ┌───────▼───────┐   ┌──────▼──────┐
    │ PR 3: Eval  │    │ PR 4: Aux UIs │   │ PR 6: RT Gen│
    │ (core eval  │    │ (auth, cache, │   │ (small,     │
    │  experience)│    │  list, menu)  │   │  isolated)  │
    └──────┬──────┘    └───────────────┘   └─────────────┘
           │
    ┌──────▼──────┐
    │ PR 5: Init  │
    │ (wizard UIs,│
    │  state mach)│
    └─────────────┘
```

---

## Risk Assessment by PR

| PR  | Size | Risk   | Review Complexity | Rollback Difficulty        |
| --- | ---- | ------ | ----------------- | -------------------------- |
| 1   | 2.5k | Low    | Easy              | Trivial (no user impact)   |
| 2   | 5k   | Low    | Medium            | Trivial (no user impact)   |
| 3   | 12k  | Medium | High              | Moderate (feature-flagged) |
| 4   | 6k   | Low    | Medium            | Easy (feature-flagged)     |
| 5   | 18k  | Medium | High              | Moderate (feature-flagged) |
| 6   | 1.5k | Low    | Easy              | Trivial                    |

---

## Implementation Checklist

For each PR:

- [ ] Feature flag in place (`PROMPTFOO_EXPERIMENTAL_*`)
- [ ] All tests pass
- [ ] Build succeeds on all Node versions
- [ ] Lint clean
- [ ] Dynamic imports prevent bundle bloat for library users
- [ ] Non-interactive fallback works
- [ ] Manual testing on: iTerm2, VS Code terminal, Windows Terminal
- [ ] Documentation updated (if user-facing)

---

## Recommendation

**Go with the 6-PR strategy.** Here's why:

1. **Reviewability:** Each PR is focused and reviewable in a single session
2. **Rollback:** Feature flags allow easy rollback per feature
3. **Parallelism:** After PR 1-2, PRs 3-6 can be developed/reviewed in parallel
4. **Risk Isolation:** A bug in the init wizard doesn't affect the eval UI
5. **Incremental Value:** Users get the eval UI (most valuable) before waiting for init

**Timeline:**

- Week 1: PR 1 + PR 2 (foundation)
- Week 2: PR 3 (eval UI - most valuable)
- Week 3: PR 4 + PR 6 (auxiliary UIs)
- Week 4: PR 5 (init wizard)

---

## Questions for Decision

1. **Feature flag permanence:** Keep flags forever as opt-in, or remove after stabilization?
2. **Default behavior:** After stabilization, should Ink UI be default or opt-in?
3. **Init wizard priority:** Is the init wizard critical for initial launch, or can it wait?
4. **Documentation:** Should docs be updated with each PR, or in a final docs-only PR?
