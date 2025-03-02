# TypeScript Configuration Example

This example demonstrates how to use TypeScript for promptfoo configuration, enabling type safety, better IDE support, and more maintainable configuration files.

## Quick Start

```bash
npx promptfoo@latest init --example ts-config
```

## Configuration

1. Install a TypeScript loader (choose one):

```bash
# Option 1: Using @swc-node/register (Recommended)
npm install @swc-node/register

# Option 2: Using tsx
npm install tsx
```

2. Review the example files:
   - `promptfooconfig.ts`: Main TypeScript configuration
   - `types.ts`: Custom type definitions
   - Test cases with type-safe variables

## Usage

Run the evaluation using your chosen loader:

### Using @swc-node/register

```bash
NODE_OPTIONS='--import @swc-node/register/esm-register' promptfoo eval -c promptfooconfig.ts
```

### Using tsx

```bash
NODE_OPTIONS='--loader tsx' promptfoo eval -c promptfooconfig.ts
```

View results:

```bash
promptfoo view
```

## What's Being Tested

This example demonstrates:

- Type-safe configuration setup
- TypeScript integration patterns
- Custom type definitions
- Module imports and exports
- Configuration validation at compile time

## Example Structure

The example includes:

- `promptfooconfig.ts`: Main TypeScript configuration file
- `types.ts`: Type definitions and interfaces
- Test cases with typed variables
- TypeScript-specific configuration options

## Implementation Details

The configuration demonstrates:

- How to define typed configurations
- Using TypeScript features in config files
- Importing external modules and types
- Type-safe variable references
- Error handling with TypeScript

## Additional Resources

- [TypeScript Configuration Guide](https://promptfoo.dev/docs/configuration/typescript)
- [Configuration Types Reference](https://promptfoo.dev/docs/configuration/types)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [SWC Node Documentation](https://swc.rs/docs/usage/swc-node)
