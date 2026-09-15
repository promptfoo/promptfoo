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

Relative paths and `file://fixtures/invoice.pdf` references resolve from the configuration file. Absolute paths and standard local file URLs, such as `file:///path/to/invoice%20copy.pdf`, are also supported. Disable `basic` if the target requires the templated PDF variants exclusively.

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

When `template` is omitted, the strategy generates a clean document using the input description. Single-input targets can use `pdf` with `redteam.injectVar`; they receive a generated business-report template. If set, `config.input` must match that inject variable.

### Strategy options

| Option  | Default                                                              | Description                                                                                                  |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `input` | The only PDF input, or `redteam.injectVar` for a single-input target | Input variable that receives the PDF. Required when multiple PDF inputs exist.                               |
| `mode`  | `text`                                                               | `text` preserves extractable text. `scanned` rasterizes every page, including the template and review notes. |

The initial strategy always appends review notes on new pages. Do not set `config.injectionPlacements` on this input; that setting belongs to the basic typed-input renderer. A benign PDF input cannot be selected for attack.

## Sending the PDF to your target

The provider receives the PDF in the input selected by `config.input` or automatic selection. For example, `config.input: document` places a complete `data:application/pdf;base64,...` URI in `context.vars.document`; selecting `invoice` places it in `context.vars.invoice`. The upload example below uses `document`. Multi-input targets also receive the same PDF value in the combined `context.vars.__prompt` JSON, alongside their other declared inputs. For native file APIs, forward it as the API's file input. For multipart upload APIs, decode it into bytes and attach it as a file:

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

The combined input contains only declared fields present in the current attack. Unchanged companion attachments retain their bytes; changed readable companions are rendered again with the basic typed-input renderer. Supplied attachment data URIs are forwarded directly. Omitted companions do not retain values from earlier attacks.

Default A2A messages send the selected PDF as a native file and declared text companions as text. A rendered task matching one declared text input is included only once. That case sends a sole companion as plain text, or multiple companions as a JSON object; separately authored task instructions stay alongside the inputs.

Before agent-card discovery or delivery, the provider checks that the selected input is present, uses valid base64, is at most 5 MiB, and starts with the PDF file signature. Data URIs must declare `application/pdf`; MIME casing and surrounding whitespace are accepted. Native file parts use `application/pdf`. These format checks do not fully parse the PDF. Missing, empty, or invalid selected PDF inputs produce a provider error instead of a text-only request.

Other attachment test variables are replaced with placeholders in rendered task text: declared non-text fields support data URI or raw base64 values, and undeclared variables containing data URIs are also redacted. Other files are not automatically attached to the default A2A message. Literal text authored directly in the prompt and the legacy `question` fallback remain task text, including strings that resemble data URIs or base64. Put attachments in input variables to identify them as files. Custom message configurations control their own parts.

## Artifacts and grading

Clean and attacked PDFs are saved through the configured media storage provider. In local storage, they live under `~/.promptfoo/media/document/`, or `PROMPTFOO_MEDIA_PATH`. Generated test variables also retain the PDF data URI for replay. Keep attachments in this data URI format; the generic result exporter can redact long raw base64 strings as potential secrets. Storage errors stop generation so a run cannot silently lose its saved artifacts.

Set `PROMPTFOO_INLINE_MEDIA=true` to skip separate media-storage writes. Attacked PDF bytes remain in test variables, and the results table provides a download link. Clean-template text and hashes remain in metadata; storage keys are absent. Generated configuration files and saved evaluation results can still contain the inline PDF.

Each test's `metadata.pdf` records `input`, `mode`, readable `text`, `templateText`, `templateStorageKey`, `templateHash`, `storageKey`, `contentHash`, and `companionHashes`. The companion hash map records decoded bytes for declared non-text companions; `null` records an absent companion. Hashes are computed directly from PDF bytes and use `sha256:<hex digest>` identifiers so exports distinguish them from opaque credentials. The result table links to the attacked PDF and clean template when those storage files remain available. PDF and document responses from the media API use `Cache-Control: private, no-cache`, so shared caches must not store them and browser caches must revalidate them. Local storage also revalidates other media because its shortened hash keys can collide. Other media responses on the hash-key route use public immutable caching only when a custom storage provider declares `hasImmutableKeys: true` and its keys permanently identify the same bytes. Other custom storage responses remain private and revalidated. Direct provider URLs follow that provider's cache policy.

Before evaluation calls a target, it checks the selected PDF and declared companion attachments against their recorded hashes, including fields in a serialized `__prompt` input object. `transformVars` and other input edits may change text companions or use equivalent attachment encodings. Changing, adding, or removing a recorded attachment produces an error. Regenerate PDF tests to change a document so its artifact, readable grading text, and hash stay consistent.

The strategy preserves the plugin's assertions and attack goal. Redteam graders receive the rendered task prompt with known attachment variables replaced by placeholders, the readable document, and the target's declared companion inputs. Declare any text or attachment fields needed for grading in `inputs`. Undeclared test variables are not copied into the grading inputs, but authored task text remains part of the grading prompt, including literal data URI text. Attachment redaction uses the test variables and input declarations. Keep credentials in provider configuration rather than prompt text. Companion DOCX inputs include the rendered wrapper body and rewritten instructions in their grading context. Other companion attachments use their recorded readable content when available; otherwise, the grader sees an explicit omitted-attachment marker. Declared non-text inputs are redacted whether supplied as data URIs or raw base64. Undeclared test variables containing attachment data URIs are also redacted when explicitly referenced in the task. Declare raw base64 attachments in `inputs`; undeclared strings are treated as task text because they cannot reliably be distinguished from encoded files. `metadata.originalText` retains the injected payload. Scanned-mode grading uses the text used to render the PDF; the target must actually support visual PDF reading or OCR.

Coding-agent deterministic verifiers retain the original test variables and metadata for canary, protected-path, and file-hash checks. Those verifier-only values are not added to the model grading prompt. The model's metadata copy excludes the raw `inputVars` and `inputMaterialization` snapshots.

## Limits

- Standalone, single-turn generation only. Configure `pdf` directly under `redteam.strategies`; it can run alongside other strategies, but cannot be a step inside `layer`. Multi-turn runtime PDF transforms are rejected.
- Templates must be unencrypted PDFs with extractable text. Image-only source templates are not supported. `mode: scanned` rasterizes a text-bearing template and its appended review notes.
- Extracted template text and newly rendered text are each limited to 50,000 characters. PDF creation, template inspection, appending review notes, and scanned rendering run in separate processes with a 15-second deadline and a bounded JavaScript heap. This does not provide an OS sandbox or a hard limit on native memory.
- `redteam.maxCharsPerMessage` checks the readable attack notes, each declared companion attachment's recorded text, and the rendered accompanying text separately. Document text is counted in full, including JSON-shaped notes and their role labels. Known attachment bytes do not count toward this limit when readable content is recorded, whether supplied as data URIs or raw base64. Equivalent encodings retained in serialized input fields are handled too. Ordinary text inputs still count in full.
- Files are limited to 5 MiB. Templates can have at most 9 pages, leaving room for review notes within the 10-page output limit. Page dimensions must be between 1 and 20 inches.
- File templates must be regular files. Reads use the opened file descriptor and stop at the byte limit even if the file grows after its initial size check.
- New text uses Helvetica's Latin character set. Unsupported characters cause an error instead of disappearing. Existing template fonts remain intact in text mode.
- Rendering and template-generation errors stop the transformation. There is no text-disguised-as-PDF fallback. Editing signed documents invalidates their signatures; forms, annotations, embedded files, and active PDF content are outside this strategy's coverage.

The setup wizard's single-test preview is disabled for PDF because that preview only sends text. Run a full red team eval to exercise attachment delivery. If your installation omits optional dependencies, install the PDF parser with `npm install pdf-parse` in the same environment as Promptfoo.

For broad coverage, combine the strategy with plugins appropriate to your application's policy. Test clean documents first so ingestion failures do not look like successful defenses.
