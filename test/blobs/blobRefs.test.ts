import { describe, expect, it } from 'vitest';
import {
  collectBlobHashes,
  extractBlobHashesFromString,
  extractBlobHashesFromValue,
  normalizeBlobHash,
} from '../../src/blobs/blobRefs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const uri = (hash: string) => `promptfoo://blob/${hash}`;

describe('normalizeBlobHash', () => {
  it('lowercases the hash', () => {
    expect(normalizeBlobHash('ABCDEF')).toBe('abcdef');
  });
});

describe('extractBlobHashesFromString', () => {
  it('returns an empty array for strings without a blob URI', () => {
    expect(extractBlobHashesFromString('just some text')).toEqual([]);
  });

  it('extracts and normalizes every blob hash in the string', () => {
    const value = `before ${uri(HASH_A.toUpperCase())} middle ${uri(HASH_B)} after`;
    expect(extractBlobHashesFromString(value)).toEqual([HASH_A, HASH_B]);
  });

  it('skips long strings that do not start with the blob scheme when maxStringLength is set', () => {
    const value = `${'x'.repeat(200)} ${uri(HASH_A)}`;
    expect(extractBlobHashesFromString(value, 100)).toEqual([]);
  });

  it('still scans long strings that start with the blob scheme', () => {
    const value = `${uri(HASH_A)}${'y'.repeat(200)}`;
    expect(extractBlobHashesFromString(value, 100)).toEqual([HASH_A]);
  });
});

describe('extractBlobHashesFromValue', () => {
  it('extracts from a string', () => {
    expect(extractBlobHashesFromValue(uri(HASH_A))).toEqual([HASH_A]);
  });

  it('extracts from an object with a valid hash field', () => {
    expect(extractBlobHashesFromValue({ hash: HASH_A.toUpperCase() })).toEqual([HASH_A]);
  });

  it('extracts from an object with a uri field', () => {
    expect(extractBlobHashesFromValue({ uri: uri(HASH_B) })).toEqual([HASH_B]);
  });

  it('returns an empty array for non-blob primitives and objects', () => {
    expect(extractBlobHashesFromValue(42)).toEqual([]);
    expect(extractBlobHashesFromValue(null)).toEqual([]);
    expect(extractBlobHashesFromValue({ hash: 'not-a-hash' })).toEqual([]);
  });
});

describe('collectBlobHashes', () => {
  it('collects and deduplicates hashes across a nested structure', () => {
    const value = {
      results: [{ response: { output: uri(HASH_A) } }, { response: { output: uri(HASH_A) } }],
      traces: [{ metadata: { attachment: uri(HASH_B) } }],
    };
    expect([...collectBlobHashes(value)].sort()).toEqual([HASH_A, HASH_B]);
  });

  it('terminates on cyclic objects without infinite recursion', () => {
    const node: Record<string, unknown> = { output: uri(HASH_A) };
    node.self = node;
    expect([...collectBlobHashes(node)]).toEqual([HASH_A]);
  });

  it('stops recursing past maxDepth', () => {
    // Root object is depth 0, the `b` object depth 1, its blob URI string depth 2.
    const value = { a: { b: uri(HASH_A) } };
    expect([...collectBlobHashes(value, { maxDepth: 1 })]).toEqual([]);
    expect([...collectBlobHashes(value, { maxDepth: 2 })]).toEqual([HASH_A]);
  });

  it('honors maxStringLength while still scanning blob-scheme-prefixed strings', () => {
    const buried = { output: `${'x'.repeat(200)} ${uri(HASH_A)}` };
    const prefixed = { output: `${uri(HASH_B)}${'y'.repeat(200)}` };
    expect([...collectBlobHashes(buried, { maxStringLength: 100 })]).toEqual([]);
    expect([...collectBlobHashes(prefixed, { maxStringLength: 100 })]).toEqual([HASH_B]);
  });
});
