---
sidebar_label: Contributing
---

# Contributing Guidelines for Promptfoo

We welcome contributions from the community to help make this project better. In particular, we welcome:

- bugfixes.
- documentation updates including examples and guides.
- updates to providers including capabilities.
- features that make your use of promptfoo easier.

- If you are not sure where to start, we have a list of [good first issues](https://github.com/promptfoo/promptfoo/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) to help you get started. You can also join our [Discord community](https://discord.gg/gHPS9jjfbs) to get help from the maintainers.

## Background

Promptfoo is a flexible command line tool for evaluating LLM prompts against a variety of providers. We also have a web interface for viewing the results of evals and running simple evals. The core of this guide focuses on how to contribute to the command line tool.

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

4. Open a pull request against the `main` branch of the promptfoo repository. The PR title should follow the [Conventional Commits](https://www.conventionalcommits.org/) specification, but if it doesn't, don't worry. We can update it for you.

    When opening a pull request:
      - Address a specific issue or feature request. If there isn't an existing issue, create one first.
      - Keep changes small and focused. Avoid mixing refactors with new features.
      - Ensure test coverage for new code or bug fixes.
      - Provide clear instructions on how to reproduce the problem or test the new feature.
      - If you're unsure about something, feel free to ask questions in the PR or reach out to maintainers.

    Be responsive to feedback and be prepared to make changes if requested.
    Once your PR is approved and merged, congratulations on your contribution! We will give you a shoutout in the release notes.

    Remember, successful PRs are typically small, well-documented, and address a specific need. Don't hesitate to communicate with maintainers if you need guidance or have questions about your contribution.

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

Note that we have minimal linting rules. We would like to ratchet these up in the future.

## Building the Project

To build the project:

```sh
npm run build
```

For continuous building during development:

```sh
npm run build:watch
```

This will help you catch TypeScript errors as you make changes to the code.

## Contributing to the CLI

### Running the CLI During Development

We recommend using `npm link` to link your local `promptfoo` package to the global `promptfoo` package. This will allow you to run commands like:

```sh
promptfoo --help
```

Note that you should also run `npm run build:watch` to transpile the TypeScript code to JavaScript. When you are done, you can unlink the package by running `npm unlink promptfoo`.

Alternatively, you can run the CLI directly. This takes slightly longer as it transpiles the TypeScript code to JavaScript.

```sh
npm run local -- eval --config examples/cloudflare-ai/chat_config.yaml
```

Note: Any parts of the command after `--` are passed through to the CLI entrypoint.

We recommend setting up a local `promptfooconfig.yaml`.

Here is a simple example:

```yaml
providers:
  - name: openai:chat:gpt-4o
prompts:
  - Translate "{{input}}" to {{language}}
tests:
  - Vars:
      input: 'Hello, world!'
      language: 'English'
```

You can run many commands with `--verbose` or by setting `LOG_LEVEL=debug` as an environment variable.

### Contributing to the Web UI

## Web UI Development

The web UI is located in `src/web/nextui`. To run it in dev mode:

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
- Email us at [help@promptfoo.com](mailto:help@promptfoo.dev).

Thank you for contributing to promptfoo!

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions.
