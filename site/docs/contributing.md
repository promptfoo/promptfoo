# Contributing to promptfoo

We welcome contributions from the community to help make this project better. This guide will help you get started. If you have any questions, please reach out to us on [Discord](https://discord.gg/gHPS9jjfbs) or [github issue](https://github.com/promptfoo/promptfoo/issues/new).

## Table of Contents

- [Contributing to promptfoo](#contributing-to-promptfoo)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
  - [Development Workflow](#development-workflow)
  - [Running Tests](#running-tests)
  - [Linting and Formatting](#linting-and-formatting)
  - [Building the Project](#building-the-project)
  - [Contributing to the CLI](#contributing-to-the-cli)
    - [Running the CLI During Development](#running-the-cli-during-development)
  - [Contributing to the Web UI](#contributing-to-the-web-ui)
  - [Database Migrations](#database-migrations)
  - [Adding a New Provider](#adding-a-new-provider)
  - [Documentation](#documentation)
  - [Submitting Changes](#submitting-changes)
  - [Getting Help](#getting-help)

## Project Overview

promptfoo is a tool for testing and evaluating LLM apps. It allows you to:

- Build reliable prompts, models, and RAGs with benchmarks specific to your use-case
- Speed up evaluations with caching, concurrency, and live reloading
- Score outputs automatically by defining metrics and perform automated red teaming
- Use as a CLI, library, or in CI/CD
- Use various LLM providers or integrate custom API providers

Our goal is to enable test-driven LLM development instead of trial-and-error.

We particularly welcome contributions in the following areas:

- Bug fixes
- Documentation updates, including examples and guides
- Updates to providers and their capabilities
- Features that improve the user experience of promptfoo

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions within our community.

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally:

   ```sh
   git clone https://github.com/[your-username]/promptfoo.git
   cd promptfoo
   ```

3. Set up your development environment:

   ```sh
   # We recommend using the Node.js version specified in the .nvmrc file (ensure node >= 18)
   nvm use
   npm install
   ```

4. Run the tests to make sure everything is working:

   ```sh
   npm test
   ```

5. Build the project:

   ```sh
   npm run build
   ```

If you're not sure where to start, check out our [good first issues](https://github.com/promptfoo/promptfoo/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) or join our [Discord community](https://discord.gg/gHPS9jjfbs) for guidance.

## Development Workflow

1. Create a new branch for your feature or bugfix:

   ```sh
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them using the [Conventional Commits](https://www.conventionalcommits.org/) specification.

3. Push your branch to your fork:

   ```sh
   git push origin your-branch-name
   ```

4. Open a pull request against the `main` branch of the promptfoo repository.

When opening a pull request:

- Address a specific issue or feature request. If there isn't an existing issue, there's no need to create one.
- Keep changes small and focused. Avoid mixing refactors with new features.
- Ensure test coverage for new code or bug fixes.
- Provide clear instructions on how to reproduce the problem or test the new feature.
- Be responsive to feedback and be prepared to make changes if requested.

## Running Tests

We use Jest for testing. To run the test suite:

```sh
npm test
```

To run tests in watch mode:

```sh
npm run test:watch
```

## Linting and Formatting

We use ESLint and Prettier for code linting and formatting. Before submitting a pull request, please run:

```sh
npm run format
npm run lint
```

## Building the Project

To build the project:

```sh
npm run build
```

For continuous building during development:

```sh
npm run build:watch
```

## Contributing to the CLI

### Running the CLI During Development

We recommend using `npm link` to link your local `promptfoo` package to the global `promptfoo` package:

```sh
npm link
promptfoo --help
```

Alternatively, you can run the CLI directly:

```sh
npm run local -- eval --config examples/cloudflare-ai/chat_config.yaml
```

We recommend setting up a local `promptfooconfig.yaml`. Here's a simple example:

```yaml
providers:
  - name: openai:chat:gpt-4o
prompts:
  - Translate "{{input}}" to {{language}}
tests:
  - vars:
      input: 'Hello, world!'
      language: 'English'
```

## Contributing to the Web UI

To run the web UI in dev mode:

```sh
npm run local:web
```

This will host the web UI at http://localhost:3000. Note that the web UI expects `promptfoo view` to be running separately.

## Database Migrations

- To generate new migrations: `npm run db:generate`
- To run existing migrations: `npm run db:migrate`

Note: After generating a new migration, you'll need to run `npm install` to copy the migrations into `dist/`.

## Adding a New Provider

1. Create an implementation in `src/providers/SOME_PROVIDER_FILE`.
2. Update `loadApiProvider` in `src/providers.ts` to load your provider via string.
3. Add test cases in `test/providers.test.ts`:
   - Test the actual provider implementation.
   - Test loading the provider via a `loadApiProvider` test.

## Documentation

If you're adding new features or changing existing ones, please update the relevant documentation. We use [Docusaurus](https://docusaurus.io/) for our documentation.

## Submitting Changes

1. Ensure all tests pass and your code is properly linted.
2. Update the `README.md` with details of changes to the interface, if applicable.
3. Update the `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com/) format.
4. Submit a pull request with a clear description of your changes.

## Getting Help

If you need help or have questions, you can:

- Open an issue on GitHub.
- Join our [Discord community](https://discord.gg/gHPS9jjfbs).
- Email us at [help@promptfoo.dev](mailto:help@promptfoo.dev).

Thank you for contributing to promptfoo!
