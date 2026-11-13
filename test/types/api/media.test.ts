import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MediaParamsSchema, MediaSchemas } from '../../../src/types/api/media';

describe('legacy media parameter schema composition', () => {
  it.each([
    ['MediaParamsSchema', MediaParamsSchema],
    ['MediaSchemas.Get.Params', MediaSchemas.Get.Params],
    ['MediaSchemas.Info.Params', MediaSchemas.Info.Params],
  ] as const)('preserves the ZodObject API for %s', (_name, schema) => {
    const params = { type: 'audio', filename: 'abcdef123456.mp3' };
    expect(schema.shape.filename.parse(params.filename)).toBe(params.filename);
    expect(schema.pick({ filename: true }).parse(params)).toEqual({ filename: params.filename });
    expect(
      schema.extend({ requestId: z.string() }).parse({ ...params, requestId: 'request' }),
    ).toEqual({
      ...params,
      requestId: 'request',
    });
    expect(schema.safeParse({ type: 'audio', filename: '../private' }).success).toBe(false);
    expect(schema.safeParse({ type: 'document', filename: params.filename }).success).toBe(false);
  });
});
