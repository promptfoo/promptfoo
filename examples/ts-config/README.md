# ts-config (TypeScript Configuration Example)

You can run this example with:

```bash
npx promptfoo@latest init --example ts-config
```

This example demonstrates TypeScript configuration for promptfoo, including:

- Type-safe configuration with IDE autocompletion
- Dynamic schema generation using Zod
- Fun translation examples with creative language styles

## Prerequisites

- Node.js 20+
- TypeScript loader (`tsx` recommended)

Install dependencies:

```bash
npm install
```

## Running Examples

### Basic TypeScript Configuration

```bash
NODE_OPTIONS="--import tsx" promptfoo eval -c promptfooconfig.ts
```

This example translates text into French and Pirate speak.

### Dynamic Schema Generation

```bash
NODE_OPTIONS="--import tsx" promptfoo eval -c promptfooconfig-with-schema.ts
```

This example shows structured JSON outputs with fun translations into Pirate speak, Shakespeare English, and Gen Z slang.

View results:

```bash
promptfoo view
```

## Examples Overview

### 1. Basic Configuration (`promptfooconfig.ts`)

Demonstrates:

- Type-safe configuration using the `UnifiedConfig` type
- Simple provider configuration with GPT-5 Mini
- Basic translation examples

### 2. Dynamic Schema Generation (`promptfooconfig-with-schema.ts`)

Shows advanced features:

- Zod schema for structured translation responses
- Automatic schema adaptation for different providers (OpenAI and Gemini)
- Structured JSON outputs with multiple fields (translation, language, confidence, funFactor, culturalNotes)
- JavaScript assertions for validating structured outputs

Both OpenAI and Gemini support strict schema enforcement to ensure outputs match your Zod schema exactly.

## TypeScript Support

Node.js currently requires external loaders to run TypeScript files directly:

- Node.js 20+ supports ES modules with the `--import` flag
- The `tsx` loader provides the best developer experience
- Future versions may include native TypeScript support
