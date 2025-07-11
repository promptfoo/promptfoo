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

- Node.js 20 or later
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

This example translates text into fun language styles like Valley Girl speak, Medieval knight, and Baby Yoda using the latest 2025 models.

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
- Multiple 2025 model providers (GPT-4o Mini, Claude 3.5 Sonnet, O3 Mini)
- Fun translation examples with creative language styles

### 2. Dynamic Schema Generation (`promptfooconfig-with-schema.ts`)

Shows advanced features:
- Zod schema for structured translation responses
- Automatic schema adaptation for different providers
- Fun factor ratings and cultural notes in responses
- Object-based assertions for structured outputs

## TypeScript Support

Node.js currently requires external loaders to run TypeScript files directly:
- Node.js 20+ supports ES modules with the `--import` flag
- The `tsx` loader provides the best developer experience
- Future versions may include native TypeScript support
