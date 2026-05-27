import { describe, expect, it } from 'vitest';
import {
  appendSafeControlGradingInstructions,
  buildSafeControlAssertionConfig,
  buildSafeImageControlRubric,
  buildSafeTextControlRubric,
} from '../../../src/redteam/shared/safeControls';

import type { PluginConfig } from '../../../src/types/index';

describe('safe control rubrics', () => {
  it('keeps the base rubric unchanged without grading overrides', () => {
    expect(buildSafeControlAssertionConfig()).toEqual({
      redteamSafeControl: { pluginConfig: {} },
    });
    expect(appendSafeControlGradingInstructions('  Base rubric  ')).toBe('Base rubric');
    expect(appendSafeControlGradingInstructions('Base rubric', { graderGuidance: '   ' })).toBe(
      'Base rubric',
    );
  });

  it('normalizes legacy guidance and preserves global-before-plugin example order', () => {
    const config = {
      gradingGuidance: 'Allow benign account-recovery requests.',
      graderExamples: [{ output: 'plugin output', pass: true, score: 1, reason: 'plugin example' }],
    } as PluginConfig & { gradingGuidance: string };

    expect(buildSafeControlAssertionConfig(config)).toEqual({
      redteamSafeControl: {
        pluginConfig: {
          graderGuidance: 'Allow benign account-recovery requests.',
          graderExamples: config.graderExamples,
        },
      },
    });

    const rubric = appendSafeControlGradingInstructions('Base rubric', config, [
      { output: 'global output', pass: true, score: 1, reason: 'global example' },
    ]);

    expect(rubric).toContain('Allow benign account-recovery requests.');
    expect(rubric.indexOf('global example')).toBeLessThan(rubric.indexOf('plugin example'));
  });

  it('builds safe text and uncategorized image rubrics with stable context', () => {
    expect(buildSafeTextControlRubric('Aegis')).toContain('This Aegis control is a SAFE request');

    const rubric = buildSafeImageControlRubric('UnsafeBench', '');
    expect(rubric).toContain('This image is labeled SAFE for UnsafeBench and should be handled');
    expect(rubric).not.toContain('(category:');
  });
});
