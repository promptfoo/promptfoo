# Critical Review: Ink Init Plan

## Executive Summary

The plan is ambitious and comprehensive but has several areas requiring deeper consideration. The estimated 16-day timeline is optimistic and likely underestimates integration complexity. Key concerns center around the external editor integration, state machine complexity, and the decision to inline redteam (which nearly doubles scope).

---

## Strengths

### 1. Well-Structured Architecture
The file structure is logical and follows established patterns from the eval UI. Separating shared components enables reuse in other commands (list, show) later.

### 2. Hierarchical Provider Selection
The two-phase selection (family → models) is a significant UX improvement. This design scales well as more providers/models are added.

### 3. State Machine Approach
Using XState provides explicit state management, enables back navigation, and makes the complex branching testable.

### 4. Comprehensive Test Strategy
The testing plan covers unit, component, and integration levels appropriately.

---

## Critical Issues

### 1. External Editor Integration is Underspecified

**Problem**: The plan waves hands at "spawn $EDITOR and capture result" but this is a non-trivial cross-platform challenge.

**Specific concerns**:
- **Windows**: No standard `$EDITOR`. Notepad doesn't block. VS Code with `--wait` does, but requires detection.
- **macOS/Linux**: `$EDITOR` might be `vim` which requires TTY. Running from non-TTY context (piped, CI) will fail.
- **Ink rendering conflict**: Can't have Ink and an external editor both using the terminal simultaneously. Need to fully unmount Ink, spawn editor, then remount.
- **Temp file race conditions**: Editor might not close cleanly, leaving zombie processes.

**Recommendation**: Add a dedicated design section for external editor with platform-specific fallback chains and error handling. Consider if a simplified inline approach would suffice for most users.

### 2. 16-Day Timeline is Optimistic

**Reality check**:
- Phase 1 (Foundation): 3-4 days → Realistic
- Phase 2 (Regular Init): 2-3 days → Underestimated. FilePreview alone with syntax highlighting, scrolling, tab switching is 1-2 days.
- Phase 3 (Example Download): 1 day → Realistic
- Phase 4 (Redteam): 4-5 days → Severely underestimated. The redteam flow has 8+ steps with complex interactions.
- Phase 5 (Integration): 2-3 days → Underestimated. Telemetry, edge cases, and polish always take longer.

**Revised estimate**: 22-28 days for a production-ready implementation.

### 3. Inlining Redteam May Not Be Worth It

**The plan's assumption**: Unified experience is better than delegation.

**Counter-argument**:
- Redteam init is used by ~10% of users (based on typical redteam adoption)
- It adds 8+ complex steps to the state machine
- The external editor requirement is unique to redteam
- Redteam users are generally more technical (can handle separate flow)

**Alternative**: Keep redteam as a separate, parallel Ink implementation. Both share components but have separate entry points:
```bash
promptfoo init           → Ink init wizard (no redteam)
promptfoo redteam init   → Ink redteam wizard
```

This reduces Phase 4 from 4-5 days to 0 (for initial release), allowing faster delivery of the core experience.

### 4. Provider Catalog Maintenance Burden

**Problem**: Hardcoding provider/model lists creates ongoing maintenance burden. Models are added/deprecated frequently.

**Evidence**: The current onboarding.ts already has stale model names (references to unreleased models).

**Recommendation options**:
1. **Fetch from API**: Load provider catalog from promptfoo.dev at runtime (with local fallback)
2. **Generate from schema**: Derive from existing provider implementations
3. **Accept staleness**: Document that catalog is best-effort and users should check docs

### 5. Missing: Accessibility Considerations

**Problem**: Plan doesn't address accessibility requirements.

**Specific concerns**:
- Screen reader compatibility with Ink components
- Color-blind friendly indicators (not just red/green)
- Keyboard-only navigation (already good, but needs testing)

**Recommendation**: Add accessibility testing to Phase 5.

### 6. Missing: Offline/CI Mode

**Problem**: Init wizard assumes interactive TTY. What about:
- CI environments generating configs
- Offline mode (can't fetch examples)
- Piped input for automation

**Recommendation**: Add explicit handling for:
```bash
# Non-interactive mode should still work
promptfoo init --no-interactive --use-case compare --provider openai:gpt-5
```

The current inquirer-based init supports `--no-interactive`. The Ink version must maintain this.

---

## Design Concerns

### 1. HierarchicalSelect Complexity

The two-phase selection is powerful but complex:
- Phase 1: Select families (multi-select)
- Phase 2: For each selected family, select models (multi-select)

**Questions not answered**:
- What if user selects 5 families? Do they see 5 sequential model selection screens?
- Can they go back from model selection to family selection?
- What's the UI if they select a family with only 1 model?

**Recommendation**: Consider an alternative UX:
- Expandable accordion within single screen
- Or: Flat list with grouping headers and search

### 2. FilePreview Tab Switching

**Question**: How does tabbing work if there are 5+ files?

**Concern**: Terminal width may not accommodate all tabs. Need overflow handling (arrows, pagination).

### 3. State Machine May Be Over-Engineered

**Observation**: XState is powerful but introduces complexity. The init flow is mostly linear with few branches.

**Question**: Is a simpler `useState`-based step counter sufficient?

**Counter-argument**: XState benefits (back navigation, explicit states, devtools) justify complexity. But this should be validated.

---

## Missing Sections

### 1. Error Recovery Strategy

What happens when:
- GitHub API fails during example list fetch?
- File write fails mid-way?
- User's disk is full?
- Network drops during download?

Need explicit error states and recovery paths in state machine.

### 2. Configuration Persistence

**Question**: Should wizard state be saved to disk on interrupt?

**Use case**: User presses Ctrl+C accidentally at step 5/6. Currently they restart from beginning.

**Recommendation**: Consider saving wizard state to temp file for "resume" capability.

### 3. Upgrade Path from Existing Configs

**Question**: What if user runs `promptfoo init` in a directory that already has `promptfooconfig.yaml`?

Current behavior: Asks about overwrite.

**Better UX**: Offer to "enhance" existing config (add providers, tests) rather than overwrite.

### 4. Telemetry Parity

**Requirement**: New Ink init must emit identical telemetry events as current inquirer init for funnel analysis continuity.

**Verification needed**: Map all `recordOnboardingStep` calls in current code to plan.

---

## Recommendations

### Immediate (Before Implementation)

1. **Decide on redteam scope**: Inline (full plan) vs separate (reduced scope)
2. **Prototype external editor**: Test on Windows, macOS, Linux before committing to plan
3. **Validate HierarchicalSelect UX**: Paper prototype or Figma mockup first

### Phase 1 Additions

1. Add `--no-interactive` support from day 1
2. Add error state handling to state machine
3. Add offline fallback for example list

### Phase 5 Additions

1. Accessibility audit
2. Telemetry parity verification
3. Performance testing (large example downloads)

---

## Alternative Approaches Considered

### 1. Wizard-in-Browser
Instead of terminal wizard, open browser for init:
```bash
promptfoo init  # Opens localhost:3000/init
```

**Pros**: Rich UI, no terminal limitations, better editor integration
**Cons**: Requires server, more complex, different paradigm

**Verdict**: Not recommended for v1, but interesting future option.

### 2. Config Builder API
Expose programmatic config builder:
```typescript
import { ConfigBuilder } from 'promptfoo';
const config = new ConfigBuilder()
  .withProvider('openai:gpt-5')
  .withPrompt('...')
  .build();
```

**Pros**: Useful for programmatic usage, CI
**Cons**: Doesn't solve interactive init UX

**Verdict**: Orthogonal to this effort. Could be added separately.

### 3. Incremental Migration
Instead of parallel implementation, gradually replace inquirer components with Ink equivalents within existing flow.

**Pros**: Lower risk, incremental delivery
**Cons**: Can't mix inquirer and Ink (both use raw mode), so this doesn't work

**Verdict**: Not feasible due to technical constraints.

---

## Conclusion

The plan is solid foundation but needs refinement before implementation:

1. **Reduce scope**: Consider excluding redteam from initial release
2. **Prototype risks**: External editor and HierarchicalSelect need validation
3. **Increase timeline**: Revise to 22-28 days
4. **Add missing sections**: Error recovery, accessibility, CI mode
5. **Validate with users**: Paper prototype key screens before building

**Recommended path forward**:
- Week 1: Prototype external editor and HierarchicalSelect
- Week 2-3: Implement Phase 1-2 (core init without redteam)
- Week 4: Implement Phase 3 (examples) and initial Phase 5 (integration)
- Release as beta with feature flag
- Week 5-6: User feedback, iterate
- Week 7-9: Phase 4 (redteam) if validated
