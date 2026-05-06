import { describe, expect, it } from 'vitest';
import {
  countTests,
  normalizePrompts,
  normalizePromptsForJob,
  normalizeProviders,
} from './setupReadiness';

describe('setupReadiness', () => {
  describe('normalizeProviders', () => {
    it('normalizes shorthand providers and ignores blank values', () => {
      expect(normalizeProviders(['openai:gpt-4.1', ''])).toEqual([{ id: 'openai:gpt-4.1' }]);
    });

    it('preserves provider option objects that include extra config keys', () => {
      const provider = {
        id: 'openai:gpt-4.1',
        label: 'GPT-4.1',
        config: { temperature: 0 },
        customHeader: 'x-trace-id',
      };

      expect(
        normalizeProviders([provider] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([provider]);
    });

    it('does not fabricate providers from provider option objects without ids', () => {
      expect(
        normalizeProviders([
          {
            label: 'Missing id',
            config: { temperature: 0 },
            customHeader: 'x-trace-id',
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([]);
    });

    it('normalizes provider maps and skips malformed entries', () => {
      expect(
        normalizeProviders([
          {
            'openai:gpt-4.1': { config: { temperature: 0 } },
            broken: 'not provider options',
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([{ id: 'openai:gpt-4.1', config: { temperature: 0 } }]);
    });

    it('normalizes provider maps whose ids overlap provider option keys', () => {
      expect(
        normalizeProviders([
          {
            label: { id: 'openai:gpt-4.1', config: { temperature: 0 } },
          },
        ] as unknown as Parameters<typeof normalizeProviders>[0]),
      ).toEqual([{ id: 'openai:gpt-4.1', config: { temperature: 0 } }]);
    });
  });

  describe('normalizePrompts', () => {
    it('normalizes scalar, inline, raw, and legacy map prompts', () => {
      expect(normalizePrompts('file://prompt.txt')).toEqual(['file://prompt.txt']);
      expect(
        normalizePrompts([
          'inline prompt',
          { raw: 'raw prompt', label: 'Raw prompt' },
          { id: 'x' },
        ]),
      ).toEqual(['inline prompt', 'raw prompt', 'x']);
      expect(normalizePrompts({ 'Write about {{topic}}': 'Prompt label' })).toEqual([
        'Write about {{topic}}',
      ]);
    });

    it('filters blank prompt values', () => {
      expect(normalizePrompts('   ')).toEqual([]);
      expect(normalizePrompts(['', { raw: '   ', label: 'Blank prompt' }])).toEqual([]);
      expect(normalizePrompts([{ raw: '   ', id: 'file://prompt.txt' }])).toEqual([
        'file://prompt.txt',
      ]);
      expect(normalizePrompts(undefined)).toEqual([]);
    });
  });

  describe('normalizePromptsForJob', () => {
    it('serializes scalar and legacy map prompts for eval job submission', () => {
      expect(normalizePromptsForJob('file://prompt.txt')).toEqual(['file://prompt.txt']);
      expect(normalizePromptsForJob({ 'file://prompt.txt': 'Prompt label' })).toEqual([
        { raw: 'file://prompt.txt', label: 'Prompt label' },
      ]);
    });

    it('preserves arrays and filters malformed legacy map entries', () => {
      const promptArray = ['inline prompt', { raw: 'raw prompt', label: 'Raw prompt' }];

      expect(normalizePromptsForJob(promptArray)).toEqual(promptArray);
      expect(
        normalizePromptsForJob({
          'file://prompt.txt': 'Prompt label',
          '': 'Missing raw',
          'file://blank.txt': '   ',
        }),
      ).toEqual([{ raw: 'file://prompt.txt', label: 'Prompt label' }]);
      expect(normalizePromptsForJob(undefined)).toEqual([]);
    });
  });

  describe('countTests', () => {
    it('counts inline, scalar, and generated test configs', () => {
      expect(countTests([{ vars: { topic: 'cats' } }, { vars: { topic: 'dogs' } }])).toBe(2);
      expect(countTests('file://tests.csv')).toBe(1);
      expect(countTests({ path: 'file://generate-tests.js' })).toBe(1);
    });

    it('ignores blank or missing test configs', () => {
      expect(countTests('   ')).toBe(0);
      expect(countTests(undefined)).toBe(0);
    });
  });
});
