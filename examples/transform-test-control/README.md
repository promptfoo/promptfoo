# transform-test-control (Transform-Controlled Test Outcomes)

You can run this example with:

```bash
npx promptfoo@latest init --example transform-test-control
cd transform-test-control
```

This example shows how a transform can decide whether a test passes or fails by returning a `testResult` object with the explicit `transformCanSetTestResult` opt-in. It uses the built-in `echo` provider, so no API keys are required.

## Usage

Run the eval:

```bash
promptfoo eval
```

The transform in `transform.js` treats harmful requests as passing only when the output looks blocked, and benign requests as passing only when the output is allowed.
