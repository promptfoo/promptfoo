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

All user-facing changes must be documented in `CHANGELOG.md`. The changelog is enforced via GitHub Actions.

### When to Update

Update the changelog for ANY pull request that affects users, including:

- New features or functionality
- Bug fixes
- Breaking changes
- API changes
- Provider additions or updates
- Configuration changes
- Performance improvements
- Deprecated features

### Exemptions

PRs are exempt from changelog updates if:

1. PR has the `no-changelog` label, OR
2. PR title starts with (case-insensitive):
   - `chore(deps):` - Dependency updates
   - `style:` - Code formatting only
   - `build:` - Build configuration
   - `test:` - Test-only changes

### Changelog Format

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- New features go here (#PR_NUMBER)

### Changed

- Changes to existing functionality (#PR_NUMBER)

### Fixed

- Bug fixes (#PR_NUMBER)

### Dependencies

- Dependency updates (#PR_NUMBER)

### Documentation

- Documentation changes (#PR_NUMBER)

### Tests

- Test additions or changes (#PR_NUMBER)

## [1.2.3] - 2025-10-15

### Added

- Feature that was added (#1234)
```

### Entry Format

Each entry should:

1. **Include PR number**: Always add the PR number in format `(#1234)`
2. **Use conventional commit prefix**: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
3. **Be concise**: One line describing the change
4. **Be user-focused**: Describe what changed, not how

### Categories

- **Added**: New features
- **Changed**: Changes to existing functionality (refactors, improvements)
- **Fixed**: Bug fixes
- **Dependencies**: Dependency updates (only breaking or important ones)
- **Documentation**: Documentation additions or updates
- **Tests**: Test additions or changes
- **Removed**: Removed features (rare, usually breaking)

### Examples

Good entries:

```markdown
### Added

- feat(providers): add TrueFoundry LLM Gateway provider (#5839)
- feat(redteam): add test button for request and response transforms in red-team setup UI (#5482)

### Fixed

- fix(evaluator): support `defaultTest.options.provider` for model-graded assertions (#5931)
- fix(webui): improve UI email validation handling when email is invalid; add better tests (#5932)

### Changed

- chore(providers): update Alibaba model support (#5919)
- refactor(webui): improve EvalOutputPromptDialog with grouped dependency injection (#5845)
```

Bad entries (missing PR number, too vague):

```markdown
### Added

- Added new feature
- Updated provider
```

### Adding Entries

1. **Add to Unreleased section**: All new entries go under `## [Unreleased]` at the top of the file
2. **Choose correct category**: Added, Changed, Fixed, Dependencies, Documentation, Tests
3. **Include PR number**: Format: `(#1234)`
4. **Keep conventional commit prefix**: feat:, fix:, chore:, docs:, test:
5. **One line per change**: Brief and descriptive

Example workflow:

```bash
# 1. Make your changes
# 2. Before creating PR, update CHANGELOG.md

# Add entry under ## [Unreleased] in appropriate category:
- feat(providers): add new provider for XYZ (#PR_NUMBER)

# 3. Commit changelog with your changes
git add CHANGELOG.md
git commit -m "feat(providers): add new provider for XYZ"
```

### Notes

- Maintainers move entries from Unreleased to versioned sections during releases
- Don't worry about version numbers - focus on the Unreleased section
- If unsure about categorization, use Changed
- Dependencies are only included if they're breaking or notable

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
