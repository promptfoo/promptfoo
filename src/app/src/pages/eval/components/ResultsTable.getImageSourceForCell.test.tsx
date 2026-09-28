import type { EvaluateTableRow } from '@promptfoo/types/api/eval';
import type { Row } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { getImageSourceForCell } from './ResultsTable';

function createMockRow(overrides: Partial<EvaluateTableRow> = {}): Row<EvaluateTableRow> {
  return {
    original: {
      test: { vars: {}, description: '' },
      outputs: [],
      ...overrides,
    },
  } as Row<EvaluateTableRow>;
}

describe('getImageSourceForCell', () => {
  it('returns undefined for description column with long hyphen slug', () => {
    const slug = 'golden-047-brushless-dc-motor-assemblies-for-applia-a45abef4';
    const row = createMockRow({ test: { vars: {}, description: slug } });

    const result = getImageSourceForCell({
      columnId: 'description',
      value: slug,
      row,
      headVars: [],
      injectVarName: '',
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for description column with long underscore slug', () => {
    const slug = 'golden_047_brushless_dc_motor_assemblies_for_applia_a45abef4';
    const row = createMockRow({ test: { vars: {}, description: slug } });

    const result = getImageSourceForCell({
      columnId: 'description',
      value: slug,
      row,
      headVars: [],
      injectVarName: '',
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for description column with long alphanumeric string', () => {
    const slug = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const row = createMockRow({ test: { vars: {}, description: slug } });

    const result = getImageSourceForCell({
      columnId: 'description',
      value: slug,
      row,
      headVars: [],
      injectVarName: '',
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for description column with short string', () => {
    const row = createMockRow({ test: { vars: {}, description: 'short desc' } });

    const result = getImageSourceForCell({
      columnId: 'description',
      value: 'short desc',
      row,
      headVars: [],
      injectVarName: '',
    });

    expect(result).toBeUndefined();
  });

  it('returns image source for non-description column with long base64-like string', () => {
    const slug = 'golden-047-brushless-dc-motor-assemblies-for-applia-a45abef4';
    const row = createMockRow({ test: { vars: {}, description: '' } });

    const result = getImageSourceForCell({
      columnId: 'Variable 1',
      value: slug,
      row,
      headVars: ['image'],
      injectVarName: 'image',
    });

    expect(result).toBe(`data:image/png;base64,${slug}`);
  });

  it('returns undefined for non-description column with short string', () => {
    const row = createMockRow({ test: { vars: {}, description: '' } });

    const result = getImageSourceForCell({
      columnId: 'Variable 1',
      value: 'short',
      row,
      headVars: ['image'],
      injectVarName: 'image',
    });

    expect(result).toBeUndefined();
  });
});
