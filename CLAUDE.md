# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run build` - Build the project
- `npm run lint` - Run ESLint (max 0 warnings)
- `npm run format` - Format with Prettier
- `npm test` - Run all tests
- `npx jest path/to/test-file` - Run a specific test
- `npm run dev` - Start development environment
- `npm run tsc` - Run TypeScript compiler

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
- Follow file structure: core logic in src/, tests in test/
- Examples belong in examples/ with clear README.md
- Document provider configurations following examples in existing code
- Test both success and error cases for all functionality
- Keep code DRY and use existing utilities where possible