# ts-config (TypeScript Configuration Example for promptfoo)

You can run this example with:

```bash
npx promptfoo@latest init --example ts-config
```

This guide demonstrates how to set up a TypeScript configuration for promptfoo using `promptfooconfig.ts`, including:
- Basic TypeScript configuration with type safety
- Dynamic schema generation using Zod
- Reusing application schemas in test configurations

## Prerequisites

- Node.js 20 or later
- A TypeScript loader for Node.js such as `@swc-node/register` or `tsx`

Install dependencies:

```bash
npm install tsx zod openai
```

## Running the Evaluation

### Basic Example

```bash
# Using tsx
NODE_OPTIONS="--import tsx" promptfoo eval -c examples/ts-config/promptfooconfig.ts
```

### Dynamic Schema Example

```bash
# Using tsx with dynamic schema configuration
NODE_OPTIONS="--import tsx" promptfoo eval -c examples/ts-config/promptfooconfig-with-schema.ts
```

View the results:

```bash
promptfoo view
```

## Features Demonstrated

### Basic TypeScript Configuration

The `promptfooconfig.ts` file shows:
- Type-safe configuration using the `UnifiedConfig` type
- Simple prompt templates with variables
- Basic test cases

### Dynamic Schema Generation

The `promptfooconfig-with-schema.ts` file demonstrates:
- Using Zod schemas from your application code
- Dynamically generating response formats for different providers
- Converting schemas between OpenAI and Gemini formats
- Maintaining a single source of truth for data models

This is particularly useful when:
- Your application uses structured outputs with JSON schemas
- You want to avoid duplicating schema definitions
- You need to test the same prompts across different providers with different schema formats

## TypeScript Support in Node.js

- Currently, Node.js requires external loaders to run TypeScript files directly. However, future versions of Node.js are expected to include native TypeScript support:
- Node.js 20 introduced the `--experimental-loader` flag for ES module.
- The Node.js team is actively working on enhancing TypeScript integration.
- Future versions may reduce or eliminate the need for external loaders.
