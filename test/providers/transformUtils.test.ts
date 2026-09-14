import { describe, expect, it } from 'vitest';
import { parseFileTransformReference } from '../../src/providers/transformUtils';

describe('parseFileTransformReference', () => {
  it.each(['dir.js:variant/parser.js', 'dir.ts:variant/parser.cjs'])(
    'preserves colons in executable-looking directories: %s',
    (filename) => {
      expect(parseFileTransformReference('file://' + filename)).toEqual({ filename });
      expect(parseFileTransformReference('file://' + filename + ':parse')).toEqual({
        filename,
        functionName: 'parse',
      });
    },
  );

  it('should split named exports from POSIX paths', () => {
    expect(parseFileTransformReference('file://path/to/parser.js:parse')).toEqual({
      filename: 'path/to/parser.js',
      functionName: 'parse',
    });
  });

  it('should keep Windows paths intact when no named export is present', () => {
    expect(parseFileTransformReference('file://C:\\path\\parser.js')).toEqual({
      filename: 'C:\\path\\parser.js',
    });
  });

  it('should split named exports from Windows paths on the last colon only', () => {
    expect(parseFileTransformReference('file://C:\\path\\parser.js:parse')).toEqual({
      filename: 'C:\\path\\parser.js',
      functionName: 'parse',
    });
  });
});
