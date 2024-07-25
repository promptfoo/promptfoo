---
title: Contributing to promptfoo
sidebar_label: Contributing
---

We welcome contributions from the community to help make promptfoo better. This guide will help you get started. If you have any questions, please reach out to us on [Discord](https://discord.gg/gHPS9jjfbs) or through a [GitHub issue](https://github.com/promptfoo/promptfoo/issues/new).

## Project Overview

promptfoo is an MIT licensed tool for testing and evaluating LLM apps.

We particularly welcome contributions in the following areas:

- Bug fixes
- Documentation updates, including examples and guides
- Updates to providers including new models, new capabilities (tool use, function calling, JSON mode, file uploads, etc.)
- Features that improve the user experience of promptfoo, especially relating to RAGs, Agents, and synthetic data generation.

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

1. Create a new branch for your feature or bug fix:

   ```sh
   git checkout -b feature/your-feature-name
   ```

2. We try to follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This is not required for feature branches. We merge all PRs into `main` with a squash merge and a conventional commit message.

3. Push your branch to your fork:

   ```sh
   git push origin your-branch-name
   ```

4. Open a pull request against the `main` branch of the promptfoo repository.

When opening a pull request:

- Keep changes small and focused. Avoid mixing refactors with new features.
- Ensure test coverage for new code or bug fixes.
- Provide clear instructions on how to reproduce the problem or test the new feature.
- Be responsive to feedback and be prepared to make changes if requested.
- Ensure your tests are passing and your code is properly linted.

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

You can also run specific tests with:

```sh
npx jest [pattern]
```

### Writing Tests

When writing tests, please:

- Run them with the `--randomize` flag to ensure your mocks setup and teardown are not affecting other tests.
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

Please refer to our [Custom API Provider Docs](/docs/providers/custom-api/) for details on how to implement a custom TypeScript provider.

## Contributing to the Web UI

The web UI is written as a [Next.js](https://nextjs.org/) app. It is exported as a static site and hosted by a local express server when bundled.

To run the web UI in dev mode:

```sh
npm run local:web
```

This will host the web UI at http://localhost:3000. This allows you to hack on the Next.js app quickly (with fast refresh) but does not cover all features (such as running evals from a web browser) because that relies on a separate server process.

To test the entire thing end-to-end, we recommend building the entire project and linking it to promptfoo:

```sh
npm run build
promptfoo view
```

Note that this will not update the web UI if you make further changes to the code. You have to run `npm run build` again.

## Python Contributions

While promptfoo is primarily written in TypeScript, we support custom Python prompts, providers, asserts, and many examples include Python. If making a Python contribution, please follow these guidelines:

- Use Python 3.9+
- For Python-specific linting and formatting, we use `ruff`. Run `ruff check --fix` and `ruff format` before submitting your changes.
- Follow the [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- Use type hints where possible to improve code readability and catch potential errors.
- Write unit tests for new Python functions using pytest.
- When adding new Python dependencies in an example, update the relevant `requirements.txt` file.

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

Note: releases are only issued by maintainers. If you need to to release a new version quickly please send a message on [Discord](https://discord.gg/gHPS9jjfbs).

As a maintainer, when you are ready to release a new version:

1. Update the version in `package.json`.
2. Run `npm install`.
3. Add the updated files to Git:

   ```sh
   git add package.json package-lock.json
   ```

4. Commit the changes:

   ```sh
   git commit -m "chore: Bump version to 0.X.Y"
   ```

5. Push the changes to the main branch:

   ```sh
   git push origin main
   ```

6. A version tag will be created automatically by a GitHub Action. After the version tag has been created, generate a new release based on the tagged version.
7. A GitHub Action should automatically publish the package to npm. If it does not, please publish manually.

## Getting Help

If you need help or have questions, you can:

- Open an issue on GitHub.
- Join our [Discord community](https://discord.gg/gHPS9jjfbs).

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions within our community.
