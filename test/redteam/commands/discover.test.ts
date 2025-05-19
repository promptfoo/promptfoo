import type { z } from 'zod';
import { fetchWithProxy } from '../../../src/fetch';
import {
  ArgsSchema,
  DEFAULT_TURN_COUNT,
  doTargetPurposeDiscovery,
  mergePurposes,
} from '../../../src/redteam/commands/discover';
import type { ApiProvider } from '../../../src/types';

jest.mock('../../../src/fetch');

jest.mock('cli-progress');

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

  it('`output` and `preview` are mutually exclusive', () => {
    const args: z.infer<typeof ArgsSchema> = {
      config: 'test',
      output: 'test',
      preview: true,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify both output and preview!');

    // Remove the preview flag:
    args.preview = false;
    const { success: success2, error: error2 } = ArgsSchema.safeParse(args);
    expect(success2).toBe(true);
    expect(error2).toBeUndefined();

    // Remove the output flag:
    args.preview = true;
    args.output = undefined;
    const { success: success3, error: error3 } = ArgsSchema.safeParse(args);
    expect(success3).toBe(true);
    expect(error3).toBeUndefined();
  });

  it('`overwrite` can only be used if `output` is provided', () => {
    const args: z.infer<typeof ArgsSchema> = {
      config: 'test',
      preview: false,
      overwrite: true,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify overwrite without output!');

    // Remove the overwrite flag:
    args.output = 'test';
    args.overwrite = false;
    const { success: success2, error: error2 } = ArgsSchema.safeParse(args);
    expect(success2).toBe(true);
    expect(error2).toBeUndefined();

    // Overwrite to true
    args.overwrite = true;
    const { success: success3, error: error3 } = ArgsSchema.safeParse(args);
    expect(success3).toBe(true);
    expect(error3).toBeUndefined();
  });

  it('If `preview` is false, `output` must be provided', () => {
    const args: z.infer<typeof ArgsSchema> = {
      config: 'test',
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('If preview is false, output must be provided!');

    // Remove the preview flag:
    args.preview = true;
    const { success: success2, error: error2 } = ArgsSchema.safeParse(args);
    expect(success2).toBe(true);
    expect(error2).toBeUndefined();
  });
});

describe('mergePurposes', () => {
  it('should correctly merge human-defined and discovered purposes', () => {
    const humanDefined = 'This is a human defined purpose';
    const discovered = 'This is a discovered purpose';
    const expected = `${humanDefined}\n\nDiscovered Purpose:\n\n${discovered}`;

    expect(mergePurposes(humanDefined, discovered)).toBe(expected);
  });
});

describe('doTargetPurposeDiscovery', () => {
  const mockTarget: ApiProvider = {
    id: () => 'test-target',
    callApi: jest.fn().mockResolvedValue({ output: 'test response' }),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should throw error when question is undefined', async () => {
    const mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ done: false }),
      statusText: 'Bad Request',
    } as Response;
    jest.mocked(fetchWithProxy).mockResolvedValue(mockFetchResponse);

    await expect(doTargetPurposeDiscovery(mockTarget)).rejects.toThrow(
      'Failed to discover purpose: Bad Request',
    );
  });

  it('should use DEFAULT_TURN_COUNT when maxTurns not provided', async () => {
    const mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ done: true, purpose: 'discovered purpose' }),
    } as Response;
    jest.mocked(fetchWithProxy).mockResolvedValue(mockFetchResponse);

    await doTargetPurposeDiscovery(mockTarget);

    expect(fetchWithProxy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(`"maxTurns":${DEFAULT_TURN_COUNT}`),
      }),
    );
  });

  it('should use provided maxTurns value', async () => {
    const mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ done: true, purpose: 'discovered purpose' }),
    } as Response;
    jest.mocked(fetchWithProxy).mockResolvedValue(mockFetchResponse);

    const customTurns = 10;
    await doTargetPurposeDiscovery(mockTarget, customTurns);

    expect(fetchWithProxy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining(`"maxTurns":${customTurns}`),
      }),
    );
  });
});
