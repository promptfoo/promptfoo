import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../../src/util/sqlLike';

describe('escapeLikePattern', () => {
  it('escapes the escape character before the wildcards', () => {
    expect(escapeLikePattern('50%_off\\now')).toBe('50\\%\\_off\\\\now');
  });

  it('leaves text without wildcards unchanged', () => {
    expect(escapeLikePattern('plain text')).toBe('plain text');
  });
});
