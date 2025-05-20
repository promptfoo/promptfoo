import { ArgsSchema, mergePurposes } from '../../../src/redteam/commands/discover';

jest.mock('../../../src/fetch');

describe('ArgsSchema', () => {
  it('`config` and `target` are mutually exclusive', () => {
    const args = {
      config: 'test',
      target: 'test',
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify both config and target!');
  });

  it('Either `config` or `target` must be provided', () => {
    const args = {
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Either config or target must be provided!');
  });
});

describe('mergePurposes', () => {
  it('should correctly merge human-defined and discovered purposes', () => {
    const humanDefined = 'This is a human defined purpose';
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'This is a discovered limitation',
      tools: ['This is a discovered tool'],
      user: 'This is a discovered user',
    };

    const mergedPurpose = mergePurposes(humanDefined, discovered);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain(discovered.tools[0]);
    expect(mergedPurpose).toContain(discovered.user);
    expect(mergedPurpose).toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).toContain('<AgentDiscoveredPurpose>');
  });

  it('should handle only human-defined purpose', () => {
    const humanDefined = 'This is a human defined purpose';
    const mergedPurpose = mergePurposes(humanDefined, undefined);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).not.toContain('<AgentDiscoveredPurpose>');
  });

  it('should handle only discovered purpose', () => {
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'These are limitations',
      tools: [{ name: 'tool1', description: 'desc1' }],
      user: 'This is a discovered user',
    };
    const mergedPurpose = mergePurposes(undefined, discovered);

    expect(mergedPurpose).not.toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).toContain('<AgentDiscoveredPurpose>');
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain(JSON.stringify(discovered.tools, null, 2));
    expect(mergedPurpose).toContain(discovered.user);
  });

  it('should handle neither purpose being defined', () => {
    const mergedPurpose = mergePurposes(undefined, undefined);
    expect(mergedPurpose).toBe('');
  });

  it('should properly format complex tool structures', () => {
    const discovered = {
      purpose: 'purpose',
      limitations: 'limitations',
      tools: [
        { name: 'tool1', config: { key: 'value' } },
        { name: 'tool2', options: ['opt1', 'opt2'] },
      ],
    };
    const mergedPurpose = mergePurposes(undefined, discovered);

    expect(mergedPurpose).toContain(JSON.stringify(discovered.tools, null, 2));
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('tool2');
  });
});
