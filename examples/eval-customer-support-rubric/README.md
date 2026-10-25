# eval-customer-support-rubric (Customer support rubric with severity gating)

Scores a support assistant's replies on five quality dimensions at once, and fails
high-severity tickets on a single failed dimension regardless of how the rest of
the reply scores.

The five dimensions, each reported as a named metric:

| Metric         | Question it answers                                              |
| -------------- | ---------------------------------------------------------------- |
| `correct`      | Is the reply factually right for this ticket?                    |
| `resolved`     | Does it resolve the issue or give the exact steps?               |
| `honest`       | Does it stay honest (no invented policies, no overpromising)?    |
| `handoff`      | Does it hand off to a human exactly when the ticket needs one?   |
| `language_fit` | Is it written in the customer's language, in a natural register? |

## How the severity gate works

Test cases live in `tests.csv` with a `__metadata:severity` column. The same
file carries the gate:

- high-severity rows leave `__threshold` empty: any single dimension below its
  `threshold: 0.8` fails the whole test, even if every other dimension is
  perfect.
- medium and low rows set `__threshold` to `0`: the five scores are still
  computed and reported per metric, but one weak dimension does not fail the
  ticket.

The second and fifth test cases are deliberately flawed replies (an invented
cancellation fee; a promised forever-discount). A failed dimension fails the
high-severity case, while the medium-severity case records the failure in its
metric breakdown. Actual scores depend on the grader; other replies can also
receive low scores for unsupported claims or missing details.

## Running it

Initialize the example and enter its directory:

```sh
npx promptfoo@latest init --example eval-customer-support-rubric
cd eval-customer-support-rubric
```

The `echo` provider stands in for the bot: it returns the canned `reply` column
of each CSV row, so the only API key you need is the one that grades the
rubrics (`openai:gpt-6-luna` in `defaultTest.options.provider`). Set
`OPENAI_API_KEY` in an untracked `.env` file, then run:

```sh
npx promptfoo@latest eval -c promptfooconfig.yaml --env-file .env --no-cache -o results.json
```

To reuse the harness against a real assistant, replace the `echo` provider with
your bot and replace `prompt.txt` with an input prompt, for example:

```text title="prompt.txt"
Account context: {{context}}
Customer message: {{customer_message}}
Reply in {{language}}. Use only the supplied account facts and do not claim an action was completed unless the context confirms it.
```

Then remove the canned `reply` column from the CSV. The rubrics already use
`customer_message`, `context`, and `language`, so the grading side needs no changes.

## API-key-free handoff contract companion

The rubric above grades reply quality with a model. The companion
`promptfooconfig.handoff.yaml` instead demonstrates deterministic checks on
structured handoff decisions, using `echo` and nine synthetic recorded outputs.
It makes no model or grading API calls and requires no credentials.

After initializing this example, run:

```sh
npx promptfoo@latest eval -c promptfooconfig.handoff.yaml --no-cache -o handoff-results.json
```

For contributors, run from the repository root against the local build:

```sh
npm run local -- eval -c examples/eval-customer-support-rubric/promptfooconfig.handoff.yaml --no-cache -o handoff-results.json
```

The expected result is nine passing cases with no provider errors. Inspect the
exported JSON, not only the process exit code.

The illustrative policy requires a handoff when the customer asks for a person,
applicable sources are missing or conflicting, or a business exception needs
approval. A handoff is `accepted` only if an authorized receiver has the context
and acknowledges it. Otherwise it remains `pending`. Receiving context, queue
assignment and acknowledging receipt are not business approval; the fixtures
never approve a refund, price or delivery promise.

The JSON-schema assertion checks the output shape. The JavaScript assertion
checks decisions against the input facts and fails closed on missing or
wrongly typed facts. Changing `handoffRequired`, marking a pending transfer
`accepted`, or setting `businessApproved` to true should fail the contract.

These are assertion examples, not evidence of a model's accuracy or a real
handoff. Other policies may ask a clarifying question instead of immediately
escalating a missing-source case; adapt the contract to the assistant's actual
scope. To evaluate your assistant, replace `echo` and the recorded-output prompt
with your approved provider and an input prompt containing the case facts, then
remove `recorded_response`. Keep receiver authority and acknowledgement as
externally observed facts, not values the model can authorize for itself.
Do not send real customer records or credentials to a new provider without the
appropriate permission, and check its costs before running it.

Based on an evaluation study of Spanish telecoms and energy support chatbots:
https://github.com/kakkarprerna/support-bot-eval
