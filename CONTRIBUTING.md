# Contributing to promptfoo

**Note: This guide is a work in progress. We plan to improve it over time.**

We welcome contributions from the community to help make this project better. This guide will help you get started. If you have any questions, please reach out to us on [Discord](https://discord.gg/gHPS9jjfbs) or through a [GitHub issue](https://github.com/promptfoo/promptfoo/issues/new).

## Table of Contents

- [Contributing to promptfoo](#contributing-to-promptfoo)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Getting Started](#getting-started)
  - [Development Workflow](#development-workflow)
  - [Release Steps](#release-steps)
  - [Tests](#tests)
    - [Running Tests](#running-tests)
    - [Writing Tests](#writing-tests)
  - [Linting and Formatting](#linting-and-formatting)
  - [Building the Project](#building-the-project)
  - [Contributing to the CLI](#contributing-to-the-cli)
    - [Running the CLI During Development](#running-the-cli-during-development)
  - [Adding a New Provider](#adding-a-new-provider)
  - [Contributing to the Web UI](#contributing-to-the-web-ui)
  - [Documentation](#documentation)
  - [Getting Help](#getting-help)
  - [Database](#database)
    - [Main Tables](#main-tables)
      - [`evals` - Stores evaluation details](#evals---stores-evaluation-details)
      - [`prompts` - Stores information about different prompts](#prompts---stores-information-about-different-prompts)
      - [`datasets` - Stores dataset information](#datasets---stores-dataset-information)
      - [`evalsToPrompts` - Many-to-many relationship between `evals` and `prompts`](#evalstoprompts---many-to-many-relationship-between-evals-and-prompts)
      - [`evalsToDatasets` - Many-to-many relationship between `evals` and `datasets`](#evalstodatasets---many-to-many-relationship-between-evals-and-datasets)
    - [Adding a Migration](#adding-a-migration)
      - [Best Practices](#best-practices)
  - [Code of Conduct](#code-of-conduct)

## Project Overview

promptfoo is an MIT licensed tool for testing and evaluating LLM apps. It allows you to:

- Build reliable prompts, models, RAGs, and agents with benchmarks specific to your use case.
- Speed up evaluations with caching, concurrency, and live reloading.
- Score outputs automatically by defining metrics and perform automated red teaming.
- Use as a CLI, library, or in CI/CD.
- Use various LLM providers or integrate custom API providers.

Our goal is to enable test-driven LLM development instead of trial-and-error.

We particularly welcome contributions in the following areas:

- Bug fixes
- Documentation updates, including examples and guides
- Updates to providers including new models, new capabilities (tool use, function calling, JSON mode, file uploads, etc.)
- Features that improve the user experience of promptfoo

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

Don't hesitate to ask for help. We're here to support you. If you're worried about whether your PR will be accepted, please talk to us first.

## Release Steps

Note: releases are only issued by maintainers. When you are ready to release a new version:

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
  - name: openai:chat:gpt-4o
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

1. Create an implementation in `src/providers/SOME_PROVIDER_FILE`.
2. Update `loadApiProvider` in `src/providers.ts` to load your provider via string.
3. Add test cases in `test/providers.test.ts`:
   - Test the actual provider implementation.
   - Test loading the provider via a `loadApiProvider` test.

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
npm link
```

Note that this will not update the web UI if you make further changes to the code. You have to run `npm run build` again.

## Documentation

If you're adding new features or changing existing ones, please update the relevant documentation. We use [Docusaurus](https://docusaurus.io/) for our documentation.

## Getting Help

If you need help or have questions, you can:

- Open an issue on GitHub.
- Join our [Discord community](https://discord.gg/gHPS9jjfbs).
- Email us at [help@promptfoo.dev](mailto:help@promptfoo.dev).

Thank you for contributing to promptfoo!

## Database

promptfoo uses SQLite as its default database, managed through the Drizzle ORM. By default, the database is stored in `/.promptfoo/`. You can override this location by setting `PROMPTFOO_CONFIG_DIR`. The database schema is defined in `src/database.ts` and migrations are stored in `drizzle`. Note that the migrations are all generated and you should not access these files directly.

### Main Tables

#### `evals` - Stores evaluation details

- `id`: Primary key, unique identifier for each evaluation.
- `createdAt`: Timestamp when the evaluation was created.
- `author`: Author of the evaluation. This is set by `promptfoo config set email <email>`.
- `description`: Description of the evaluation set from the description tag in `promptfooconfig.yaml`.
- `results`: JSON object storing evaluation results.
- `config`: JSON object storing partial unified configuration.

#### `prompts` - Stores information about different prompts

- `id`: Primary key, unique identifier for each prompt.
- `createdAt`: Timestamp when the prompt was created.
- `prompt`: Text of the prompt. This is typically a nunjucks template string but may be the source code of a function.

#### `datasets` - Stores dataset information

- `id`: Primary key, unique identifier for each dataset.
- `tests`: JSON object storing tests configuration.
- `createdAt`: Timestamp when the dataset was created.

#### `evalsToPrompts` - Many-to-many relationship between `evals` and `prompts`

- `evalId`: Foreign key referencing `evals.id`.
- `promptId`: Foreign key referencing `prompts.id`.
- Primary Key: Composite key of `evalId` and `promptId`.

#### `evalsToDatasets` - Many-to-many relationship between `evals` and `datasets`

- `evalId`: Foreign key referencing `evals.id`.
- `datasetId`: Foreign key referencing `datasets.id`.
- Primary Key: Composite key of `evalId` and `datasetId`.

You can view the contents of each of these tables by running `npx drizzle-kit studio`, which will start a web server.

### Adding a Migration

1. **Modify Schema**: Make changes to your schema in `src/database.ts`.
2. **Generate Migration**: Run the command to create a new migration:

   ```sh
   drizzle generate
   ```

   This command will create a new SQL file in the `drizzle` directory.

3. **Review Migration**: Inspect the generated migration file to ensure it captures your intended changes.
4. **Apply Migration**: Apply the migration with:

   ```sh
   npx ts-node src/migrate.ts
   ```

#### Best Practices

1. **Review Generated Migrations**: Always review generated migration files before applying them.
2. **Keep Migrations Small**: Focus migrations on specific changes to keep them manageable.
3. **Test in Development**: Test migrations in a development environment before applying them to production.
4. **Backup Your Database**: Back up your database before applying migrations in production.

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions within our community.
