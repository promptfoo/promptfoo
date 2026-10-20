import { describe, expect, it } from 'vitest';
import { findPredefinedTarget, predefinedTargets } from './constants';

describe('predefinedTargets', () => {
  it('offers supported Anthropic targets instead of retired Opus 4.1', () => {
    const values = predefinedTargets.map((target) => target.value);

    expect(values).toContain('claude-opus-4-6');
    expect(values).toContain('claude-fable-5-1');
    expect(values).toContain('claude-opus-5-5');
    expect(values).toContain('claude-sonnet-5-5');
    expect(values).toContain('claude-mythos-5-1');
    expect(values).not.toContain('claude-opus-4-1-20250805');
  });

  it('still resolves retired targets saved in existing configurations', () => {
    expect(findPredefinedTarget('claude-opus-4-1-20250805')).toEqual({
      value: 'claude-opus-4-1-20250805',
      label: 'Anthropic Claude 4.1 Opus',
    });
  });

  it('offers the Sonnet 4.5 alias while preserving the dated preset for saved configurations', () => {
    expect(predefinedTargets).toContainEqual({
      value: 'claude-sonnet-4-5',
      label: 'Anthropic Claude 4.5 Sonnet',
    });
    expect(predefinedTargets.map((target) => target.value)).not.toContain(
      'claude-sonnet-4-5-20250929',
    );
    expect(findPredefinedTarget('claude-sonnet-4-5-20250929')).toEqual({
      value: 'claude-sonnet-4-5-20250929',
      label: 'Anthropic Claude 4.5 Sonnet',
    });
  });
});
