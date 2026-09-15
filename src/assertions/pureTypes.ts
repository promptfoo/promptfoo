const pureAssertionBaseTypes = [
  'bleu',
  'contains',
  'contains-all',
  'contains-any',
  'cost',
  'equals',
  'finish-reason',
  'gleu',
  'icontains',
  'icontains-all',
  'icontains-any',
  'latency',
  'perplexity',
  'perplexity-score',
  'regex',
  'starts-with',
  'tool-call-f1',
  'word-count',
] as const;
export type PureAssertionBaseType = (typeof pureAssertionBaseTypes)[number];
export const pureInverseAssertionBaseTypes = pureAssertionBaseTypes.filter(
  (type) =>
    type !== 'cost' && type !== 'latency' && type !== 'perplexity' && type !== 'perplexity-score',
);
type PureInverseAssertionBaseType = (typeof pureInverseAssertionBaseTypes)[number];
export type PureAssertionType = PureAssertionBaseType | `not-${PureInverseAssertionBaseType}`;
