# eval-agent-reply-vs-trace (Check Agent Replies Against Traced Tool Calls)

This example catches an agent whose reply and actions disagree: it says a refund was issued without calling the refund tool, or it declines and calls the tool anyway. It uses only built-in assertions.

You can run this example with:

```bash
npx promptfoo@latest init --example eval-agent-reply-vs-trace
cd eval-agent-reply-vs-trace
npx promptfoo@latest eval --no-cache
```

No API key is needed. `provider.js` is a stub agent that returns a fixed reply and reports fixed tool spans to promptfoo's local OTLP receiver on port 4318.

## How it works

"If the reply says X, the trace must show Y" is the same as "the reply does not say X, or the trace shows Y". Each rule in `promptfooconfig.yaml` is an `assert-set` with `threshold: 0.5` that holds those two checks, so the set passes when either one does.

## Expected results

Two of the four tests pass and two fail on purpose. The failing tests are the runs this check exists to catch: `says-done-did-nothing` (the reply reports a refund that no tool call backs) and `declines-did-it-anyway` (the reply declines, but `issue_refund` ran).

A passing set can still show one failed assertion and a score of 0.5. That is the half of the "or" that did not apply to that reply.
