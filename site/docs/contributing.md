---
title: Contributing to promptfoo
sidebar_label: Contributing
---

We welcome contributions from the community to help make promptfoo better. This guide will help you get started. If you have any questions, please reach out to us on [Discord](https://discord.gg/promptfoo) or through a [GitHub issue](https://github.com/promptfoo/promptfoo/issues/new).

## Project Overview

promptfoo is an MIT licensed tool for testing and evaluating LLM apps.

### How to Contribute

There are several ways to contribute to promptfoo:

1. **Submit Pull Requests**: Anyone can contribute by forking the repository and submitting pull requests. You don't need to be a collaborator to contribute code or documentation changes.

2. **Report Issues**: Help us by reporting bugs or suggesting improvements through GitHub issues or [Discord](https://discord.gg/promptfoo).

3. **Improve Documentation**: Documentation improvements are always welcome, including fixing typos, adding examples, or writing guides.

We particularly welcome contributions in the following areas:

- Bug fixes
- Documentation updates, including examples and guides
- Updates to providers including new models, new capabilities (tool use, function calling, JSON mode, file uploads, etc.)
- Features that improve the user experience of promptfoo, especially relating to RAGs, Agents, and synthetic data generation.

## Getting Started

1. Fork the repository on GitHub by clicking the "Fork" button at the top right of the [promptfoo repository](https://github.com/promptfoo/promptfoo).
2. Clone your fork locally:

   ```sh
   git clone https://github.com/[your-username]/promptfoo.git
   cd promptfoo
   ```

3. Set up your development environment:

   3.1. Setup locally

   ```sh
   # We recommend using the Node.js version specified in the .nvmrc file (ensure node >= 18)
   nvm use
   npm install
   ```

   3.2 Setup using `devcontainer` (requires Docker and VSCode)

   Open the repository in VSCode and click on the "Reopen in Container" button. This will build a Docker container with all the necessary dependencies.

   Now install node based dependencies:

   ```sh
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

6. Run the project:

   ```sh
   npm run dev
   ```

   This will run the express server on port 15500 and the web UI on port 3000.
   Both the API and UI will be automatically reloaded when you make changes.

   Note: The development experience is a little bit different than how it runs in production. In development, the web UI is served using a Vite server. In all other environments, the front end is built and served as a static site via the Express server.

If you're not sure where to start, check out our [good first issues](https://github.com/promptfoo/promptfoo/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) or join our [Discord community](https://discord.gg/promptfoo) for guidance.

## Development Workflow

1. Create a new branch for your feature or bug fix:

   ```sh
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them. We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for PR titles when merging into `main`. Individual commits can use any format, since we squash merge all PRs with a conventional commit message.

3. Push your branch to your fork:

   ```sh
   git push origin your-branch-name
   ```

4. [Open a pull request](https://github.com/promptfoo/promptfoo/compare) (PR) against the `main` branch of the promptfoo repository.

When opening a pull request:

- Keep changes small and focused. Avoid mixing refactors with new features.
- Ensure test coverage for new code or bug fixes.
- Provide clear instructions on how to reproduce the problem or test the new feature.
- Be responsive to feedback and be prepared to make changes if requested.
- Ensure your tests are passing and your code is properly linted and formatted. You can do this by running `npm run lint -- --fix` and `npm run format` respectively.

Don't hesitate to ask for help. We're here to support you. If you're worried about whether your PR will be accepted, please talk to us first (see [Getting Help](#getting-help)).

## Tests

### Running Tests

We use Jest for testing. To run the test suite:

```sh
npm test
```

To run tests in watch mode:

```sh
npm run test:watch
```

You can also run specific tests with (see [jest documentation](https://jestjs.io/docs/cli#jest-regexfortestfiles)):

```sh
npx jest [pattern]

# Example:
# Runs all provider tests
npx jest providers
```

### Writing Tests

When writing tests, please:

- Run the test suite you modified with the `--randomize` flag to ensure your mocks setup and teardown are not affecting other tests.
- Check the coverage report to ensure your changes are covered.
- Avoid adding additional logs to the console.

## Linting and Formatting

We use ESLint and Prettier for code linting and formatting. Before submitting a pull request, please run:

```sh
npm run format
npm run lint
```

It's a good idea to run the lint command as `npm run lint -- --fix` to automatically fix some linting errors.

## Building the Project

To build the project:

```sh
npm run build
```

For continuous building of the api during development:

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

We recommend running `npm run build:watch` in a separate terminal while you are working on the CLI. This will automatically build the CLI when you make changes.

Alternatively, you can run the CLI directly:

```sh
npm run local -- eval --config examples/cloudflare-ai/chat_config.yaml
```

When working on a new feature, we recommend setting up a local `promptfooconfig.yaml` that tests your feature. Think of this as an end-to-end test for your feature.

Here's a simple example:

```yaml
providers:
  - id: openai:chat:gpt-4o
prompts:
  - Translate "{{input}}" to {{language}}
tests:
  - vars:
      input: 'Hello, world!'
      language: 'English'
    assert:
      - type: new-assertion-type
```

## Adding a New Provider

Providers are defined in TypeScript. We also provide language bindings for Python and Go. To contribute a new provider:

1. Ensure your provider doesn't already exist in promptfoo and fits its scope. For OpenAI-compatible providers, you may be able to re-use the openai provider and override the base URL and other settings. If your provider is OpenAI compatible, feel free to skip to step 4.

2. Implement the provider in `src/providers/yourProviderName.ts` following our [Custom API Provider Docs](/docs/providers/custom-api/). Please use our cache `src/cache.ts` to store responses. If your provider requires a new dependency, please add it as a peer dependency with `npm install --save-peer`.

3. Write unit tests in `test/providers.yourProviderName.test.ts` and create an example in the `examples/` directory.

4. Document your provider in `site/docs/providers/yourProviderName.md`, including a description, setup instructions, configuration options, and usage examples. You can also add examples to the `examples/` directory. Consider writing a guide comparing your provider to others or highlighting unique features or benefits.

5. Update `src/providers/index.ts` and `site/docs/providers/index.md` to include your new provider. Update `src/envars.ts` to include any new environment variables your provider may need.

6. Ensure all tests pass (`npm test`) and fix any linting issues (`npm run lint`).

## Contributing to the Web UI

The web UI is written as a React app. It is exported as a static site and hosted by a local express server when bundled.

To run the web UI in dev mode:

```sh
npm run dev
```

This will host the web UI at http://localhost:3000. This allows you to hack on the React app quickly (with fast refresh). If you want to run the web UI without the express server, you can run:

```sh
npm run dev:web
```

To test the entire thing end-to-end, we recommend building the entire project and linking it to promptfoo:

```sh
npm run build
promptfoo view
```

Note that this will not update the web UI if you make further changes to the code. You have to run `npm run build` again.

## Python Contributions

While promptfoo is primarily written in TypeScript, we support custom Python prompts, providers, asserts, and many examples in Python. We strive to keep our Python codebase simple and minimal, without external dependencies. Please adhere to these guidelines:

- Use Python 3.9 or later
- For linting and formatting, use `ruff`. Run `ruff check --fix` and `ruff format` before submitting changes
- Follow the [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- Use type hints to improve code readability and catch potential errors
- Write unit tests for new Python functions using the built-in `unittest` module
- When adding new Python dependencies to an example, update the relevant `requirements.txt` file

## Documentation

If you're adding new features or changing existing ones, please update the relevant documentation. We use [Docusaurus](https://docusaurus.io/) for our documentation. We strongly encourage examples and guides as well.

## Database

promptfoo uses SQLite as its default database, managed through the Drizzle ORM. By default, the database is stored in `/.promptfoo/`. You can override this location by setting `PROMPTFOO_CONFIG_DIR`. The database schema is defined in `src/database.ts` and migrations are stored in `drizzle`. Note that the migrations are all generated and you should not access these files directly.

### Main Tables

- `evals`: Stores evaluation details including results and configuration.
- `prompts`: Stores information about different prompts.
- `datasets`: Stores dataset information and test configurations.
- `evalsToPrompts`: Manages the relationship between evaluations and prompts.
- `evalsToDatasets`: Manages the relationship between evaluations and datasets.

You can view the contents of each of these tables by running `npx drizzle-kit studio`, which will start a web server.

### Adding a Migration

1. **Modify Schema**: Make changes to your schema in `src/database.ts`.
2. **Generate Migration**: Run the command to create a new migration:

   ```sh
   npm run db:generate
   ```

   This command will create a new SQL file in the `drizzle` directory.

3. **Review Migration**: Inspect the generated migration file to ensure it captures your intended changes.
4. **Apply Migration**: Apply the migration with:

   ```sh
   npm run db:migrate
   ```

## Release Steps

Note: releases are only issued by maintainers. If you need to to release a new version quickly please send a message on [Discord](https://discord.gg/promptfoo).

As a maintainer, when you are ready to release a new version:

1. From main, run `npm version <minor|patch>`. We do not increment the major version per our adoption of [0ver](https://0ver.org/). This will automatically:

   - Pull latest changes from main branch
   - Update `package.json`, `package-lock.json` and `CITATION.cff` with the new version
   - Create a new branch named `chore/bump-version-<new-version>`
   - Create a pull request titled `"chore: bump version <new-version>"`

   When creating a new release version, please follow these guidelines:

   - Patch will bump the version by `0.0.1` and is used for bug fixes and minor features
   - Minor will bump the version by `0.1.0` and is used for major features and breaking changes

   To determine the appropriate release type, review the changes between the latest release and main branch by visiting ([example](https://github.com/promptfoo/promptfoo/compare/0.103.13...main)):

   ```
   https://github.com/promptfoo/promptfoo/compare/[latest-version]...main
   ```

2. Once your PR is approved and landed, a version tag will be created automatically by a GitHub Action. After the version tag has been created, generate a [new release](https://github.com/promptfoo/promptfoo/releases/new) based on the tagged version.

3. Cleanup the release notes. You can look at [this](https://github.com/promptfoo/promptfoo/releases/tag/0.103.13) release as an example

   - Break up each PR in the release into one of the following 5 sections (as applicable)
     - New Features
     - Bug Fixes
     - Chores
     - Docs
     - Dependencies
   - Sort the lines in each section alphabetically
   - Ensure that the author of the PR is correctly cited

4. A GitHub Action should automatically publish the package to npm. If it does not, please publish manually.

## Getting Help

If you need help or have questions, you can:

- Open an issue on GitHub.
- Join our [Discord community](https://discord.gg/promptfoo).

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions within our community.
