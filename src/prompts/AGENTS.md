# Prompt Processing

Prompt loading, prompt files, Nunjucks rendering, grading prompts (`grading.ts`), and prompt processors (`processors/`).

## Template Security

promptfoo renders prompts with Nunjucks (engine in `src/util/templates.ts`). Server-side template injection is a real risk here:

- **Never render untrusted runtime data as a template.** Model/provider/grader output, remote content, user/test data, and `_conversation` message content must be passed in as data variables or kept literal — never concatenated into the template source.
- The template-source argument to render helpers must be trusted input only: config, prompt files, or rubric/config text.
- When fixing a template boundary, add a regression test with payloads like `{{env.OPENAI_API_KEY}}`, control-flow tags, and constructor/RCE-looking strings, proving they stay literal when they arrive as runtime data.

## Processor Changes

Processors (`processors/{csv,json,jsonl,markdown,javascript,python,executable,jinja}.ts`) should preserve user intent and useful errors:

- Use the structured parsers for CSV, JSON, JSONL, and Markdown instead of ad hoc string splitting.
- Preserve row order, labels, metadata, multiline content, and file-relative paths.
- For JavaScript/Python/executable/external-file processors, treat execution as explicit user-configured code; keep errors actionable without exposing secrets.
- If processor behavior affects examples or docs, update the matching `examples/` and `site/docs/` pages.

## Validation

```bash
npx vitest run test/prompts
npm run local -- eval -c examples/<relevant-example>/promptfooconfig.yaml --no-cache -o output.json
```

Inspect exported results when the change affects rendered prompts, provider inputs, or grading prompts.
