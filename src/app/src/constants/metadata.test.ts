import { describe, it, expect } from 'vitest';
import {
  isFilteredMetadataKey,
  hasDisplayableMetadata,
  CITATIONS_METADATA_KEY,
  PROMPTFOO_FILE_METADATA_KEY,
  FILTERED_METADATA_KEYS,
} from './metadata';

describe('isFilteredMetadataKey', () => {
  it('should return true when the key is CITATIONS_METADATA_KEY', () => {
    const result = isFilteredMetadataKey(CITATIONS_METADATA_KEY);

    expect(result).toBe(true);
  });

  it('should return true when the key is PROMPTFOO_FILE_METADATA_KEY', () => {
    const result = isFilteredMetadataKey(PROMPTFOO_FILE_METADATA_KEY);

    expect(result).toBe(true);
  });

  it("should return false when the key is a regular displayable metadata key (e.g., 'author')", () => {
    const result = isFilteredMetadataKey('author');

    expect(result).toBe(false);
  });

  it('should return true for all keys in FILTERED_METADATA_KEYS array', () => {
    FILTERED_METADATA_KEYS.forEach((key) => {
      expect(isFilteredMetadataKey(key)).toBe(true);
    });
  });
});

describe('hasDisplayableMetadata', () => {
  it('should return true when metadata contains at least one key that is not filtered', () => {
    const metadata = {
      someUserKey: 'some value',
      anotherKey: 123,
      [CITATIONS_METADATA_KEY]: 'some citation data',
      [PROMPTFOO_FILE_METADATA_KEY]: { internal: 'data' },
    };

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(true);
  });

  it('should return false when metadata only contains keys filtered by isFilteredMetadataKey', () => {
    const metadata = {
      [CITATIONS_METADATA_KEY]: 'some citation data',
      [PROMPTFOO_FILE_METADATA_KEY]: { internal: 'data' },
    };

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(false);
  });

  it('should return false when metadata is undefined', () => {
    const metadata = undefined;

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(false);
  });

  it('should return false when metadata is null', () => {
    const metadata = null as unknown as Record<string, any> | undefined;

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(false);
  });

  it('should return false when metadata is an empty object', () => {
    const metadata = {};

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(false);
  });

  it('should return true when metadata contains only keys with empty values', () => {
    const metadata = {
      emptyString: '',
      emptyArray: [],
      emptyObject: {},
    };

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(true);
  });

  it('should return true when metadata contains nested objects and at least one top-level key that is not filtered', () => {
    const metadata = {
      someUserKey: {
        nestedKey: 'nested value',
      },
      [CITATIONS_METADATA_KEY]: 'some citation data',
      anotherUserKey: 123,
    };

    const result = hasDisplayableMetadata(metadata);

    expect(result).toBe(true);
  });
});
