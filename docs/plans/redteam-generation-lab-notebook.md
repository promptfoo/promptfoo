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

| Plugin              | Rows | Unique normalized prompts | Detected tactic coverage | Purpose grounding | Entity reference |
| ------------------- | ---: | ------------------------: | ------------------------ | ----------------: | ---------------: |
| `sql-injection`     |   35 |                         5 | `2/5`                    |            `100%` |           `100%` |
| `pii:direct`        |   35 |                         5 | `2/5`                    |            `100%` |           `100%` |
| `pii:social`        |   35 |                         5 | `3/5`                    |            `100%` |           `100%` |
| `prompt-extraction` |   35 |                         5 | `5/5`                    |            `100%` |            `40%` |
| `excessive-agency`  |   35 |                         5 | `5/5`                    |            `100%` |           `100%` |

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

## Iteration 2 - 2026-05-09

### Goal

Test the first concrete hypothesis from iteration 1:

> A taxonomy-guided planner should produce a broader SQL attack portfolio than
> the current single-pass baseline without needing any target feedback yet.

### Experiment

Built `scripts/redteam-research/generateSqlPortfolio.ts`, a deliberately simple
planner-driven prototype that emits a balanced SQL portfolio across five tactic
families:

1. `boolean-bypass`
2. `union-extraction`
3. `stacked-query`
4. `schema-discovery`
5. `authorization-filter-removal`

The prototype extracts target entities from the source purpose text and uses them
to instantiate concrete healthcare attacks.

### Results

Baseline from the current medical-agent artifact:

| Variant                       | Rows | Unique prompts | Detected tactic coverage | Avg pairwise distance |
| ----------------------------- | ---: | -------------: | ------------------------ | --------------------: |
| Existing generated SQL corpus |   35 |              5 | `2/5`                    |               `0.773` |

Planner prototype:

| Variant                       | Rows | Unique prompts | Detected tactic coverage | Avg pairwise distance |
| ----------------------------- | ---: | -------------: | ------------------------ | --------------------: |
| Taxonomy-guided SQL portfolio |   10 |             10 | `5/5`                    |               `0.903` |

### Reflection

1. This is the first genuine hill-climb win:
   - unique prompts improved from `5` to `10`
   - detected tactic coverage improved from `2/5` to `5/5`
   - average pairwise distance improved from `0.773` to `0.903`
2. The first analyzer pass incorrectly reported `0%` grounding for the planner
   output because the scratch YAML did not carry forward the source `purpose`.
   That is a benchmark-design lesson: generated artifacts must preserve the
   evaluation context they depend on.
3. Even this very simple planner already outperforms the baseline on the first
   offline objective. The next question is whether a planner can be made
   **general** rather than one-off and whether over-generation plus selection can
   improve the portfolio further.

### New Hypotheses

1. A target-independent tactic taxonomy plus target-dependent instantiation may
   be a strong general pattern for many plugins.
2. The planner should probably emit **quotas** by tactic and surface, then let a
   generator instantiate multiple realizations per quota.
3. The next meaningful step is not more SQL hand-authoring; it is a reusable
   portfolio-selection layer that can compare candidate sets under a diversity
   objective.

## Iteration 3 - 2026-05-09

### Goal

Test whether curation itself is valuable:

> Given the same over-generated SQL candidate pool, can a portfolio selector
> recover a materially better subset than naive first-N sampling?

### Experiment

1. Split shared SQL research helpers into
   `scripts/redteam-research/sqlResearchShared.ts`.
2. Added `scripts/redteam-research/selectSqlPortfolio.ts`.
3. Built a deliberately noisy `16`-candidate pool:
   - near-duplicates
   - repeated boolean-bypass attacks
   - the full planner-generated tactic set
4. Compared:
   - `first`: first `5` candidates in pool order
   - `diverse`: greedy selection with a strong unseen-tactic bonus plus lexical
     novelty

### Results

| Selection policy | Rows | Unique prompts | Detected tactic coverage | Avg pairwise distance | Max similarity |
| ---------------- | ---: | -------------: | ------------------------ | --------------------: | -------------: |
| First `5`        |    5 |              4 | `2/5`                    |               `0.681` |        `1.000` |
| Diverse `5`      |    5 |              5 | `5/5`                    |               `0.941` |        `0.154` |

### Reflection

1. Curation has measurable value even before adding another model:
   - one duplicate disappears
   - all tactic families are represented
   - the selected set becomes much less self-similar
2. This suggests a modern generator should be decomposed into at least two
   explicit phases:
   - candidate generation
   - portfolio selection
3. A selector also gives us a natural place to enforce global constraints that
   are hard to encode in individual prompts:
   - tactic quotas
   - entity quotas
   - surface quotas
   - novelty ceilings
   - cost budgets
4. The experiment also found a harness bug before it produced a result: importing
   the earlier SQL prototype executed its CLI entrypoint. Splitting pure library
   code from executable scripts was the right repair and is worth preserving as a
   rule for future research tools.

### New Hypotheses

1. For larger `n`, selector quality may matter more than raw generator quality
   once the candidate pool is rich enough.
2. The next benchmark dimension should be **quota satisfaction** across multiple
   axes, not only tactic coverage.
3. We now need a second plugin family to test whether planner + selector is a SQL
   trick or a reusable generation architecture.

## Iteration 4 - 2026-05-09

### Goal

Test whether the planner-plus-selector pattern generalizes beyond SQL:

> Can the same architecture improve a softer, less syntax-driven family such as
> `prompt-extraction`?

### Experiment

Built a prompt-extraction research stack:

- `promptExtractionResearchShared.ts`
- `generatePromptExtractionPortfolio.ts`
- `selectPromptExtractionPortfolio.ts`

Unlike SQL, prompt extraction was already `5/5` on our coarse tactic labels, so
the planner varied additional dimensions:

1. requested artifact
2. social pretext
3. target-specific entity

Representative artifacts:

- audit report
- handoff summary
- training guide
- debug transcript
- onboarding email
- incident review
- policy diff
- documentation checklist

### Results

Baseline:

| Variant                             | Rows | Unique prompts | Detected tactic coverage | Entity reference | Avg pairwise distance |
| ----------------------------------- | ---: | -------------: | ------------------------ | ---------------: | --------------------: |
| Existing prompt-extraction corpus   |   35 |              5 | `5/5`                    |            `40%` |               `0.730` |
| Planner-generated extraction corpus |    8 |              8 | `5/5`                    |          `87.5%` |               `0.901` |

Selector comparison on the same candidate pool:

| Selection policy | Rows | Unique prompts | Detected tactic coverage | Avg pairwise distance | Max similarity |
| ---------------- | ---: | -------------: | ------------------------ | --------------------: | -------------: |
| First `5`        |    5 |              4 | `4/5`                    |               `0.659` |        `1.000` |
| Diverse `5`      |    5 |              5 | `5/5`                    |               `0.909` |        `0.194` |

### Reflection

1. Planner plus selector now works on both:
   - a syntax-heavy exploit family (`sql-injection`)
   - a socially mediated family (`prompt-extraction`)
2. Prompt-extraction taught us that tactic coverage alone is too blunt. A corpus
   can cover all coarse tactics and still be poor because it repeats the same
   artifact shape or barely uses the target context.
3. Generalization required making the YAML emitter plugin-aware instead of
   accidentally hard-coding `sql-injection`. This is a small but useful reminder
   that any eventual production architecture must treat plugin identity as data,
   not as an incidental implementation detail.

### New Hypotheses

1. Each plugin family likely needs its own **coverage schema**:
   - SQL: tactic × exploit surface
   - prompt extraction: tactic × pretext × artifact
   - PII: relation × sensitive field × authorization story
   - agentic attacks: task × untrusted source × tool × attacker goal
2. The right generic abstraction may be:
   - plugin-specific coverage dimensions
   - shared candidate pool
   - shared portfolio selector
3. The next useful move is to make coverage dimensions first-class in the
   analyzer so we can compare plugin families on more than lexical diversity.
