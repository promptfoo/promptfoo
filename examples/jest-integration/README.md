# Prompt Testing with Jest and Vitest

This folder contains a comprehensive example of how to test LLM prompts using Jest, Vitest, and `promptfoo`, including function calling evaluations and advanced Vitest features.

## Getting Started

To get started, follow these steps:

1. **Install the dependencies**:

   ```sh
   npm install
   ```

2. **Run the tests**:

   To run the tests with Jest:

   ```sh
   npx jest
   ```

   To run the tests with Vitest:

   ```sh
   npx vitest
   ```

## Vitest-Specific Features

This example showcases several Vitest-specific features:

1. **Watch Mode**:

   ```sh
   npm run test:vitest:watch
   ```

   This will watch for file changes and rerun tests automatically.

2. **Coverage Reports**:

   ```sh
   npm run test:vitest:coverage
   ```

   Generates coverage reports in text, JSON, and HTML formats.

3. **UI Mode**:
   ```sh
   npm run test:vitest:ui
   ```
   Opens the Vitest UI for an interactive test running experience.

## Function Calling Examples

The example includes comprehensive tests for LLM function calling:

- Schema validation for function calls
- Argument type checking
- Required vs optional argument handling
- Error cases and validation
- Semantic similarity testing for function descriptions
- LLM-based rubric evaluation for function schemas

Check `function-calling.test.ts` for detailed examples.

## Additional Information

For more details on integrating prompt testing with Jest and Vitest, see the [documentation](https://promptfoo.dev/docs/integrations/jest).

![Testing prompts with Jest](https://github.com/promptfoo/promptfoo/assets/310310/a9c5b96c-d4ea-42fd-8ce9-704098195e33)
