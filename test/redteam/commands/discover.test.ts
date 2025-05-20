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
    };

    const mergedPurpose = mergePurposes(humanDefined, discovered);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain(discovered.tools[0]);
  });
});
