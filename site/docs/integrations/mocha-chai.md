---
sidebar_label: Mocha/Chai
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Testing prompts with Mocha/Chai

`promptfoo` can be integrated with test frameworks like [Mocha](https://mochajs.org/) and assertion libraries like [Chai](https://www.chaijs.com/) in order to evaluate prompts as part of existing testing and CI workflows.

This guide includes examples that show how to create Mocha test cases for desired prompt quality using semantic similarity and LLM grading.

For more information on supported checks, see [Assertions & Metrics documentation](/docs/configuration/expected-outputs/).

## Prerequisites

Before you begin, make sure you have the following node packages installed:

- [mocha](https://mochajs.org/#installation): `npm install --save-dev mocha`
- [chai](https://www.chaijs.com/guide/installation/): `npm install --save-dev chai`
- promptfoo: `npm install --save-dev promptfoo`

## Creating custom chai assertions

First, we'll create custom chai assertions:

- `toMatchSemanticSimilarity`: Compares two strings for semantic similarity.
- `toPassLLMRubric`: Checks if a string meets the specified LLM Rubric criteria.
- `toMatchFactuality`: Checks if a string meets the specified factuality criteria.
- `toMatchClosedQA`: Checks if a string meets the specified question-answering criteria.

Create a new file called `assertions.js` and add the following:

<Tabs>
  <TabItem value="Javascript" label="Javascript" default>

```javascript
import { Assertion } from 'chai';
import { assertions } from 'promptfoo';

const { matchesSimilarity, matchesLlmRubric } = assertions;

Assertion.addAsyncMethod('toMatchSemanticSimilarity', async function (expected, threshold = 0.8) {
  const received = this._obj;
  const result = await matchesSimilarity(received, expected, threshold);
  const pass = received === expected || result.pass;

  this.assert(
    pass,
    `expected #{this} to match semantic similarity with #{exp}, but it did not. Reason: ${result.reason}`,
    `expected #{this} not to match semantic similarity with #{exp}`,
    expected,
  );
});

Assertion.addAsyncMethod('toPassLLMRubric', async function (expected, gradingConfig) {
  const received = this._obj;
  const gradingResult = await matchesLlmRubric(expected, received, gradingConfig);

  this.assert(
    gradingResult.pass,
    `expected #{this} to pass LLM Rubric with #{exp}, but it did not. Reason: ${gradingResult.reason}`,
    `expected #{this} not to pass LLM Rubric with #{exp}`,
    expected,
  );
});

Assertion.addAsyncMethod('toMatchFactuality', async function (input, expected, gradingConfig) {
  const received = this._obj;
  const gradingResult = await matchesFactuality(input, expected, received, gradingConfig);

  this.assert(
    gradingResult.pass,
    `expected #{this} to match factuality with #{exp}, but it did not. Reason: ${gradingResult.reason}`,
    `expected #{this} not to match factuality with #{exp}`,
    expected,
  );
});

Assertion.addAsyncMethod('toMatchClosedQA', async function (input, expected, gradingConfig) {
  const received = this._obj;
  const gradingResult = await matchesClosedQa(input, expected, received, gradingConfig);

  this.assert(
    gradingResult.pass,
    `expected #{this} to match ClosedQA with #{exp}, but it did not. Reason: ${gradingResult.reason}`,
    `expected #{this} not to match ClosedQA with #{exp}`,
    expected,
  );
});
```

  </TabItem>
  <TabItem value="Typescript" label="Typescript" default>

```typescript
import { Assertion } from 'chai';
import { assertions } from 'promptfoo';
import type { GradingConfig } from 'promptfoo';

const { matchesSimilarity, matchesLlmRubric } = assertions;

Assertion.addAsyncMethod(
  'toMatchSemanticSimilarity',
  async function (this: Assertion, expected: string, threshold: number = 0.8) {
    const received = this._obj;
    const result = await matchesSimilarity(received, expected, threshold);
    const pass = received === expected || result.pass;

    this.assert(
      pass,
      `expected #{this} to match semantic similarity with #{exp}, but it did not. Reason: ${result.reason}`,
      `expected #{this} not to match semantic similarity with #{exp}`,
      expected,
    );
  },
);

Assertion.addAsyncMethod(
  'toPassLLMRubric',
  async function (this: Assertion, expected: string, gradingConfig: GradingConfig) {
    const received = this._obj;
    const gradingResult = await matchesLlmRubric(expected, received, gradingConfig);

    this.assert(
      gradingResult.pass,
      `expected #{this} to pass LLM Rubric with #{exp}, but it did not. Reason: ${gradingResult.reason}`,
      `expected #{this} not to pass LLM Rubric with #{exp}`,
      expected,
    );
  },
);
```

  </TabItem>
</Tabs>

## Writing tests

Our test code will use the custom chai assertions in order to run a few test cases.

Create a new file called `index.test.js` and add the following code:

```javascript
import { expect } from 'chai';
import './assertions';

const gradingConfig = {
  provider: 'openai:chat:gpt-4o-mini',
};

describe('semantic similarity tests', () => {
  it('should pass when strings are semantically similar', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox');
  });

  it('should fail when strings are not semantically similar', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity('The weather is nice today');
  });

  it('should pass when strings are semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').toMatchSemanticSimilarity('A fast brown fox', 0.7);
  });

  it('should fail when strings are not semantically similar with custom threshold', async () => {
    await expect('The quick brown fox').not.toMatchSemanticSimilarity(
      'The weather is nice today',
      0.9,
    );
  });
});

describe('LLM evaluation tests', () => {
  it('should pass when strings meet the LLM Rubric criteria', async () => {
    await expect('Four score and seven years ago').toPassLLMRubric(
      'Contains part of a famous speech',
      gradingConfig,
    );
  });

  it('should fail when strings do not meet the LLM Rubric criteria', async () => {
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
"test": "mocha"
```

Now, you can run the tests with the following command:

```sh
npm test
```

This will execute the tests and display the results in the terminal.

Note that if you're using the default providers, you will need to set the `OPENAI_API_KEY` environment variable.
