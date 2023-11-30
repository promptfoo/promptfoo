---
sidebar_label: Jest
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import JestExampleImage from '../assets/jest-example.png';

# Testing prompts with Jest

`promptfoo` can be integrated with test frameworks like [Jest](https://jestjs.io/) in order to evaluate prompts as part of existing testing and CI workflows.

This guide includes examples that show how to create Jest test cases for desired prompt quality using semantic similarity and LLM grading. You can also skip to the [full example code](https://github.com/typpo/promptfoo/tree/main/examples/jest-integration).

For more information on supported checks, see [Expected Outputs documentation](/docs/configuration/expected-outputs/).

## Prerequisites

Before you begin, make sure you have the following node packages installed:

- [jest](https://jestjs.io/docs/getting-started): `npm install --save-dev jest`
- promptfoo: `npm install --save-dev promptfoo`

## Creating custom jest matchers

First, we'll create custom jest matchers:

- `toMatchSemanticSimilarity`: Compares two strings for semantic similarity.
- `toPassLLMRubric`: Checks if a string meets the specified LLM Rubric criteria.
- `toMatchFactuality`: Checks if a string meets the specified factuality criteria.
- `toMatchClosedQA`: Checks if a string meets the specified question-answering criteria.

Create a new file called `matchers.js` and add the following:

<Tabs>
  <TabItem value="Javascript" label="Javascript" default>

```javascript
import { assertions } from 'promptfoo';
const { matchesSimilarity, matchesLlmRubric } = assertions;

export function installJestMatchers() {
  expect.extend({
    async toMatchSemanticSimilarity(received, expected, threshold = 0.8) {
      const result = await matchesSimilarity(received, expected, threshold);
      const pass = received === expected || result.pass;
      if (pass) {
        return {
          message: () => `expected ${received} not to match semantic similarity with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to match semantic similarity with ${expected}, but it did not. Reason: ${result.reason}`,
          pass: false,
        };
      }
    },

    async toPassLLMRubric(received, expected, gradingConfig) {
      const gradingResult = await matchesLlmRubric(expected, received, gradingConfig);
      if (gradingResult.pass) {
        return {
          message: () => `expected ${received} not to pass LLM Rubric with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to pass LLM Rubric with ${expected}, but it did not. Reason: ${gradingResult.reason}`,
          pass: false,
        };
      }
    },

    async toMatchFactuality(input, expected, received, gradingConfig) {
      const gradingResult = await matchesFactuality(input, expected, received, gradingConfig);
      if (gradingResult.pass) {
        return {
          message: () => `expected ${received} not to match factuality with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to match factuality with ${expected}, but it did not. Reason: ${gradingResult.reason}`,
          pass: false,
        };
      }
    },

    async toMatchClosedQA(input, expected, received, gradingConfig) {
      const gradingResult = await matchesClosedQa(input, expected, received, gradingConfig);
      if (gradingResult.pass) {
        return {
          message: () => `expected ${received} not to match ClosedQA with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to match ClosedQA with ${expected}, but it did not. Reason: ${gradingResult.reason}`,
          pass: false,
        };
      }
    },
  });
}
```

  </TabItem>
  <TabItem value="Typescript" label="Typescript" default>

```typescript
import { assertions } from 'promptfoo';
const { matchesSimilarity, matchesLlmRubric } = assertions;

import type { GradingConfig } from 'promptfoo';

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchSemanticSimilarity(expected: string, threshold?: number): R;
      toPassLLMRubric(expected: string, gradingConfig: GradingConfig): R;
    }
  }
}

export function installJestMatchers() {
  expect.extend({
    async toMatchSemanticSimilarity(
      received: string,
      expected: string,
      threshold: number = 0.8,
    ): Promise<jest.CustomMatcherResult> {
      const result = await matchesSimilarity(received, expected, threshold);
      const pass = received === expected || result.pass;
      if (pass) {
        return {
          message: () => `expected ${received} not to match semantic similarity with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to match semantic similarity with ${expected}, but it did not. Reason: ${result.reason}`,
          pass: false,
        };
      }
    },

    async toPassLLMRubric(
      received: string,
      expected: string,
      gradingConfig: GradingConfig,
    ): Promise<jest.CustomMatcherResult> {
      const gradingResult = await matchesLlmRubric(expected, received, gradingConfig);
      if (gradingResult.pass) {
        return {
          message: () => `expected ${received} not to pass LLM Rubric with ${expected}`,
          pass: true,
        };
      } else {
        return {
          message: () =>
            `expected ${received} to pass LLM Rubric with ${expected}, but it did not. Reason: ${gradingResult.reason}`,
          pass: false,
        };
      }
    },
  });
}
```

  </TabItem>
</Tabs>

## Writing tests

Our test code will use the custom jest matchers in order to run a few test cases.

Create a new file called `index.test.js` and add the following code:

```javascript
import { installJestMatchers } from './matchers';

installJestMatchers();

const gradingConfig = {
  provider: 'openai:chat:gpt-3.5-turbo',
};

describe('semantic similarity tests', () => {
  test('should pass when strings are semantically similar', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox');
  });

  test('should fail when strings are not semantically similar', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity('The weather is nice today');
  });

  test('should pass when strings are semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox', 0.7);
  });

  test('should fail when strings are not semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity(
      'The weather is nice today',
      0.9,
    );
  });
});

describe('LLM evaluation tests', () => {
  test('should pass when strings meet the LLM Rubric criteria', async () => {
    await expect('Four score and seven years ago').toPassLLMRubric(
      'Contains part of a famous speech',
      gradingConfig,
    );
  });

  test('should fail when strings do not meet the LLM Rubric criteria', async () => {
    await expect('It is time to do laundry').not.toPassLLMRubric(
      'Contains part of a famous speech',
      gradingConfig,
    );
  });
});
```

## Final setup

Add the following line to the `scripts` section in your `package.json`:

```json
"test": "jest"
```

Now, you can run the tests with the following command:

```bash
npm test
```

This will execute the tests and display the results in the terminal.

Note that if you're using the default providers, you will need to set the `OPENAI_API_KEY` environment variable.

<img src={JestExampleImage} />
