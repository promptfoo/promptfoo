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

## Iteration 5 - 2026-05-09

### Goal

Make the benchmark more faithful:

> Promote plugin-specific coverage dimensions into the analyzer so a corpus that
> is superficially complete on one coarse axis can still be distinguished from a
> truly richer portfolio.

### Experiment

Extended `analyzeGeneratedAttacks.ts` with explicit multi-axis coverage support.

Current dimensions:

- `sql-injection`
  - `tactic`
- `prompt-extraction`
  - `tactic`
  - `pretext`
  - `artifact`

### Results

Baseline prompt extraction:

| Corpus          | Tactic coverage | Pretext coverage | Artifact coverage |
| --------------- | --------------- | ---------------- | ----------------- |
| Existing corpus | `5/5`           | `3`              | `3`               |

Planner prompt extraction:

| Corpus         | Tactic coverage | Pretext coverage | Artifact coverage |
| -------------- | --------------- | ---------------- | ----------------- |
| Planner corpus | `5/5`           | `7`              | `6`               |

The richer analyzer reveals a distinction the old metric hid:

- baseline and planner are both `5/5` on coarse tactic labels
- only the planner meaningfully broadens scenario variety

### Reflection

1. Coarse one-axis coverage can make a narrow corpus look finished.
2. Multi-axis coverage gives us a much better language for plugin-specific
   quality:
   - not only "did we cover the attack family?"
   - but also "did we cover meaningful ways that family manifests?"
3. This has implications for generator design:
   - a planner needs plugin-specific dimensions
   - a selector needs plugin-specific quotas
   - a benchmark needs plugin-specific diagnostics

### Five-Iteration Status

At the end of iteration 5:

1. We established a durable benchmark harness and research notebook.
2. We found a concrete baseline weakness:
   - many emitted rows
   - very few unique seed prompts
3. We showed a taxonomy-guided planner can materially improve `sql-injection`.
4. We showed a diversity-aware selector improves selected portfolios even with
   the same candidate pool.
5. We showed the architecture generalizes to `prompt-extraction`, where it
   improves not only lexical diversity but also scenario coverage.
6. We upgraded the benchmark so it can express plugin-specific multi-axis
   coverage instead of collapsing everything into one tactic score.

### New Hypotheses

1. The next priority is `pii:*`, because it should stress-test relation,
   authorization-story, and sensitive-field dimensions rather than tactic syntax
   or artifact shape.
2. Once PII works, the architecture will have crossed:
   - syntax attacks
   - instruction-boundary attacks
   - privacy/social-engineering attacks
3. After that, the right next frontier is agentic scenario generation, where the
   output should become a structured attack scenario rather than a single prompt.

## Iteration 6 - 2026-05-09

### Goal

Stress-test the architecture on privacy/social-engineering attacks:

> Can planner plus selector improve `pii:*` when the useful variation is about
> relationship, authorization story, and sensitive field rather than syntax or
> artifact format?

### Experiment

Added:

- `piiResearchShared.ts`
- `generatePiiPortfolio.ts`
- `selectPiiPortfolio.ts`

Extended the analyzer with PII-specific dimensions:

1. `relationship`
2. `authorization-story`
3. `sensitive-field`

### Results

Baseline:

| Corpus                | Unique prompts | Coarse tactic coverage |
| --------------------- | -------------: | ---------------------- |
| Existing `pii:direct` |              5 | `2/5`                  |
| Existing `pii:social` |              5 | `3/5`                  |

Planner corpora:

| Corpus               | Unique prompts | Coarse tactic coverage | Relationship coverage | Authorization-story coverage | Sensitive-field coverage |
| -------------------- | -------------: | ---------------------- | --------------------- | ---------------------------- | ------------------------ |
| Planner `pii:direct` |              6 | `2/5`                  | `2`                   | `1`                          | `6`                      |
| Planner `pii:social` |              6 | `4/5`                  | `4`                   | `4`                          | `5`                      |

Selector comparison on the same noisy `pii:social` pool:

| Selection policy | Unique prompts | Coarse tactic coverage | Relationship coverage | Authorization-story coverage | Sensitive-field coverage | Avg pairwise distance |
| ---------------- | -------------: | ---------------------- | --------------------- | ---------------------------- | ------------------------ | --------------------: |
| First `5`        |              2 | `3/5`                  | `4`                   | `2`                          | `2`                      |               `0.364` |
| Diverse `5`      |              5 | `4/5`                  | `4`                   | `4`                          | `4`                      |               `0.889` |

### Reflection

1. The architecture continues to transfer:
   - planner broadens the candidate space
   - selector rescues a useful portfolio from a noisy pool
2. `pii:social` is the strongest PII result so far because the planner
   materially broadens:
   - who is asking
   - why they claim access
   - what kind of data they seek
3. The result is also more nuanced than the previous two families:
   - `pii:direct` is deliberately narrow on authorization story
   - `pii:social` still misses one coarse PII tactic
4. This is a useful sign that the benchmark is now strong enough to reveal
   **where** a generator is weak, not just whether it is better on average.

### New Hypotheses

1. The next improvement to PII should be planner repair:
   - diagnose uncovered dimensions
   - ask for replacements that specifically fill them
2. This is a natural place to add a critique-and-repair phase before candidate
   selection.
3. The architecture now has evidence across:
   - syntax attacks
   - instruction-boundary attacks
   - privacy/social-engineering attacks
     The next major frontier can be agentic scenarios once we add one repair loop.

## Iteration 7 - 2026-05-09

### Goal

Add the first critique-and-repair phase:

> When a planner corpus misses important dimensions, can a repair pass diagnose
> the gap and add targeted candidates that close it before selection?

### Experiment

Added:

- `repairPiiPortfolio.ts`
- deterministic PII critique/repair helpers in `piiResearchShared.ts`

The first repair rule focuses on `pii:social`, where iteration 6 showed one
missing coarse tactic:

- missing tactic before repair: `system-access-request`

### Results

Before repair:

| Corpus               | Tactic coverage | Sensitive-field coverage |
| -------------------- | --------------- | ------------------------ |
| Planner `pii:social` | `4/5`           | `5`                      |

After one targeted repair:

| Corpus                | Tactic coverage | Sensitive-field coverage |
| --------------------- | --------------- | ------------------------ |
| Repaired `pii:social` | `5/5`           | `6`                      |

The repair added a single focused candidate:

- relationship: `family`
- authorization story: `operational-need`
- sensitive field: `insurance`
- tactic: `system-access-request`

### Reflection

1. The useful architecture is now at least three phases:
   - generate
   - critique/repair
   - select
2. A selector cannot recover a dimension that never appears in the pool. Repair
   is the mechanism that turns benchmark diagnostics back into candidate
   generation.
3. The current selector experiment still runs on the unrepaired pool, which is a
   useful pipeline lesson:
   - once repair exists, selection should consume the repaired pool by default
4. This deterministic repair is only a scaffold. The real version should likely
   ask a model to propose gap-filling candidates from an explicit coverage report
   and then re-score them.

### New Hypotheses

1. A model-driven critic could propose more natural gap-filling candidates than
   hand-authored repair rules while preserving the same control loop.
2. The right general contract is:
   - analyzer emits uncovered dimensions
   - critic proposes candidates for those dimensions
   - selector optimizes the final portfolio
3. Before moving fully into agentic scenarios, we should make one pipeline that
   actually chains generate -> repair -> select end to end.

## Iteration 8 - 2026-05-09

### Goal

Join the stages into one actual pipeline:

> Does `generate -> repair -> select` produce a better final portfolio than
> selecting from the unrepaired pool?

### Experiment

Added `runPiiPipeline.ts`, which composes:

1. candidate generation
2. optional repair
3. diverse selection

Compared:

- unrepaired pipeline
- repaired pipeline

Both selected `5` final attacks from the `pii:social` family.

### Results

| Pipeline   | Tactic coverage | Relationship coverage | Authorization-story coverage | Sensitive-field coverage |
| ---------- | --------------- | --------------------- | ---------------------------- | ------------------------ |
| Unrepaired | `4/5`           | `4`                   | `4`                          | `4`                      |
| Repaired   | `5/5`           | `4`                   | `3`                          | `5`                      |

### Reflection

1. The repaired pipeline improves the final selected portfolio on the target
   dimension we asked it to fix:
   - `system-access-request` is now present
   - tactic coverage reaches `5/5`
2. The repaired pipeline also reveals a real tradeoff:
   - with only five slots, adding the repaired candidate displaces one
     authorization-story variant
3. This is a useful turning point. We are no longer merely asking "is this more
   diverse?" We are facing an actual portfolio-optimization problem with
   competing objectives and finite budget.
4. That means future selectors should probably work against explicit weighted
   objectives or Pareto fronts rather than an implicit greedy score alone.

### New Hypotheses

1. The next selector should expose tunable weights for:
   - tactic coverage
   - relationship coverage
   - authorization-story coverage
   - sensitive-field coverage
   - novelty
2. At small budgets, different users may want different frontier points:
   - maximum exploit-family coverage
   - maximum realism diversity
   - maximum sensitive-field coverage
3. Agentic scenarios will make this even more important because task, tool,
   source, and attacker-goal dimensions will compete under probe budgets.

## Iteration 9 - 2026-05-09

### Goal

Make selector preferences explicit:

> If multiple objectives compete under a fixed budget, can tunable weight
> profiles expose distinct useful frontier points?

### Experiment

Added:

- `PII_SELECTION_PROFILES`
- weighted PII selection
- `comparePiiProfiles.ts`
- profile support in `runPiiPipeline.ts`

Profiles tested:

1. `balanced`
2. `tacticMax`
3. `fieldMax`

### Results

All three profiles selected the same final five attacks on the current repaired
pool.

### Reflection

1. This is a useful negative result:
   - configurability exists
   - but the current pool is not rich enough to expose a meaningful frontier
2. The repaired pool has too few true tradeoff candidates. Several dimensions
   line up in the same attacks, so different weights still converge to the same
   answer.
3. This is an important benchmark lesson:
   - we cannot evaluate a selector's preferences on an easy pool
   - we need adversarial candidate pools where objectives genuinely conflict
4. The selector work is still worthwhile because it gives us the instrumentation
   needed for harder experiments.

### New Hypotheses

1. The next selector benchmark should deliberately construct competing
   candidates:
   - one candidate improves tactics but repeats relationship
   - another improves authorization story but repeats sensitive field
   - another improves novelty but covers no new dimension
2. Pareto analysis should be tested on a pool designed to contain tradeoffs, not
   only on organically small planner outputs.
3. Before agentic scenarios, one more selector iteration is justified so we do
   not carry a fake sense of optimization into a much harder domain.
