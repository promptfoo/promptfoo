import { describe, expect, it } from 'vitest';
import { validateNodeApiDocs } from '../../scripts/checkNodeApiDocs';

describe('validateNodeApiDocs', () => {
  it('accepts the checked-in Node.js API docs contract', () => {
    expect(() => validateNodeApiDocs()).not.toThrow();
  });
});
