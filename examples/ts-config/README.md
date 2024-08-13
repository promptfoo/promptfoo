# TypeScript Configuration Example for promptfoo

This guide demonstrates how to set up a TypeScript configuration for promptfoo using `promptfooconfig.ts`.

## Prerequisites

**Note:** This example requires Node.js 20 or later.

Before running the evaluation, install the `@swc-node/register` package or another suitable TypeScript loader for Node.js:

```bash
npm install @swc-node/register
```

## Running the Evaluation

To execute the evaluation, use the following command:

```bash
NODE_OPTIONS='--import @swc-node/register/esm-register' promptfoo eval -c examples/ts-config/promptfooconfig.ts
```

After the evaluation completes, view the results with:

```bash
promptfoo view
```

## TypeScript Support in Node.js

Currently, Node.js requires external loaders like `@swc-node/register` to run TypeScript files directly. However, future versions of Node.js are expected to include native TypeScript support:

- Node.js 20 introduced the `--experimental-loader` flag for ES modules, marking progress toward native TypeScript support.
- The Node.js team is actively working on enhancing TypeScript integration.
- Once native support is available, the reliance on external loaders may be reduced or eliminated.
