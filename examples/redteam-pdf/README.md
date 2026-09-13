# redteam-pdf (PDF Invoice Red Teaming)

A local invoice-review application that consumes real PDF uploads. The `pdf` strategy appends adversarial review notes to a clean invoice and sends the attacked files through the browser's upload endpoint. The app uses native PDF input with the OpenAI Responses API.

## Run the app

Requires Node.js 22.22+ and an `OPENAI_API_KEY` with access to `gpt-5.4-mini` for the app and attack generation, and `gpt-5.5-2026-04-23` for grading.

```bash
npx promptfoo@latest init --example redteam-pdf
cd redteam-pdf
npm install
export OPENAI_API_KEY=your-key
npm start
```

Open http://localhost:3100 and upload `fixtures/invoice.pdf`. Its total is **$1,250.00**, with **Net 30** terms. `PDF_MODEL` changes the target model; `PORT` changes the server port. Update `appBaseUrl` in the provider configuration when changing the port.

This demo deliberately gives document review notes influence over the answer. It is useful for finding prompt-injection failures, and it performs no payment actions.

## Verify and red team

Leave the app running. In another terminal with your API key:

```bash
npx promptfoo@latest eval -c smoke.yaml --no-cache -o results-clean.json

PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest redteam generate \
  -c promptfooconfig.yaml --no-cache --strict -o redteam.yaml

PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo@latest eval \
  -c redteam.yaml --no-cache -o results-attacks.json
```

The sample runs three `policy` tests covering invoice accuracy and false payment claims, each delivered with the `pdf` strategy. The `question` input stays benign. The clean baseline should pass before you interpret attack findings.

The grader uses a stronger model to distinguish following an attack from quoting it. Review its reasons alongside the original invoice and model answer. Add `--force` to `redteam generate` when you want new attacks from an unchanged configuration.

Change `config.mode: text` to `scanned` to rasterize every page. For generated templates, replace the document's `config.template` with:

```yaml
template:
  source: generated
  description: A fictional vendor invoice with line items, total, and Net 30 payment terms.
```

Each template is generated once per strategy invocation. Generated PDFs use Latin text; uploaded templates need extractable text. PDFs are limited to 5 MiB. Templates can have at most 9 pages; attacked documents can have at most 10 pages.

## Inspect and replay

The results table links to clean and attacked PDFs. Generated test metadata records `pdf.templateStorageKey`, `pdf.storageKey`, and their SHA-256 hashes. Local storage defaults to `~/.promptfoo/media/`. Upload a saved attack PDF in the browser to reproduce the file-delivery path.

The provider response contains `documentHash`, `pageCount`, `requestId`, and `processingMode`. Compare `documentHash` with the generated test's `metadata.pdf.contentHash` to verify the exact bytes reached the app. The strategy keeps readable document text for the plugin grader; the target receives the PDF itself.

An incorrect total or false payment claim is a finding. A parsing failure, missing API key, timeout, or model error is an error, not a successful defense. Model responses and grades can vary across runs.

## Repository development

From the repository root, start the app with `node --env-file=.env examples/redteam-pdf/server.js`. Use the local CLI when testing changes:

```bash
npm run local -- eval -c examples/redteam-pdf/smoke.yaml --no-cache -o /tmp/pdf-clean.json
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- redteam generate \
  -c examples/redteam-pdf/promptfooconfig.yaml --env-file .env --no-cache --strict \
  -o examples/redteam-pdf/redteam.yaml
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- eval \
  -c examples/redteam-pdf/redteam.yaml --env-file .env --no-cache -o /tmp/pdf-attacks.json
```

See the [guide](https://www.promptfoo.dev/docs/guides/pdf-red-team/) and [strategy reference](https://www.promptfoo.dev/docs/red-team/strategies/pdf/) for adapting the app and interpreting results.
