---
title: PDF Red Team Strategy
sidebar_label: PDF
description: Test prompt injection through PDF uploads with reusable clean templates, appended review notes, native file delivery, and text or scanned document variants.
---

# PDF Strategy

The `pdf` strategy embeds an attack in a PDF attachment. Use it to test whether a document-reading application follows instructions in an uploaded document instead of the user's request.

Each test appends a **Review notes** section to a copy of a clean template. The original pages stay in place. Choose an existing PDF or let the configured redteam generation provider write a clean template. The provider sees the template description; attack payloads are added afterward by the renderer.

For a runnable upload application, start with the [PDF red teaming guide](/docs/guides/pdf-red-team).

## Configuration

Declare the document as a [typed input](/docs/red-team/multi-input), and keep the user's question benign:

```yaml
targets:
  - id: file://provider.js
    inputs:
      document:
        type: pdf
        description: Instructions placed in an invoice's review notes
        config:
          template:
            source: file
            path: file://fixtures/invoice.pdf
      question:
        description: A normal question about the invoice total
        config:
          benign: true

redteam:
  strategies:
    - id: pdf
      config:
        input: document
        mode: text
    - id: basic
      config:
        enabled: false
```

Paths resolve relative to the configuration file. Disable `basic` if the target requires the templated PDF variants exclusively.

### Generated templates

Replace the input's `config.template` with:

```yaml
template:
  source: generated
  description: >-
    A one-page fictional vendor invoice for office supplies. Include an invoice
    number, customer, line items, total, and Net 30 payment terms.
```

The strategy prepares one template per distinct template configuration in an invocation and reuses it across its tests. A new generation run can produce a different template. For reproducible comparisons, save the generated clean PDF and use it with `source: file` in subsequent runs.

When `template` is omitted, the strategy generates a clean document using the input description. Single-input targets can use `pdf` with `redteam.injectVar`; they receive a generated business-report template.

### Strategy options

| Option  | Default                                                              | Description                                                                                                  |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `input` | The only PDF input, or `redteam.injectVar` for a single-input target | Input variable that receives the PDF. Required when multiple PDF inputs exist.                               |
| `mode`  | `text`                                                               | `text` preserves extractable text. `scanned` rasterizes every page, including the template and review notes. |

The initial strategy always appends review notes on new pages. Do not set `config.injectionPlacements` on this input; that setting belongs to the basic typed-input renderer. A benign PDF input cannot be selected for attack.

## Sending the PDF to your target

The provider receives `context.vars.document` as a complete `data:application/pdf;base64,...` URI. For native file APIs, forward it as the API's file input. For multipart upload APIs, decode it into bytes and attach it as a file:

```javascript
const bytes = Buffer.from(context.vars.document.split(',')[1], 'base64');
const form = new FormData();
form.set('document', new Blob([bytes], { type: 'application/pdf' }), 'invoice.pdf');
form.set('question', context.vars.question);
const response = await fetch('http://localhost:3100/api/analyze', {
  method: 'POST',
  body: form,
});
```

Do not interpolate the URI into a text-only prompt. This tests text handling rather than the application's PDF ingestion. Loading a PDF using `vars: { document: file://invoice.pdf }` normally [extracts its text](/docs/configuration/guide); it is a different workflow.

## Artifacts and grading

Clean and attacked PDFs are saved through the configured media storage provider. In local storage, they live under `~/.promptfoo/media/document/`, or `PROMPTFOO_MEDIA_PATH`. Generated test variables also retain the PDF data URI for replay.

Set `PROMPTFOO_INLINE_MEDIA=true` to skip separate media-storage writes. Attacked PDF bytes remain in test variables, and the results table provides a download link. Clean-template text and hashes remain in metadata; storage keys are absent. Generated configuration files and saved evaluation results can still contain the inline PDF.

Each test's `metadata.pdf` records `input`, `mode`, readable `text`, `templateText`, `templateStorageKey`, `templateHash`, `storageKey`, and `contentHash`. Hashes are computed directly from PDF bytes and use `sha256:<hex digest>` identifiers so exports distinguish them from opaque credentials. The result table links to the attacked PDF and clean template when those storage files remain available.

The strategy preserves the plugin's assertions and attack goal. Redteam graders receive the readable document and companion inputs. Companion DOCX inputs include the rendered wrapper body and rewritten instructions in their grading context. Other companion attachments use their recorded readable content when available; otherwise, the grader sees an explicit omitted-attachment marker. Attachment bytes are excluded from the grading prompt. `metadata.originalText` retains the injected payload. Scanned-mode grading uses the text used to render the PDF; the target must actually support visual PDF reading or OCR.

## Limits

- Standalone, single-turn generation only. Configure `pdf` directly under `redteam.strategies`; it can run alongside other strategies, but cannot be a step inside `layer`. Multi-turn runtime PDF transforms are rejected.
- Templates must be unencrypted PDFs with extractable text. Image-only source templates are not supported; generate image-only output with `mode: scanned`.
- Extracted template text and newly rendered text are each limited to 50,000 characters. Oversized text is rejected before it is retained for grading.
- Input and output files are limited to 5 MiB and 10 pages, including appended notes. Page dimensions must be between 1 and 20 inches.
- New text uses Helvetica's Latin character set. Unsupported characters cause an error instead of disappearing. Existing template fonts remain intact in text mode.
- Rendering and template-generation errors stop the transformation. There is no text-disguised-as-PDF fallback. Editing signed documents invalidates their signatures; forms, annotations, embedded files, and active PDF content are outside this strategy's coverage.

For broad coverage, combine the strategy with plugins appropriate to your application's policy. Test clean documents first so ingestion failures do not look like successful defenses.
