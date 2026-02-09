import { bench, describe } from 'vitest';
import {
  convertSlashCommentsToHash,
  extractJsonObjects,
  safeJsonStringify,
} from '../src/util/json';

// Small JSON embedded in text
const smallJsonText = 'Here is the result: {"pass": true, "score": 0.95, "reason": "Looks good"}';

// Nested JSON with multiple objects
const nestedJsonText = `The model returned:
{"analysis": {"sentiment": "positive", "confidence": 0.87, "topics": ["AI", "ML", "NLP"]}}
And also:
{"pass": true, "score": 1, "reason": "All criteria met"}`;

// Large JSON resembling LLM evaluation output
const largeJsonText =
  '{"results": [' +
  Array(50)
    .fill(
      '{"id": "test-123", "output": "The answer to the question is that machine learning models learn from data patterns.", ' +
        '"score": 0.92, "pass": true, "reason": "Output matches expected criteria", ' +
        '"metadata": {"latency": 245, "tokens": 42, "model": "gpt-4"}}',
    )
    .join(',') +
  ']}';

// Simple object for safeJsonStringify
const simpleObject = { name: 'test', value: 42, nested: { a: 1, b: 'hello' } };

// Object with circular reference
const circularObject: Record<string, unknown> = { name: 'circular', data: [1, 2, 3] };
circularObject.self = circularObject;

// Large object
const largeObject = {
  results: Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i}`,
    score: Math.random(),
    output: `This is test output number ${i} with some additional text to make it realistic.`,
    metadata: { timestamp: Date.now(), index: i },
  })),
};

// Text with slash comments
const simpleCommentText = `key: "value" // this is a comment
another: "thing" // another comment`;

const mixedCommentText = `url: "https://example.com/path" // real comment
// standalone comment
data: "hello // not a comment" // but this is
nested: 'it's a test' // comment here`;

const largeCommentText = Array(100)
  .fill('config_key: "some_value" // configuration comment for this setting')
  .join('\n');

describe('extractJsonObjects', () => {
  bench('small JSON in text', () => {
    extractJsonObjects(smallJsonText);
  });

  bench('nested JSON with multiple objects', () => {
    extractJsonObjects(nestedJsonText);
  });

  bench('large JSON array', () => {
    extractJsonObjects(largeJsonText);
  });
});

describe('safeJsonStringify', () => {
  bench('simple object', () => {
    safeJsonStringify(simpleObject);
  });

  bench('circular reference', () => {
    safeJsonStringify(circularObject);
  });

  bench('large object', () => {
    safeJsonStringify(largeObject);
  });

  bench('large object pretty-printed', () => {
    safeJsonStringify(largeObject, true);
  });
});

describe('convertSlashCommentsToHash', () => {
  bench('simple comments', () => {
    convertSlashCommentsToHash(simpleCommentText);
  });

  bench('mixed content with URLs and strings', () => {
    convertSlashCommentsToHash(mixedCommentText);
  });

  bench('large file with many comment lines', () => {
    convertSlashCommentsToHash(largeCommentText);
  });
});
