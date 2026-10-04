import { validateYamlConfigDraft } from '@app/pages/eval-creator/components/yamlConfigValidation';
import { describe, expect, it } from 'vitest';
import { toPortableConfig } from './portableConfig';

describe('toPortableConfig', () => {
  const savedConfig = {
    basePath: '/home/user/project',
    description: 'saved eval',
    prompts: ['file:///home/user/project/prompt.txt'],
    providers: ['echo'],
    tests: [{ vars: { topic: 'portable configs' } }],
  };

  it('drops the saved base path and keeps everything else', () => {
    const { basePath, ...rest } = savedConfig;

    expect(basePath).toBe('/home/user/project');
    expect(toPortableConfig(savedConfig)).toEqual(rest);
    expect(savedConfig).toHaveProperty('basePath');
  });

  it('returns configs without a base path unchanged', () => {
    const config = { prompts: ['hello'], providers: ['echo'] };

    expect(toPortableConfig(config)).toBe(config);
    expect(toPortableConfig(null)).toBeNull();
    expect(toPortableConfig(undefined)).toBeUndefined();
  });

  it('produces a config that the eval creator accepts', () => {
    expect(validateYamlConfigDraft(savedConfig)).toMatchObject({
      success: false,
      error: expect.stringContaining('basePath'),
    });
    expect(validateYamlConfigDraft(toPortableConfig(savedConfig))).toMatchObject({ success: true });
  });
});
