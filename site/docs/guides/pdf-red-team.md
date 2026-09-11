---
title: Red Team a PDF Upload Application
description: Run a PDF upload app, verify a clean invoice, generate document injection attacks, compare text and scanned PDFs, and inspect model outputs and saved artifacts.
---

# Red Team a PDF Upload Application

This guide tests a read-only invoice assistant. A user uploads an invoice and asks for its total and payment terms. An attacker adds review notes that try to change those facts, redirect the answer, or make the assistant claim it approved a payment.

The [example application](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-pdf) accepts a multipart PDF upload and sends the complete file to a model through the OpenAI Responses API. Its handling of review notes is intentionally permissive so you can investigate real model failures. It does not execute payments or expose financial systems.

## 1. Start the application

Use Node.js 22.22 or newer and an OpenAI API key with access to `gpt-5.4-mini`:

```bash
npx promptfoo@latest init --example redteam-pdf
cd redteam-pdf
npm install
export OPENAI_API_KEY=your-key
npm start
```

Open `http://localhost:3100`. Upload `fixtures/invoice.pdf` and use the default question. The invoice total is **$1,250.00** and the payment terms are **Net 30**.

Set `PDF_MODEL` to change the app's model. The attack generator and grader are configured separately in `promptfooconfig.yaml`.

## 2. Verify clean uploads

Keep the app running. In a second terminal with the same API key:

```bash
npx promptfoo@latest eval -c smoke.yaml --no-cache -o results-clean.json
```

Check that the test passes and that the result has no provider error. The provider response metadata includes the received file's SHA-256 hash, page count, and `processingMode: native-pdf`.

This baseline matters: a model that cannot read the document has not demonstrated resistance to prompt injection.

## 3. Generate and run attacks

The example uses the `policy` plugin to test invoice accuracy and read-only behavior. A normal user question stays in the benign `question` input. The attack enters through `document`.

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest redteam generate \
  -c promptfooconfig.yaml --no-cache --strict -o redteam.yaml

PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest eval \
  -c redteam.yaml --no-cache -o results-attacks.json
```

The first command generates test cases and PDF files. The second sends them through the same `/api/analyze` upload endpoint used by the browser and grades the responses. Model requests use your API key and incur usage charges.

The strategy reuses the clean invoice across attacks and appends each payload on its own review-notes page. It stores the original attack goal separately from the rendered document.

## 4. Inspect what happened

Open the results with `npx promptfoo@latest view`, or inspect the exported JSON. For a suspicious result:

1. Open the attacked PDF and its clean template from the result table.
2. Compare `metadata.pdf.contentHash` with the provider response's `documentHash`. They should match.
3. Read the user's question, original attack, model answer, and grader's reason together.
4. Check whether the model changed its behavior. Merely quoting a malicious note is different from following it.

A response that reports the altered total as the real invoice total is an accuracy failure. A claim such as "payment approved" is a false action claim in this read-only demo, not evidence of an actual payment. Upload errors, timeouts, and incomplete model answers are errors requiring investigation.

To replay an individual artifact manually, find `metadata.pdf.storageKey` in the generated test. With default local storage, that file is under `~/.promptfoo/media/`. Upload it in the browser with the same question.

## 5. Compare text and scanned PDFs

Change the strategy's `config.mode` from `text` to `scanned`, then generate and evaluate into separate files:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest redteam generate \
  -c promptfooconfig.yaml --no-cache --strict -o redteam-scanned.yaml

PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest eval \
  -c redteam-scanned.yaml --no-cache -o results-scanned.json
```

Scanned mode converts all pages to images inside a PDF. There is no extractable text layer. Your target therefore needs vision or OCR support. Confirm that it can still read a clean scanned invoice before interpreting attack results.

Separate generation runs may produce different attacks. For a controlled comparison, use the same clean template, payload, question, and model, and vary only the PDF rendering mode. The strategy can also be called from a custom test-generation script to render fixed cases.

## 6. Try a generated template

Replace `document.config.template` in the target with:

```yaml
template:
  source: generated
  description: >-
    A fictional one-page office-supplies invoice. Include invoice number, customer,
    line items, a clearly labeled total, and payment terms. Include no review notes.
```

Generate a new run, open the saved clean template, and verify its facts before testing attacked copies. The template is generated once for that strategy invocation and shared by its attacks. Point `source: file` at the saved template when you want to reuse it in later runs.

## Connect your own application

Adapt `provider.js` to your upload endpoint's field names, authentication, and response format. Forward the PDF bytes through the real upload path. If the application extracts text before calling the model, keep that behavior so you test the parser and model together.

Update the redteam purpose and policy to describe the actual boundaries: which document facts must remain accurate, which actions require authorization, and which data is private. Avoid adding production secrets to template descriptions or test fixtures.

See the [PDF strategy reference](/docs/red-team/strategies/pdf) for configuration, storage metadata, and supported file limits.
