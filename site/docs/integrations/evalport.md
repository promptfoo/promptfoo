---
sidebar_label: EvalPort
title: EvalPort Integration
description: Exchange promptfoo test cases, graders, and eval results with other eval frameworks using EvalPort, the open Apache-2.0 interchange JSON format, both ways.
sidebar_position: 7
---

# EvalPort interchange

[EvalPort](https://github.com/adhabnr-ux/evalport) is an open (Apache-2.0), framework-agnostic JSON format for LLM evaluation datasets: test cases, graders, eval suites, and result sets. The converters in `promptfoo` translate between promptfoo's exported eval JSON and EvalPort, so a suite authored in promptfoo can be graded elsewhere and vice versa.

All converters are exported from the package root:

```javascript
const promptfoo = require('promptfoo');
```

## Export a test suite

```javascript
import { promptfooTestsToEvalPortSuite, validateEvalPortSuite } from 'promptfoo';

const suite = promptfooTestsToEvalPortSuite(config.tests, { suiteId: 'my_eval' });
console.log(validateEvalPortSuite(suite).valid); // true
```

Each `assert` entry becomes its own EvalPort grader (`assert-set` groups are expanded, not averaged away). `vars` are flattened to the EvalPort `input` string, with the original record preserved under `metadata.promptfoo.vars` for a lossless round-trip.

## Export eval results

```javascript
import { evaluateSummaryToEvalPortResultSet, validateEvalPortResultSet } from 'promptfoo';

const summary = JSON.parse(fs.readFileSync('results.json', 'utf8')); // promptfoo eval -o results.json
const resultSet = evaluateSummaryToEvalPortResultSet(summary, {
  suiteId: 'my_eval',
  runId: 'run-1',
});
console.log(validateEvalPortResultSet(resultSet).valid); // true
```

Each `gradingResult` (including every `componentResults` entry) becomes its own `GraderResult`, and scores are clamped to the EvalPort `[0, 1]` range. When several results share a `testIdx` (multiple prompts, providers, or repeats), repeated rows carry an `attempt` number so each stays uniquely identifiable.

Pass the same `suite` used for the suite export to reuse its grader IDs, so consumers can join results back to the graders that produced them:

```javascript
const resultSet = evaluateSummaryToEvalPortResultSet(summary, {
  suiteId: 'my_eval',
  suite,
  runId: 'run-1',
});
```

## Import

```javascript
import { evalPortSuiteToPromptfooTests } from 'promptfoo';

const tests = evalPortSuiteToPromptfooTests(suite); // runnable via `promptfoo eval`
```

## Assertion mapping

| promptfoo assertion                                                                                | EvalPort grader                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `equals`                                                                                           | `exact_match`                                   |
| `contains`, `icontains`                                                                            | `contains`                                      |
| `regex`, `starts-with`                                                                             | `regex`                                         |
| `similar`, `similar:cosine`, `bleu`, `rouge-n`, ...                                                | `semantic_similarity`                           |
| `llm-rubric`, `g-eval`, `model-graded-factuality`, `answer-relevance`, `context-faithfulness`, ... | `llm_judge`                                     |
| everything else (`javascript`, `python`, `webhook`, ...)                                           | `custom` (`params.handler: "promptfoo:<type>"`) |

`not-<type>` keeps its mapping with `inverse: true` recorded in grader metadata. Framework-native graders with no promptfoo equivalent import without a fabricated assertion; they are preserved under `metadata.promptfoo.evalportGraders`.
