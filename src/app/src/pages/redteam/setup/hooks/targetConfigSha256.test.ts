import { describe, expect, it } from 'vitest';
import { targetConfigSha256 } from './targetConfigSha256';

describe('targetConfigSha256', () => {
  it.each([
    ['empty input', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['Unicode', 'hello 🌍', '92de6bbfa52e6cfa0f85916fd8176cb1644b95a4c0148cdda94745ba6c35e5eb'],
    [
      'multi-block input',
      'a'.repeat(56),
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    ],
    [
      'one-megabyte input',
      'a'.repeat(1_000_000),
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    ],
  ])('matches the SHA-256 known vector for %s', (_case, input, expected) => {
    expect(targetConfigSha256(input)).toBe(expected);
  });
});
