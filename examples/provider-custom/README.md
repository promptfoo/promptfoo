# provider-custom (Custom Provider)

Examples for writing custom promptfoo providers in different JavaScript/TypeScript module formats.

The API examples read `config.apiKey`, then the provider or suite `env.OPENAI_API_KEY`, then the shell environment. Custom providers receive those overrides in their constructor as `options.env`.

## Examples

- [basic](./basic/) - Custom provider using CommonJS (.cjs)
- [mjs](./mjs/) - Custom provider using ES modules (.mjs)
- [typescript](./typescript/) - Custom provider using TypeScript
- [embeddings](./embeddings/) - Custom embedding provider for similarity assertions
