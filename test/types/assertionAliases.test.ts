import { describe, expect, it } from 'vitest';
import { TestSuiteConfigSchema } from '../../src/types/index';

describe('assertionAliases configuration', () => {
  const config = {
    providers: ['echo'],
    prompts: ['Hello'],
    assertionAliases: [
      {
        label: 'checks-callsite-value',
        type: 'javascript',
        script: 'file://assertions/check-value.mjs:checkValue',
      },
    ],
  };

  it.each([
    'javascript',
    'python',
    'ruby',
  ] as const)('accepts %s named script assertion aliases', (type) => {
    const result = TestSuiteConfigSchema.safeParse({
      ...config,
      assertionAliases: [{ ...config.assertionAliases[0], type }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        assertionAliases: [{ ...config.assertionAliases[0], type }],
      });
    }
  });

  it('rejects aliases that reuse a label', () => {
    expect(
      TestSuiteConfigSchema.safeParse({
        ...config,
        assertionAliases: [...config.assertionAliases, config.assertionAliases[0]],
      }).success,
    ).toBe(false);
  });

  it('rejects aliases that collide with built-in assertion types', () => {
    expect(
      TestSuiteConfigSchema.safeParse({
        ...config,
        assertionAliases: [
          {
            label: 'contains',
            type: 'javascript',
            script: 'file://assertions/check-value.mjs:checkValue',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects aliases whose labels use the select assertion prefix', () => {
    const label = 'select-length';
    const result = TestSuiteConfigSchema.safeParse({
      ...config,
      assertionAliases: [{ ...config.assertionAliases[0], label }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        `Assertion alias label conflicts with built-in assertion type: ${label}`,
      );
    }
  });

  it.each([
    'promptfoo:redteam:harmful',
    'not-promptfoo:redteam:harmful',
  ])('rejects %s as a reserved Redteam assertion type', (label) => {
    const result = TestSuiteConfigSchema.safeParse({
      ...config,
      assertionAliases: [{ ...config.assertionAliases[0], label }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        `Assertion alias label conflicts with built-in assertion type: ${label}`,
      );
    }
  });
});
