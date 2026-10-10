# ismalicious-gate (External Security Gate Assertion)

Evaluate text outputs with the IsMalicious Gate API using an asynchronous JavaScript assertion. The `echo` provider supplies fixed text so this example needs no LLM subscription. You can replace it with your application's provider to evaluate actual outputs.

## Setup

```sh
npx promptfoo@latest init --example ismalicious-gate
cd ismalicious-gate
```

Create an [IsMalicious account](https://ismalicious.com/app/account) and obtain the API key and secret. Set `ISMALICIOUS_API_KEY` and `ISMALICIOUS_API_SECRET` in your environment or an untracked `.env` file. Keep credentials out of the YAML, prompts and test variables, which can appear in exported evaluation results.

```sh
npx promptfoo@latest eval --env-file .env --no-cache -o results.json
```

Each non-empty text output is sent in full to `https://api.ismalicious.com/gate/scan`. Only submit material you are authorized to share with this external service. The request uses `mode: fast`, verified TLS, a 15-second timeout, no redirects and no retry on quota failures. These requests use the separate scan quota. See [Gate API schema](https://api.ismalicious.com/openapi.json) for the current product contract.

## Reading results

The assertion passes only for a valid `allow` response with no truncated link inspection. `warn`, `block`, timeout, missing credentials, HTTP errors, malformed responses and unsupported outputs fail the assertion. The complete serialized request must fit within 1 MiB; the example rejects larger inputs without truncation.

The score is a policy result (1 or 0), not the detector's confidence or an indicator risk score. `allow` means the gate did not block under its current rules. It does not prove the text or its links are benign. The reason reports the number of links with unknown reputation.

The three text cases are exploratory inputs. There are no fabricated expected production verdicts or accuracy claims. Review the exported results, particularly the quoted-instruction case, before drawing conclusions. A nonzero evaluation exit code can represent a correctly refused output; inspect the reason to distinguish a detector verdict from an HTTP or configuration failure.

This is an evaluation assertion. It does not intercept a tool call, prevent a prior network fetch, or enforce a policy in your production application. Objects, binary outputs and streaming are outside this example's scope. Existing Promptfoo evaluation records may contain the original output even when the assertion fails. The assertion itself reports fixed reasons and never returns raw scan content, API credentials or upstream exception messages.

To supply a public source URL, set assertion-level configuration:

```yaml
assert:
  - type: javascript
    value: file://gate-assertion.cjs
    config:
      source_url: https://example.com/retrieved-document
```

The original URL is preserved. Credential-bearing or non-HTTP(S) source URLs are rejected.

## Offline validation for contributors

From the Promptfoo repository root, install dependencies using its configured Node version and run:

```sh
npm test -- test/assertions/ismaliciousGate.test.ts
npm run local -- eval -c examples/ismalicious-gate/promptfooconfig.yaml --no-cache -o results.json
```

The second command needs real Gate credentials. The unit tests also exercise the native JavaScript assertion handler against synthetic protocol fixtures, including errors and refusal. Their fixtures demonstrate response handling, not real detector accuracy.
