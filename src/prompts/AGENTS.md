# Prompt Processing

Prompt loading, prompt files, Nunjucks rendering, grading prompts, and prompt processors.

## Template Security

- Never render untrusted runtime data as a template. Model output, provider output, grader output, remote content, user/test data, and `_conversation` message content must be passed as data into a trusted template or preserved literally.
- The first argument to template rendering helpers must be a trusted template source such as config, prompt files, or rubric/config text.
- Add regression tests when fixing a template boundary. Include payloads such as `{{env.OPENAI_API_KEY}}`, control-flow tags, and constructor/RCE-looking strings to prove they remain literal when they come from runtime data.

## Processor Changes

Prompt processors should preserve user intent and useful errors:

- Use structured parsers for CSV, JSON, JSONL, YAML, and Markdown instead of ad hoc string splitting.
- Preserve row order, labels, metadata, multiline content, and file-relative paths.
- For JavaScript, Python, executable, or external-file processors, treat execution as explicit user-configured code and keep errors actionable without exposing secrets.
- If processor behavior affects examples or docs, update the matching `examples/` and `site/docs/` pages.

## Validation

For prompt processor or rendering changes, run focused tests and one real eval when possible:

```bash
npx vitest run test/prompts
npm run local -- eval -c examples/<relevant-example>/promptfooconfig.yaml --no-cache -o output.json
```

Inspect exported results when the change affects rendered prompts, provider inputs, or grading prompts.
