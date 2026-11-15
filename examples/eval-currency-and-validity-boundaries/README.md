# eval-currency-and-validity-boundaries (Evaluating Currency and Validity Boundaries)

This example demonstrates how to evaluate structured model outputs containing financial calculations, ISO 4217 currency codes, and temporal validity boundaries without relying on non-deterministic LLM judges or paid API keys.

## Quickstart

Initialize this example in your project:

```bash
npx promptfoo@latest init --example eval-currency-and-validity-boundaries
```

Run the evaluation:

```bash
npm run local -- eval -c promptfooconfig.yaml
```

Or export the results to JSON:

```bash
npm run local -- eval -c promptfooconfig.yaml -o output.json --no-cache
```

## Overview

When testing LLM agents and workflows that generate invoices, financial quotes, or time-sensitive agreements, standard string matching or fuzzy LLM rubrics can produce false passes and flaky evaluations:

1. **Floating-point inaccuracies**: Standard floating-point arithmetic (e.g. `0.1 + 0.2 === 0.30000000000000004`) causes naive calculators to fail or accept incorrect rounded results. Using integer cents arithmetic guarantees exact comparison.
2. **Currency code confusion**: A model might return the correct numeric amount (e.g. `150.00`) but with the wrong currency code (`USD` instead of `EUR`). Exact ISO 4217 validation rejects cross-currency false positives.
3. **Temporal UTC boundaries**: Time-sensitive contracts and quotes must be validated against strict UTC boundaries (testing edge moments immediately before, at, and after the cutoff timestamp).

## Configuration

The evaluation config `promptfooconfig.yaml` connects test cases with deterministic JavaScript assertion handlers in `assert-boundary.cjs`:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Deterministic evaluation of exact money, currency codes, and UTC validity boundaries

prompts:
  - '{{query}}'

providers:
  - echo

tests:
  - description: Exact USD total with floating-point sensitive items
    vars:
      query: '{"currency":"USD","items":[{"description":"Consulting","amount":"19.99"},{"description":"Processing fee","amount":"0.05"},{"description":"Regulatory surcharge","amount":"1.40"}],"total":"21.44"}'
      expectedCurrency: USD
      expectedTotal: '21.44'
    assert:
      - type: javascript
        value: file://assert-boundary.cjs:validateExactMoney
```

## Running Offline

All tests in this example execute locally with zero external network requests using the built-in `echo` provider, ensuring fast, deterministic, and free CI validation.
