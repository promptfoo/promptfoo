import { describe, expect, it } from 'vitest';
import {
  getMissingAssertionVariables,
  getRequiredAssertionVariables,
} from './assertionPrerequisites';

describe('getRequiredAssertionVariables', () => {
  it('returns nothing when there are no context assertions', () => {
    expect(getRequiredAssertionVariables(undefined)).toEqual([]);
    expect(getRequiredAssertionVariables([{ type: 'contains', value: 'x' }])).toEqual([]);
  });

  it('requires query and context for context assertions', () => {
    expect(getRequiredAssertionVariables([{ type: 'context-faithfulness' }])).toEqual([
      'query',
      'context',
    ]);
    expect(getRequiredAssertionVariables([{ type: 'context-relevance' }])).toEqual([
      'query',
      'context',
    ]);
  });

  it('covers the not-prefixed context assertion variants', () => {
    expect(getRequiredAssertionVariables([{ type: 'not-context-faithfulness' }])).toEqual([
      'query',
      'context',
    ]);
    expect(getRequiredAssertionVariables([{ type: 'not-context-relevance' }])).toEqual([
      'query',
      'context',
    ]);
  });

  it('drops the context requirement when a non-blank contextTransform supplies it', () => {
    expect(
      getRequiredAssertionVariables([
        { type: 'context-faithfulness', contextTransform: 'output.context' },
      ]),
    ).toEqual(['query']);
  });

  it('keeps the context requirement when contextTransform is blank', () => {
    expect(
      getRequiredAssertionVariables([{ type: 'context-relevance', contextTransform: '   ' }]),
    ).toEqual(['query', 'context']);
  });

  it('requires context if any context assertion lacks a contextTransform', () => {
    expect(
      getRequiredAssertionVariables([
        { type: 'context-faithfulness', contextTransform: 'output.context' },
        { type: 'context-relevance' },
      ]),
    ).toEqual(['query', 'context']);
  });

  it('unwraps one level of assert-set wrappers', () => {
    expect(
      getRequiredAssertionVariables([
        { type: 'assert-set', assert: [{ type: 'context-faithfulness' }] },
      ]),
    ).toEqual(['query', 'context']);
  });
});

describe('getMissingAssertionVariables', () => {
  const contextAssertions = [{ type: 'context-faithfulness' }];

  it('reports both query and context when neither is provided', () => {
    expect(getMissingAssertionVariables(contextAssertions, {})).toEqual(['query', 'context']);
  });

  it('treats non-blank strings and non-empty string arrays as usable', () => {
    expect(getMissingAssertionVariables(contextAssertions, { query: 'q', context: 'c' })).toEqual(
      [],
    );
    expect(
      getMissingAssertionVariables(contextAssertions, { query: ['a', 'b'], context: 'c' }),
    ).toEqual([]);
  });

  it('treats blanks, numbers, objects, and mixed arrays as missing', () => {
    expect(getMissingAssertionVariables(contextAssertions, { query: '   ', context: 'c' })).toEqual(
      ['query'],
    );
    expect(getMissingAssertionVariables(contextAssertions, { query: 123, context: 'c' })).toEqual([
      'query',
    ]);
    expect(getMissingAssertionVariables(contextAssertions, { query: {}, context: 'c' })).toEqual([
      'query',
    ]);
    expect(
      getMissingAssertionVariables(contextAssertions, { query: ['a', 2], context: 'c' }),
    ).toEqual(['query']);
  });

  it('returns nothing when vars may come from an external file', () => {
    expect(getMissingAssertionVariables(contextAssertions, {}, true)).toEqual([]);
  });

  it('returns nothing when there are no context assertions', () => {
    expect(getMissingAssertionVariables([{ type: 'equals', value: 'x' }], {})).toEqual([]);
  });
});
