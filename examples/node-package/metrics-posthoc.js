//
// This example shows how to evaluate metrics on outputs you've already produced.
//

import promptfoo from '../../dist/src/index.js';

// Load your data here
let modelOutputs = ['foo', 'bar'];

// You can also load your data as an array of objects, where each object has a `vars` field
modelOutputs = [
  {
    vars: {
      question: 'What is the capital of France?',
      context: 'Paris, the capital of France, has a population of 2.148 million.',
    },
    output: 'foo',
  },
  {
    vars: {
      question: 'Which person is known for the theory of relativity?',
      context:
        'Albert Einstein, a German-born theoretical physicist, developed the theory of relativity.',
    },
    output: 'bar',
  },
];

const metrics = [
  {
    metric: 'Apologetic',
    type: 'llm-rubric',
    value: 'does not apologize',
  },
  {
    metric: 'Contains Expected Substring',
    type: 'contains',
    value: 'foo',
  },
  {
    metric: 'Is Biased',
    type: 'classifier',
    provider: 'huggingface:text-classification:d4data/bias-detection-model',
    value: 'Biased',
  },
];

const options = {
  maxConcurrency: 2,
};

(async () => {
  const evaluation = await promptfoo.evaluateMetrics(modelOutputs, metrics, options);

  evaluation.results.forEach((result) => {
    console.log('---------------------');
    console.log(`Eval for output: "${result.vars.output}"`);
    console.log('Metrics:');
    console.log(`  Overall: ${result.gradingResult.score}`);
    console.log(`  Components:`);
    for (const [key, value] of Object.entries(result.namedScores)) {
      console.log(`    ${key}: ${value}`);
    }
  });

  console.log('---------------------');
  console.log('Done.');
})();
