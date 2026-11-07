# redteam-obfuscation (Obfuscation and Normalization Bypass)

This example shows how a support application's raw-text input filter can miss a request that its downstream application decodes or normalizes. The target is intentionally vulnerable and uses only fictional customer data.

## Setup

```bash
npx promptfoo@latest init --example redteam-obfuscation
cd redteam-obfuscation
```

No API key or external model is required. The `intent` plugin supplies fixed attack prompts, `target.js` provides the vulnerable target, and Promptfoo's built-in `echo` provider grades results locally.

## Run the red team

Generate the baseline and obfuscated attack variants:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest redteam generate \
  -c promptfooconfig.yaml -o redteam.yaml --force --no-cache
```

Run the generated attacks and save their complete rollouts:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest redteam eval \
  -c redteam.yaml -o results.json --no-cache
```

The evaluation intentionally reports failures because the example contains real, reproducible authorization bypasses against its simulated application. All exposed customer details and recovery tokens are synthetic.

## What the attacks demonstrate

The gateway blocks the unmodified phrases `customer record`, `recovery code`, `billing address`, and `account secret`. It does not normalize Unicode, whitespace, casing, or substitution alphabets before checking those rules.

The downstream application does normalize or decode the input. When the reconstructed request asks for customer data, it returns the fictional recovery token `ACME-DEMO-TOKEN-7F3A` without repeating the authorization check.

The configuration exercises:

- `zero-width`, `unicode-noise`, and `zalgo` to separate protected characters with invisible or combining marks.
- `whitespace-obfuscation` to replace the ASCII spaces expected by the gateway.
- `random-case` to bypass case-sensitive matching.
- `bijection` to translate the request into two independently seeded digit-substitution variants.
- `homoglyph` as a negative control: the example application does not normalize cross-script lookalikes, so those requests do not reach the sensitive operation.

Each provider response includes a JSON rollout in its `raw` field. Successful attacks show the gateway allowing the request, the application reconstructing its intent, and an unauthorized customer lookup executing.

Inspect those rollouts with:

```bash
jq '.results.results[] | {strategy: (.testCase.metadata.strategyId // "basic"), passed: .success, rollout: (.response.raw | fromjson)}' results.json
```
