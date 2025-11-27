# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Project Overview

Promptfoo is an open-source framework for evaluating and testing LLM applications. The project is written primarily in TypeScript and includes:

- `src/`: Core library code
- `test/`: Test files
- `site/`: Documentation site (Docusaurus)
- `examples/`: Example configurations and use cases
- `src/app/`: Web UI (React)

## Common Development Commands

### Setup & Installation

```bash
# Clone the repository
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo

# Use the Node.js version specified in .nvmrc
nvm use

# Install dependencies
npm install

# Build the project
npm run build
```

### Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the project
npm run build

# Build and watch for changes
npm run build:watch

# Format code
npm run format

# Lint code
npm run lint

# Run the web UI in development mode
npm run dev
```

### Testing Changes Locally

```bash
# Link the local build
npm link

# Or run directly
npm run local -- eval -c path/to/config.yaml
```

## Changelog

**Do not edit `CHANGELOG.md`.** It is automatically generated.

## Code Style Guidelines

- Use TypeScript with strict type checking
- Follow consistent import order (Biome will handle import sorting)
- Use consistent curly braces for all control statements
- Prefer const over let; avoid var
- Use object shorthand syntax whenever possible
- Use async/await for asynchronous code
- Follow Jest best practices with describe/it blocks
- Use consistent error handling with proper type checks

## Git Workflow

### Branches

- Use descriptive topic branches: `feat/`, `fix/`, `docs/`, or `chore/`
- Branch names should be kebab-case (e.g., `feat/add-anthropic-provider`)
- Create branches from `main`
- Keep branches focused on a single change

### Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) format
- Examples: `feat: add new provider`, `fix: correct timeout issue`
- Make atomic commits that represent single logical changes
- Run tests before committing: `npm test`
- Run build before committing: `npm run build`
- Format and lint before committing: `npm run f && npm run l`

### Pull Requests

- Use `gh pr create --fill` to create PRs
- PR titles must follow Conventional Commits syntax
- Documentation PRs must use `docs:` prefix
- Include tests for new features or bug fixes
- Update documentation when adding features
- Ensure CI checks pass before merging

## Project Conventions

- Use CommonJS modules (type: "commonjs" in package.json)
- Node.js version requirement: >=20.0.0 (use `nvm use` to align with .nvmrc)
- Follow file structure: core logic in src/, tests in test/
- Examples belong in examples/ with clear README.md
- Test both success and error cases for all functionality
- Keep code DRY and use existing utilities where possible
- Use Drizzle ORM for database operations
- Workspaces include src/app and site directories
