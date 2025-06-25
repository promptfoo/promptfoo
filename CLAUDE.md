# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Frontend API Calls

When making API calls from the React app (`src/app`), always use the `callApi` function from `@app/utils/api` instead of direct `fetch()` calls. This ensures proper API base URL handling.

```typescript
import { callApi } from '@app/utils/api';

// Correct
const response = await callApi('/traces/evaluation/123');

// Incorrect - will fail in development
const response = await fetch('/api/traces/evaluation/123');
```

## Build Commands

- `npm run build` - Build the project
- `npm run build:clean` - Clean the dist directory
- `npm run build:watch` - Watch for changes and rebuild TypeScript files
- `npm run lint` - Run ESLint (max 0 warnings)
- `npm run lint:src` - Run ESLint on src directory
- `npm run lint:tests` - Run ESLint on test directory
- `npm run lint:site` - Run ESLint on site directory
- `npm run format` - Format with Prettier
- `npm run format:check` - Check formatting without making changes
- `npm run f` - Format only changed files
- `npm run l` - Lint only changed files
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run test:redteam:integration` - Run red team integration tests
- `npx jest path/to/test-file` - Run a specific test
- `npm run dev` - Start development environment (both server and app)
- `npm run dev:app` - Start only the frontend app in dev mode
- `npm run dev:server` - Start only the server in dev mode
- `npm run tsc` - Run TypeScript compiler
- `npm run db:generate` - Generate database migrations with Drizzle
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Drizzle studio for database management
- `npm run jsonSchema:generate` - Generate JSON schema for configuration
- `npm run citation:generate` - Generate citation file

## CLI Commands

- `promptfoo` or `pf` - Access the CLI tool

## Code Style Guidelines

- Use TypeScript with strict type checking
- Follow established import order with @trivago/prettier-plugin-sort-imports
- Use consistent curly braces for all control statements
- Prefer const over let; avoid var
- Use object shorthand syntax whenever possible
- Use async/await for asynchronous code
- Follow Jest best practices with describe/it blocks
- Use consistent error handling with proper type checks

## Project Conventions

- Use CommonJS modules (type: "commonjs" in package.json)
- Node.js version requirement (>=18.0.0)
- Follow file structure: core logic in src/, tests in test/
- Examples belong in examples/ with clear README.md
- Document provider configurations following examples in existing code
- Test both success and error cases for all functionality
- Keep code DRY and use existing utilities where possible
- Use Drizzle ORM for database operations
- Workspaces include src/app and site directories
