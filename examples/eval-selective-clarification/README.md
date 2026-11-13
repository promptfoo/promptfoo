# eval-selective-clarification (Selective Clarification)

An offline example of evaluating **whether to ask a clarifying question**. Always
answering misses necessary questions; always asking interrupts answerable tasks.
This example reports both errors separately using existing JavaScript assertions,
named scores, and derived metrics. It adds no new assertion type.

## Run

Once this example is available in a published release:

```sh
npx promptfoo@latest init --example eval-selective-clarification
cd eval-selective-clarification
npx promptfoo@latest eval --no-cache -o results.json
```

To test this contribution from a repository checkout, install the repository
dependencies and run from its root:

```sh
npm run local -- eval -c examples/eval-selective-clarification/promptfooconfig.yaml --no-cache -o results.json
```

No API key, model download, or paid inference is required. The three providers
return fixed decisions. Deliberate failures are expected: the default CLI failure
threshold may give a nonzero exit code. Inspect the exported results rather than
treating that exit code as an installation error.

## Task contract and cases

Choose `clarify` when a parameter needed to perform the requested operation is
missing and no default or prior conversation is available. Otherwise choose
`answer`. There is no conversation history. Do not infer preferences or invent
missing inputs. This is a restricted decision task, not a universal policy for
helpful dialogue.

`cases.yaml` contains five synthetic missing/complete pairs (ten cases): meeting
timezone, translation language, conversion units, source text for a summary, and a destination folder.
The explicit missing-input wording makes the teaching cases easy to inspect; it
does not represent a naturalistic benchmark. Cases and initial labels were
AI-assisted. Review labels against your own application's contract before reuse.

Only `id` and `request` enter the prompt. The grader reads `expected` separately.
The recorded provider is a lookup table keyed by case ID, with two deliberate
mistakes. It demonstrates the accounting, **not** a trained model, an inference
algorithm, or evidence of generalization. Renaming case IDs requires updating
that fixture.

## Expected results

Positive means a clarification is needed. Rates use the relevant gold-label
subset, not the total number of cases.

| Fixture            | Correct / total | Missed / needs clarification | Unnecessary / answerable | Invalid / total |
| ------------------ | --------------- | ---------------------------- | ------------------------ | --------------- |
| Always answer      | 5 / 10          | 5 / 5                        | 0 / 5                    | 0 / 10          |
| Always clarify     | 5 / 10          | 0 / 5                        | 5 / 5                    | 0 / 10          |
| Recorded decisions | 8 / 10          | 1 / 5                        | 1 / 5                    | 0 / 10          |

The two constant baselines have identical accuracy and opposite failure modes.
For recorded decisions, accuracy is 0.8 and each conditional error rate is 0.2.
All 30 fixture rows should execute without provider errors; 18 pass and 12 fail
the decision assertion.

Malformed output or an unknown decision fails and increments `invalid`; it stays
in the total accuracy denominator. Invalid outputs are neither valid answers nor
valid clarification decisions, so inspect invalid rate alongside both conditional
error rates. Zero-denominator rates use 0 as a display convention: a zero count
means **no coverage**, not proof that the system handles that category.

## Adapt to a real system

1. Replace the fixed providers with your configured model or agent. Real inference
   may require credentials and incur costs.
2. Replace the fixture prompt with an instruction to return
   `{"decision":"answer"}` or `{"decision":"clarify"}` for the request. Do not
   include `expected`, the fixture lookup, or gold-label explanations in model input.
3. Review and expand the paired cases, including realistic ambiguity and explicit
   defaults. Keep a held-out set separate from prompt development.
4. Rerun and inspect invalid outputs as well as both error rates.

This evaluates the decision only. It does not judge whether a proposed question
would resolve the missing information, whether a direct answer is correct, or
whether multi-turn interaction improves task success. Those need separate
evaluations. Do not report the fixture scores as model results.
