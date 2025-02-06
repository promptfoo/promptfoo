# JavaScript/TypeScript Test Cases Example

This example demonstrates different ways to generate test cases using JavaScript/TypeScript functions.

## Files

- `promptfooconfig.yaml` - Configuration file that specifies prompts, providers, and test sources
- `tests.ts` - TypeScript file containing different test case generators

## Test Case Generation Methods

1. **Simple Test Cases** (`generateSimpleTests`)

   - Basic function that returns hardcoded test cases
   - Good for simple, static test scenarios

2. **Database-Driven Test Cases** (`generateFromDatabase`)
   - Async function that simulates fetching test cases from a database
   - Shows how to work with external data sources
   - Demonstrates async test case generation

## Usage

1. Run promptfoo:
   ```bash
   npx promptfoo@latest eval
   ```

## Test Case Structure

Each test case includes:

- `vars`: Variables used in the prompt template
- `assert`: Expected outputs or validation rules
- `description`: Human-readable description of the test case

## Example Output

The test cases will be used to evaluate translations to different languages:

- French translation of "Hello world"
- Spanish translation of "Good morning"
- Systematic combinations of greetings in multiple languages
