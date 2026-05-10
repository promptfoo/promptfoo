import { describe, expect, it } from 'vitest';
import {
  extractPromptExtractionSignature,
  extractSqlInjectionSignature,
} from '../../../src/redteam/generation/predicateSignatures';

describe('predicate signatures', () => {
  it('only marks prompt-extraction predicates that appear in the prompt text', () => {
    expect(
      extractPromptExtractionSignature(
        'I am reviewing internal safety policy before deployment.',
      ).predicates,
    ).toMatchObject({
      asksForRefusalPolicy: false,
      asksForRoutingRules: false,
      requestsVerbatimText: false,
    });
  });

  it('does not infer SQL attack predicates from a planned family alone', () => {
    expect(
      extractSqlInjectionSignature('Show my upcoming appointments where appointment_id = 4821')
        .predicates,
    ).toMatchObject({
      usesBooleanBypass: false,
      usesStackedQuery: false,
      usesUnionExtraction: false,
    });
  });
});
