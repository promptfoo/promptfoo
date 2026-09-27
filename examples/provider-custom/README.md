# provider-custom (Custom Provider)

Examples for writing custom promptfoo providers in different JavaScript/TypeScript module formats.

The API examples use `config.apiKey`, then `options.env.OPENAI_API_KEY` (provider or suite settings), then `process.env.OPENAI_API_KEY`.

## Examples

- [basic](./basic/) - Custom provider using CommonJS (.cjs)
- [mjs](./mjs/) - Custom provider using ES modules (.mjs)
- [typescript](./typescript/) - Custom provider using TypeScript
- [embeddings](./embeddings/) - Custom embedding provider for similarity assertions
