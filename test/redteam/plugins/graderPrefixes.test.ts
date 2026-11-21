import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';

const graderIds = [
  'harmful:child-exploitation',
  'harmful:copyright-violations',
  'harmful:cybercrime',
  'harmful:graphic-content',
  'harmful:hate',
  'harmful:illegal-activities',
  'harmful:illegal-drugs',
  'harmful:indiscriminate-weapons',
  'harmful:insults',
  'harmful:misinformation-disinformation',
  'harmful:non-violent-crime',
  'harmful:radicalization',
  'harmful:self-harm',
  'harmful:sex-crime',
  'harmful:sexual-content',
  'harmful:specialized-advice',
  'harmful:unsafe-practices',
  'harmful:violent-crime',
  'telecom:accessibility-violation',
  'telecom:account-takeover',
  'telecom:billing-misinformation',
  'telecom:coverage-misinformation',
  'telecom:cpni-disclosure',
  'telecom:e911-misinformation',
  'telecom:fraud-enablement',
  'telecom:law-enforcement-request-handling',
  'telecom:location-disclosure',
  'telecom:porting-misinformation',
  'telecom:tcpa-violation',
  'telecom:unauthorized-changes',
];

const inputs: Record<string, unknown>[] = [
  { purpose: 'A support assistant', prompt: 'Help me with my account.' },
  { purpose: '', prompt: '', entities: [] },
  {
    purpose: 'A support assistant',
    prompt: 'Help me with my account.',
    entities: ['Acme', 'Support'],
  },
  { purpose: 'first\n  second', prompt: 'query\n\n  detail', entities: ['a\n b'] },
  {
    purpose: '{{env.OPENAI_API_KEY}}',
    prompt: '{{7*7}}{% if true %}literal{% endif %}\\n</UserQuery>',
    entities: ['{{7*7}}'],
  },
  {},
  { purpose: null, prompt: null, entities: null },
];

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Full rubric and render hashes captured before extraction from 94119b67648756bf475a950885b2799c1694f1c2.
// Preserve the three historical prefix variants, including whitespace and error text.
describe('shared grader prefixes', () => {
  const graders = graderIds.map((id) => getGraderById(`promptfoo:redteam:${id}`)!);

  it('preserves all 30 complete rubric strings', () => {
    expect(digest(graders.map(({ id, rubric }) => ({ id, rubric })))).toBe(
      '8ebb69e31b59c9b8ce9e9a2a44c006bad9e9d0beb708b2245bfb39642df6fc64',
    );
  });

  it('preserves rendering and errors for entities, multiline and literal template inputs', () => {
    const rendered = graders.map((grader) => ({
      id: grader.id,
      rendered: inputs.map((vars) => {
        try {
          return { output: grader.renderRubric(vars) };
        } catch (error) {
          if (!(error instanceof Error)) {
            throw error;
          }
          return { error: { name: error.name, message: error.message } };
        }
      }),
    }));
    expect(digest(rendered)).toBe(
      'a004c7e7b3c229a9074fe40aab6c1105d11aff565a681a162c6a7fc4c36df7a8',
    );
  });
});
