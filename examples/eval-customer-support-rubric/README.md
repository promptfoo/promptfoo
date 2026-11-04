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

Based on an evaluation study of Spanish telecoms and energy support chatbots:
https://github.com/kakkarprerna/support-bot-eval
