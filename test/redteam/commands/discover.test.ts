import type { z } from 'zod';
import { ArgsSchema } from '../../../src/redteam/commands/discover';

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
    args.overwrite = false;
    const { success: success2, error: error2 } = ArgsSchema.safeParse(args);
    expect(success2).toBe(true);
    expect(error2).toBeUndefined();

    // Add the output flag:
    args.output = 'test';
    const { success: success3, error: error3 } = ArgsSchema.safeParse(args);
    expect(success3).toBe(true);
    expect(error3).toBeUndefined();
  });
});
