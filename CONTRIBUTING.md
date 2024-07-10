# Contributing to promptfoo

Thank you for your interest in contributing to promptfoo! We welcome contributions from the community to help make this project better.

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read and adhere to it in all interactions.

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally:

   ```sh
   git clone https://github.com/[your-username]/promptfoo.git
   cd promptfoo
   ```

3. Set up your development environment:

   ```sh
   # Optionally use the Node.js version specified in the .nvmrc file (ensure node >= 18)
   nvm use

   npm install
   ```

## Development Workflow

1. Create a new branch for your feature or bugfix:

   ```sh
   git checkout -b feature/your-feature-name
   ```

   or

   ```sh
   git checkout -b bugfix/your-bugfix-name
   ```

2. Make your changes and commit them using [Conventional Commits](https://www.conventionalcommits.org/) specification.

3. Push your branch to your fork:

   ```sh
   git push origin your-branch-name
   ```

4. Open a pull request against the `main` branch of the promptfoo repository.

## Running Tests

We use Jest for testing. To run the test suite:

```sh
npm test
# or
npm run test:watch
```

To run tests in watch mode:

```sh
npm run test:watch
```

## Linting and Formatting

We use ESLint and Prettier for code linting and formatting. Before submitting a pull request, please run:

```sh
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

## Running the CLI During Development

To run the CLI during development:

```sh
npm run local -- eval --config $(readlink -f ./examples/cloudflare-ai/chat_config.yaml)
```

Note: Any parts of the command after `--` are passed through to the CLI entrypoint.

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

1. Create an implementation in `src/providers/SOME_PROVIDER_FILE`
2. Update `loadApiProvider` in `src/providers.ts` to load your provider via string
3. Add test cases in `test/providers.test.ts`
   - Test the actual provider implementation
   - Test loading the provider via a `loadApiProvider` test

## Documentation

If you're adding new features or changing existing ones, please update the relevant documentation. We use [Docusaurus](https://docusaurus.io/) for our documentation.

## Submitting Changes

1. Ensure all tests pass and your code is properly linted.
2. Update the README.md with details of changes to the interface, if applicable.
3. Update the CHANGELOG.md following the [Keep a Changelog](https://keepachangelog.com/) format.
4. Submit a pull request with a clear description of your changes.

## Getting Help

If you need help or have questions, you can:

- Open an issue on GitHub
- Join our [Discord community](https://discord.gg/gHPS9jjfbs)
- Email us at [your-email@example.com]

Thank you for contributing to promptfoo!
