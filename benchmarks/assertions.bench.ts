import { bench, describe } from 'vitest';
import { calculateBleuScore } from '../src/assertions/bleu';
import { calculateGleuScore } from '../src/assertions/gleu';
import { getNGrams } from '../src/assertions/ngrams';

// Short sentence inputs
const shortCandidate = 'The cat sat on the mat in the room';
const shortReferences = ['The cat sat on the mat in the room'];

// Paragraph-length inputs
const paragraphCandidate =
  'Machine learning is a subset of artificial intelligence that focuses on building systems ' +
  'that learn from data. These systems improve their performance over time without being ' +
  'explicitly programmed. Deep learning is a further subset that uses neural networks with ' +
  'many layers to analyze various factors of data.';
const paragraphReferences = [
  'Machine learning is a branch of artificial intelligence focused on creating systems that ' +
    'learn from and make decisions based on data. These systems automatically improve through ' +
    'experience. Deep learning uses multi-layered neural networks to process complex data patterns.',
];

// Long document inputs
const longCandidate = Array(20)
  .fill(
    'Natural language processing enables computers to understand and generate human language. ' +
      'It combines computational linguistics with statistical and deep learning models. ' +
      'Applications include machine translation, sentiment analysis, and text summarization.',
  )
  .join(' ');
const longReferences = [
  Array(20)
    .fill(
      'Natural language processing allows machines to comprehend and produce human language text. ' +
        'It merges computational linguistics with machine learning techniques. ' +
        'Common uses include translation between languages, opinion mining, and document condensation.',
    )
    .join(' '),
];

// Pre-split words for n-gram benchmarks
const shortWords = shortCandidate.toLowerCase().split(/\s+/);
const paragraphWords = paragraphCandidate.toLowerCase().split(/\s+/);
const longWords = longCandidate.toLowerCase().split(/\s+/);

describe('N-gram Generation', () => {
  bench('unigrams - short text', () => {
    getNGrams(shortWords, 1);
  });

  bench('bigrams - paragraph text', () => {
    getNGrams(paragraphWords, 2);
  });

  bench('4-grams - long text', () => {
    getNGrams(longWords, 4);
  });
});

describe('BLEU Score', () => {
  bench('short sentence', () => {
    calculateBleuScore(shortCandidate, shortReferences);
  });

  bench('paragraph', () => {
    calculateBleuScore(paragraphCandidate, paragraphReferences);
  });

  bench('long document', () => {
    calculateBleuScore(longCandidate, longReferences);
  });
});

describe('GLEU Score', () => {
  bench('short sentence', () => {
    calculateGleuScore(shortCandidate, shortReferences);
  });

  bench('paragraph', () => {
    calculateGleuScore(paragraphCandidate, paragraphReferences);
  });

  bench('long document', () => {
    calculateGleuScore(longCandidate, longReferences);
  });
});
