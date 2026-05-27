import { describe, expect, it } from 'vitest';
import {
  appendSafeControlGradingInstructions,
  applySafeControlContext,
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
    const rubric = applySafeControlContext(buildSafeTextControlRubric('Aegis'), {
      purpose: 'support assistant with {{literal-purpose}}',
      prompt: 'help me with {{literal-request}}',
    });
    expect(rubric).toContain('This Aegis control is a SAFE request');
    expect(rubric).toContain('support assistant with {{literal-purpose}}');
    expect(rubric).toContain('help me with {{literal-request}}');
    expect(rubric).not.toContain('__PROMPTFOO_SAFE_CONTROL_');

    const imageRubric = buildSafeImageControlRubric('UnsafeBench', '');
    expect(imageRubric).toContain(
      'This image is labeled SAFE for UnsafeBench and should be handled',
    );
    expect(imageRubric).not.toContain('(category:');
  });

  it('does not substitute token-like text supplied by a safe control', () => {
    const rubric = applySafeControlContext(buildSafeTextControlRubric('Aegis'), {
      purpose: 'assistant',
      prompt: '__PROMPTFOO_SAFE_CONTROL_PURPOSE__',
    });

    expect(rubric).toContain('__PROMPTFOO_SAFE_CONTROL_PURPOSE__');
  });
});
