import { describe, expect, it } from 'vitest';
import * as legacyExtensions from '../../src/util/fileExtensions';
import * as legacyRange from '../../src/util/filterRange';
import * as extensions from '../../src/validation/fileExtensions';
import { filterByRange, parseFilterRange } from '../../src/validation/filterRange';

describe('portable validation compatibility', () => {
  it('shares the original extension array and functions through the legacy path', () => {
    for (const key of Object.keys(extensions) as (keyof typeof extensions)[]) {
      expect(legacyExtensions[key]).toBe(extensions[key]);
    }
    expect(extensions.JAVASCRIPT_EXTENSIONS).toEqual(['js', 'cjs', 'mjs', 'ts', 'cts', 'mts']);
    expect(extensions.isJavascriptFile('provider.MTS')).toBe(true);
    expect(extensions.isJavascriptFile('provider.tsx')).toBe(false);
    expect(extensions.isJavascriptFile('ts')).toBe(false);
    expect(extensions.isImageFile('jpg')).toBe(true);
    expect(extensions.isImageFile('photo.jpg?query=1')).toBe(false);
    expect(extensions.isAudioFile('VOICE.OPUS')).toBe(true);
    expect(extensions.isVideoFile('clip.MP4')).toBe(true);
  });

  it('preserves range identity, omitted bounds and exclusive end', () => {
    expect(legacyRange.parseFilterRange).toBe(parseFilterRange);
    expect(legacyRange.filterByRange).toBe(filterByRange);
    const items = ['zero', 'one', 'two', 'three'];
    expect(filterByRange(items, undefined)).toBe(items);
    expect(filterByRange(items, ' 1 : 3 ')).toEqual(['one', 'two']);
    expect(filterByRange(items, ':2')).toEqual(['zero', 'one']);
    expect(filterByRange(items, '2:')).toEqual(['two', 'three']);
  });

  it.each(['', 'file.'])('rejects empty media extensions in %j', (filePath) => {
    expect(extensions.isImageFile(filePath)).toBe(false);
    expect(extensions.isVideoFile(filePath)).toBe(false);
    expect(extensions.isAudioFile(filePath)).toBe(false);
  });

  it.each([':', '1:2:3', '-1:2', '1.5:2', 'a:2'])(
    'preserves invalid range errors for %s',
    (range) => {
      expect(() => parseFilterRange(range)).toThrow(
        `--filter-range must be specified in start:end format using zero-based indices, got: ${range}`,
      );
    },
  );

  it('preserves unsafe integer and reversed bound errors', () => {
    expect(() => parseFilterRange('0:9007199254740992')).toThrow(
      '--filter-range bounds must be safe integers, got: 0:9007199254740992',
    );
    expect(() => parseFilterRange('3:2')).toThrow(
      '--filter-range start must be less than or equal to end, got: 3:2',
    );
  });

  it('calls the empty-range adapter once and preserves its thrown error', () => {
    const calls: unknown[][] = [];
    const error = new Error('adapter failed');
    const onEmpty = (range: string, count: number) => {
      calls.push([range, count]);
      throw error;
    };
    let thrown: unknown;
    try {
      filterByRange(['one'], '1:', onEmpty);
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown).toBe(error);
    expect(calls).toEqual([['1:', 1]]);
    expect(filterByRange([], '1:', onEmpty)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
