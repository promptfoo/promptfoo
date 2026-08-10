import { describe, expect, it } from 'vitest';
import {
  findMissingRootTypeScriptFiles,
  getRootProjectFiles,
} from '../../scripts/checkTypeScriptCoverage';

describe('root TypeScript coverage', () => {
  it('keeps tracked root-owned TypeScript files inside a typechecked project', () => {
    expect(findMissingRootTypeScriptFiles()).toEqual([]);
  });

  it('reads the root project file list from the native TypeScript compiler', () => {
    expect(getRootProjectFiles()).toContain('scripts/checkTypeScriptCoverage.ts');
  });
});
