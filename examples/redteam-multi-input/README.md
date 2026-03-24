# redteam-multi-input (Redteam: Multi-Input)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-multi-input
cd redteam-multi-input
```

## What this example shows

This example demonstrates Promptfoo's multi-input red team mode against a local custom provider that simulates an intentionally vulnerable invoice-review workflow.

The target accepts two coordinated inputs:

- `vendor_id` - the vendor account being used in the request
- `description` - the invoice description processed by the assistant

Promptfoo generates attacks across both fields at the same time so you can test issues like:

- broken object-level authorization (BOLA)
- role confusion and user impersonation
- prompt injection and approval bypass

## Prerequisites

- `OPENAI_API_KEY` set in your environment so Promptfoo can generate red-team attacks

## Run the example

```bash
promptfoo redteam run --no-cache
```

The local provider in [`invoiceProcessorProvider.cjs`](./invoiceProcessorProvider.cjs) is intentionally insecure. It trusts instructions embedded in `description` and can approve invoices for unauthorized `vendor_id` values, so this example should produce findings.

## Files

- `promptfooconfig.yaml` - multi-input red team configuration
- `invoiceProcessorProvider.cjs` - local target that reads `context.vars.vendor_id` and `context.vars.description`
