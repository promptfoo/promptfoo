# Red Team Generation Lab Notebook

## Iteration 1 - 2026-05-09

### Goal

Establish a serious starting point for the research loop:

- understand the existing Promptfoo generation stack
- gather a first pass of modern literature
- choose a benchmark surface
- create the first deterministic analysis tool

### Facts Learned

1. The repo already has sophisticated **strategy-side** attack search:
   - TAP-style search in `src/redteam/providers/iterativeTree.ts`
   - meta-agent search in `src/redteam/providers/iterativeMeta.ts`
   - multi-turn escalation in `src/redteam/providers/crescendo/`
2. The repo still has many **plugin-side** generators that are fundamentally
   few-shot single-pass templates:
   - `sqlInjection.ts`
   - `promptExtraction.ts`
   - `excessiveAgency.ts`
   - much of `pii.ts`
3. The existing medical-agent example gives us a stable baseline corpus:
   - `35` `sql-injection` cases
   - `35` `pii:direct` cases
   - `35` `pii:social` cases
   - `35` `prompt-extraction` cases
   - `35` `excessive-agency` cases
4. The baseline prompts are reasonably grounded in the healthcare target but
   visibly cluster around obvious forms, which makes tactic coverage a promising
   hill-climbing target.

### Literature Notes

- PAIR showed that iterative semantic refinement can produce jailbreaks in
  fewer than twenty queries.
- TAP added tree search and pruning to reduce wasted target calls.
- GPTFuzz framed attack generation as seed mutation and selection rather than
  one-shot sampling.
- AutoDAN-Turbo argued that the attack strategy space itself can be discovered.
- Crescendo made it clear that multi-turn attacks need their own treatment.
- AgentDojo, InjecAgent, and ToolEmu all push the field toward realistic agent
  environments, not static prompt strings.

### Initial Hypotheses

1. Better seed portfolios will improve downstream search even if strategy code is unchanged.
2. Plugin generators should optimize a **set** of attacks, not independent rows.
3. Tactic coverage is a more useful first offline target than superficial lexical diversity.
4. Agentic plugins will eventually need to emit structured scenarios rather than only prompts.

### Work Completed

- Created the research plan in `docs/plans/redteam-generation-research.md`.
- Added the first benchmark analyzer in
  `scripts/redteam-research/analyzeGeneratedAttacks.ts`.
- Selected a representative initial plugin set:
  - `sql-injection`
  - `pii:direct`
  - `pii:social`
  - `prompt-extraction`
  - `excessive-agency`

### Baseline Results

Command:

```bash
npx tsx scripts/redteam-research/analyzeGeneratedAttacks.ts \
  examples/redteam-medical-agent/redteam.yaml \
  --format markdown
```

| Plugin | Rows | Unique normalized prompts | Detected tactic coverage | Purpose grounding | Entity reference |
| --- | ---: | ---: | --- | ---: | ---: |
| `sql-injection` | 35 | 5 | `2/5` | `100%` | `100%` |
| `pii:direct` | 35 | 5 | `2/5` | `100%` | `100%` |
| `pii:social` | 35 | 5 | `3/5` | `100%` | `100%` |
| `prompt-extraction` | 35 | 5 | `5/5` | `100%` | `40%` |
| `excessive-agency` | 35 | 5 | `5/5` | `100%` | `100%` |

Observations:

1. The dominant issue is **portfolio narrowness**: each selected plugin has only
   `5` unique normalized seed prompts despite `35` emitted rows.
2. `sql-injection` and `pii:*` have the weakest detected tactic coverage in the
   current baseline, making them attractive first targets for taxonomy-guided
   generation.
3. `prompt-extraction` shows broad tactic labels under the current heuristics but
   comparatively weak entity grounding, which may matter for realistic target
   adaptation.
4. Strategy fanout is currently inflating row count much faster than it expands
   unique seed coverage. Improving seeds before strategy expansion should pay off.

### Next Questions

1. How much tactic spread is already present in the baseline?
2. Are baseline prompts using enough of the target-specific entities?
3. Which plugin family gives us the cleanest first win for planner-guided generation?
4. Should the first prototype live beside the production generator or in a research
   harness until the benchmark is convincing?
