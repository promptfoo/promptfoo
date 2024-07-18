import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
} from '../src/redteam/constants';
import { redTeamSchema } from '../src/types';

describe('redTeamSchema', () => {
  it('should accept a valid configuration with all fields', () => {
    const input = {
      purpose: 'You are a travel agent',
      numTests: 3,
      plugins: [
        { name: 'harmful:non-violent-crime', numTests: 5 },
        'prompt-injection',
        { name: 'hijacking' },
      ],
    };
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        purpose: 'You are a travel agent',
        plugins: [
          { name: 'harmful:non-violent-crime', numTests: 5 },
          { name: 'hijacking', numTests: 3 },
          { name: 'prompt-injection', numTests: 3 },
        ],
      },
    });
  });

  it('should use default values when fields are omitted', () => {
    const input = {};
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: Array.from(REDTEAM_DEFAULT_PLUGINS)
          .sort()
          .filter((name) => name !== 'harmful')
          .map((name) => ({ name, numTests: 5 })),
      },
    });
  });

  it('should allow omitting the purpose field', () => {
    const input = { numTests: 10 };
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        purpose: undefined,
        plugins: Array.from(REDTEAM_DEFAULT_PLUGINS)
          .sort()
          .filter((name) => name !== 'harmful')
          .map((name) => ({ name, numTests: 10 })),
      },
    });
  });

  it('should transform string plugins to objects', () => {
    const input = {
      plugins: ['jailbreak', 'prompt-injection'],
    };
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [
          { name: 'jailbreak', numTests: 5 },
          { name: 'prompt-injection', numTests: 5 },
        ],
      },
    });
  });

  it('should use global numTests for plugins without specified numTests', () => {
    const input = {
      numTests: 7,
      plugins: [
        { name: 'jailbreak', numTests: 3 },
        { name: 'prompt-injection' },
        'harmful:non-violent-crime',
      ],
    };
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [
          { name: 'harmful:non-violent-crime', numTests: 7 },
          { name: 'jailbreak', numTests: 3 },
          { name: 'prompt-injection', numTests: 7 },
        ],
      },
    });
  });

  it('should reject invalid plugin names', () => {
    const input = {
      plugins: ['invalid-plugin-name'],
    };
    expect(redTeamSchema.safeParse(input).success).toEqual(false);
  });

  it('should reject negative numTests', () => {
    const input = {
      numTests: -1,
    };
    expect(redTeamSchema.safeParse(input).success).toBe(false);
  });

  it('should reject non-integer numTests', () => {
    const input = {
      numTests: 3.5,
    };
    expect(redTeamSchema.safeParse(input).success).toBe(false);
  });

  it('should allow all valid plugin names', () => {
    const input = {
      plugins: REDTEAM_ALL_PLUGINS,
    };
    expect(redTeamSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: REDTEAM_ALL_PLUGINS.filter((name) => name !== 'harmful').map((name) => ({
          name,
          numTests: 5,
        })),
      },
    });
  });
});
