import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
} from '../src/redteam/constants';
import { redTeamSchema } from '../src/types';

describe('redTeamSchema', () => {
  it('should accept a valid configuration with all fields', () => {
    const input = {
      purpose: 'Test AI safety',
      numTests: 3,
      plugins: [
        { name: 'jailbreak', numTests: 5 },
        'prompt-injection',
        { name: 'malicious-output' },
      ],
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        purpose: 'Test AI safety',
        numTests: 3,
        plugins: [
          { name: 'jailbreak', numTests: 5 },
          { name: 'prompt-injection', numTests: 3 },
          { name: 'malicious-output', numTests: 3 },
        ],
      });
    }
  });

  it('should use default values when fields are omitted', () => {
    const input = {};
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        numTests: 5,
        plugins: Array.from(REDTEAM_DEFAULT_PLUGINS).map((name) => ({ name, numTests: 5 })),
      });
    }
  });

  it('should allow omitting the purpose field', () => {
    const input = { numTests: 10 };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.purpose).toBeUndefined();
    }
  });

  it('should transform string plugins to objects', () => {
    const input = {
      plugins: ['jailbreak', 'prompt-injection'],
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plugins).toEqual([
        { name: 'jailbreak', numTests: 5 },
        { name: 'prompt-injection', numTests: 5 },
      ]);
    }
  });

  it('should use global numTests for plugins without specified numTests', () => {
    const input = {
      numTests: 7,
      plugins: [
        { name: 'jailbreak', numTests: 3 },
        { name: 'prompt-injection' },
        'malicious-output',
      ],
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plugins).toEqual([
        { name: 'jailbreak', numTests: 3 },
        { name: 'prompt-injection', numTests: 7 },
        { name: 'malicious-output', numTests: 7 },
      ]);
    }
  });

  it('should reject invalid plugin names', () => {
    const input = {
      plugins: ['invalid-plugin-name'],
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject negative numTests', () => {
    const input = {
      numTests: -1,
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer numTests', () => {
    const input = {
      numTests: 3.5,
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should allow all valid plugin names', () => {
    const input = {
      plugins: REDTEAM_ALL_PLUGINS,
    };
    const result = redTeamSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plugins.length).toBe(REDTEAM_ALL_PLUGINS.length);
      expect(result.data.plugins.every((plugin) => REDTEAM_ALL_PLUGINS.includes(plugin.name))).toBe(
        true,
      );
    }
  });
});
