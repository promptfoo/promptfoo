# Node.js API documentation tooling

TypeDoc 0.28 requires the TypeScript Compiler API, which TypeScript 7 no longer
provides. This private package installs TypeScript 6 for documentation generation;
project builds and type checks continue to use the root TypeScript version.

Run `npm run docs:api` from the repository root. It installs the locked tooling,
generates the reference, and formats the Markdown.
