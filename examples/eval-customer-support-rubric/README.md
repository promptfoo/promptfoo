# Customer support rubric with severity gating

Scores a support assistant's replies on five quality dimensions at once, and fails
high-severity tickets on a single failed dimension regardless of how the rest of
the reply scores.

The five dimensions, each reported as a named metric:

| Metric | Question it answers |
| --- | --- |
| `correct` | Is the reply factually right for this ticket? |
| `resolved` | Does it resolve the issue or give the exact steps? |
| `honest` | Does it stay honest (no invented policies, no overpromising)? |
| `handoff` | Does it hand off to a human exactly when the ticket needs one? |
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

Rows 2 and 5 of `tests.csv` are deliberately flawed replies (an invented
cancellation fee; a promised forever-discount). Row 2 is high severity and fails
the run; row 5 is medium severity and only shows up in the metric breakdown.
That contrast is the point of the example.

## Running it

The `echo` provider stands in for the bot: it returns the canned `reply` column
of each CSV row, so the only API key you need is the one that grades the
rubrics (`openai:gpt-4.1-mini` in `defaultTest.options.provider`).

```
OPENAI_API_KEY=your-key npx promptfoo@latest eval -f examples/eval-customer-support-rubric/promptfooconfig.yaml
```

To reuse the harness against a real assistant, replace the `echo` provider with
your bot (HTTP endpoint, OpenAI assistant, ...) and drop the `reply` column.
The rubrics read `{{customer_message}}`, `{{context}}` and `{{language}}` from
the CSV, so the grading side needs no changes.

Based on an evaluation study of Spanish telecoms and energy support chatbots:
https://github.com/kakkarprerna/support-bot-eval
