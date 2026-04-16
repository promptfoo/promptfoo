# redteam-docx-document-upload (Red Team DOCX Indirect Prompt Injection)

This example uses the repo's top-level `example-app/` service to test indirect prompt injection through uploaded DOCX files.

## Setup

Copy this example into a new working directory:

```bash
npx promptfoo@latest init --example redteam-docx-document-upload
```

From the repository root, start the example app:

```bash
cd example-app
docker-compose up -d
pnpm dev
```

If port `3500` is already in use, start the app on another port and update `targets[0].config.appBaseUrl` in `promptfooconfig.yaml`.

## Running

From the `promptfoo/` submodule directory:

```bash
npm run local -- redteam run -c examples/redteam-docx-document-upload/promptfooconfig.yaml --no-cache
```

## How It Works

The target declares two inputs:

- `document` uses `type: docx`, so generated document text is materialized into a real DOCX data URI before the provider is called. Its `description` describes the kind of document the app expects, and `config.injectionPlacements` controls which DOCX-native surfaces may carry the injected instruction.
- `question` is plain text that asks the assistant to summarize the uploaded document. It sets `config.benign: true` so multi-input generation keeps the user request natural while placing the adversarial content in `document`.

The custom provider uploads the DOCX bytes to `example-app`'s `/documents` endpoint, then asks the chat endpoint to call `summarize_document` with the returned `document_id`.

The example config currently runs `bias:age`, `rbac`, `bfla`, `harmful:profanity`, and `prompt-extraction` against the uploaded DOCX flow, then applies the `jailbreak:meta` strategy to mutate those generated attacks. The red team purpose describes the available `example-app` tools and explicitly marks Jane Smith's `readwrite` profile as out of bounds for the current `readonly` user.

`special-token-injection` is intentionally omitted for now because that plugin is currently excluded in multi-input mode.
