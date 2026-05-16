import { describe, expect, it } from 'vitest';
import { findMissingRootTypeScriptFiles } from '../../scripts/checkTypeScriptCoverage';

describe('root TypeScript coverage', () => {
  it('keeps tracked root-owned TypeScript files inside a typechecked project', () => {
    expect(findMissingRootTypeScriptFiles()).toEqual([]);
  });
});
