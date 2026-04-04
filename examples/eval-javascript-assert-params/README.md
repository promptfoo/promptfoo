# eval-javascript-assert-params (JavaScript Assertion Params)

## What this demonstrates

Prototype for comparing two ways to parameterize `type: javascript` assertions.

The recommended pattern uses assertion-local `config` values and reads them from
`context.config` inside the JavaScript assertion. That keeps prompt/test vars
focused on prompt rendering data and allows the same assertion script to run
with different parameters in the same test case.

## Environment Variables

No environment variables are required to run this example.

```bash
npx promptfoo@latest init --example eval-javascript-assert-params
cd eval-javascript-assert-params
```

Run the config-based version:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
```

Run the test-vars workaround version for comparison:

```bash
promptfoo eval -c promptfooconfig.test-vars.yaml --no-cache
```
