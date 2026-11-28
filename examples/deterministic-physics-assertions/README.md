# deterministic-physics-assertions (Deterministic Physics Assertions)

This example demonstrates how to use custom Python assertions to
deterministically validate physical measurements passed to an MCP tool.

It uses no LLM-based judgment and requires no additional assertion
provider or external validation package.

Author: Muhammad Tahmid Ahnaf (@builtbyahnaf) (https://github.com/builtbyahnaf)

## What it demonstrates

The example validates MCP tool arguments against a small, versioned
set of deterministic rules:

- Probability values must be between 0 and 1 (inclusive).
- Physical measurements must be non-negative.
- NaN and Infinity values are rejected.
- Boolean values are not accepted as numeric measurements.
- Missing recognized measurement fields are rejected.

The validator reports PASS or FAIL based only on these rules.

## Project structure

- `physics-server.js`: A minimal MCP server that receives measurements.
- `assertions/physics_bounds.py`: The custom Python assertion.
- `promptfooconfig.yaml`: Evaluation configuration and test cases.
- `package.json`: Declares the example's Node.js module configuration.

## Run the example

### Prerequisites

- Node.js and npm
- Python 3.8 or newer, available on your `PATH` as `python`

Initialize the example:

```bash
npx promptfoo@latest init --example deterministic-physics-assertions
```

Navigate into the generated directory and run:

```bash
npm install
npx promptfoo@latest eval
```

## Ruleset versioning

The validator currently uses ruleset version `1.0.0`.

Changes to the validation rules should be intentional and accompanied
by an appropriate ruleset version update to make results reproducible.

## Scope and limitations

This is an illustrative, focused ruleset, not a comprehensive physics
validation system.

It validates only the explicitly recognized measurement fields.
It does not assess scientific correctness, contextual plausibility,
or whether a measurement makes sense in a particular physical scenario.

The validator expects recognized measurement values to be numeric
values, not numeric strings. For example, `"0.5"` is rejected even
though it represents a valid numeric value.

Unrecognized fields are ignored. For example, a valid
`mass_kg: 12` value will pass even if the same input also contains
an unrecognized field such as `speed_km_s: 999999`.

All verdicts are deterministic and independent of model judgment.
