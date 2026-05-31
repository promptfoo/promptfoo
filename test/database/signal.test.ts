import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWriteFileSync, mockReadFileSync, mockGetDbSignalPath, mockLoggerWarn } = vi.hoisted(
  () => ({
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockGetDbSignalPath: vi.fn().mockReturnValue('/mock/path/signal.txt'),
    mockLoggerWarn: vi.fn(),
  }),
);

vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    existsSync: vi.fn(),
    watch: vi.fn(),
  },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: mockLoggerWarn,
  },
}));

vi.mock('../../src/database/index', () => ({
  getDbSignalPath: mockGetDbSignalPath,
}));

import {
  readSignalEvalId,
  readSignalFile,
  updateSignalFile,
  updateSignalFileForDeletedEvals,
} from '../../src/database/signal';

describe('signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFileSync.mockReset();
    mockReadFileSync.mockReset();
    // Re-set the mock return value after reset
    mockGetDbSignalPath.mockReturnValue('/mock/path/signal.txt');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('updateSignalFile', () => {
    it('should write timestamp only when no evalId is provided', () => {
      updateSignalFile();

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [, content] = mockWriteFileSync.mock.calls[0];
      expect(mockWriteFileSync).toHaveBeenCalledWith('/mock/path/signal.txt', expect.any(String));
      expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should write evalId and timestamp when evalId is provided', () => {
      updateSignalFile('eval-123-abc');

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [, content] = mockWriteFileSync.mock.calls[0];
      expect(mockWriteFileSync).toHaveBeenCalledWith('/mock/path/signal.txt', expect.any(String));
      expect(content).toMatch(/^eval-123-abc:\d{4}-\d{2}-\d{2}T/);
    });

    it('should log warning when write fails', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      updateSignalFile('eval-123');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write database signal file'),
      );
    });

    it('should write deleted eval IDs as a structured signal', () => {
      updateSignalFileForDeletedEvals(['eval-deleted-1', 'eval-deleted-2']);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [, content] = mockWriteFileSync.mock.calls[0];
      expect(JSON.parse(content)).toMatchObject({
        type: 'delete',
        deletedEvalIds: ['eval-deleted-1', 'eval-deleted-2'],
      });
    });

    it('should coalesce deleted eval IDs across rapid signal writes', () => {
      let content = '';
      mockReadFileSync.mockImplementation(() => content);
      mockWriteFileSync.mockImplementation((_path, nextContent) => {
        content = nextContent;
      });

      updateSignalFileForDeletedEvals(['eval-deleted-1']);
      updateSignalFileForDeletedEvals(['eval-deleted-2']);

      expect(JSON.parse(content)).toMatchObject({
        type: 'delete',
        deletedEvalIds: ['eval-deleted-1', 'eval-deleted-2'],
      });
    });

    it('should not retain deleted eval IDs beyond the watcher debounce window', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['stale-eval'],
          timestamp: '2000-01-01T00:00:00.000Z',
        }),
      );

      updateSignalFileForDeletedEvals(['fresh-eval']);

      const [, content] = mockWriteFileSync.mock.calls[0];
      expect(JSON.parse(content)).toMatchObject({
        type: 'delete',
        deletedEvalIds: ['fresh-eval'],
      });
    });
  });

  describe('readSignalFile', () => {
    it('should return deleted eval IDs from a structured signal', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-deleted-1', 'eval-deleted-2'],
          timestamp: '2026-05-30T22:00:00.000Z',
        }),
      );

      expect(readSignalFile()).toEqual({
        type: 'delete',
        deletedEvalIds: ['eval-deleted-1', 'eval-deleted-2'],
      });
    });

    it('should report a delete with no ids (delete-all) as undefined deletedEvalIds', () => {
      // updateSignalFileForDeletedEvals() with no args (deleteAllEvals) drops the
      // undefined key, so JSON.parse yields an object with no deletedEvalIds field.
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ type: 'delete', timestamp: '2026-05-30T22:00:00.000Z' }),
      );

      expect(readSignalFile()).toEqual({ type: 'delete', deletedEvalIds: undefined });
    });

    it('should drop non-string entries from deletedEvalIds', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ type: 'delete', deletedEvalIds: ['eval-ok', 42, null, 'eval-ok-2'] }),
      );

      expect(readSignalFile()).toEqual({
        type: 'delete',
        deletedEvalIds: ['eval-ok', 'eval-ok-2'],
      });
    });

    it('should fall back to a legacy update for a scoped evalId:timestamp signal', () => {
      mockReadFileSync.mockReturnValue('eval-abc-2026-05-29T22:43:41:2026-05-29T22:43:42.000Z');

      expect(readSignalFile()).toEqual({
        type: 'update',
        evalId: 'eval-abc-2026-05-29T22:43:41',
      });
    });

    it('should fall back to an unscoped update for malformed JSON content', () => {
      // A partially-written delete file (writes are not atomic) must not throw; it should
      // degrade to an unscoped update rather than crash the watcher.
      mockReadFileSync.mockReturnValue('{"type":"delete","deletedEvalIds":[');

      expect(readSignalFile()).toEqual({ type: 'update', evalId: undefined });
    });

    it('parses a JSON update object (combined-signal format) into its components', () => {
      // Combined signals (an update that folded in a pending delete) are written as JSON with
      // type 'update', so readSignalFile parses both the evalId and any carried deletedEvalIds.
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'update',
          evalId: 'eval-12345678',
          deletedEvalIds: ['eval-removed-1'],
        }),
      );

      expect(readSignalFile()).toEqual({
        type: 'update',
        evalId: 'eval-12345678',
        deletedEvalIds: ['eval-removed-1'],
      });
    });

    it('should fall back to an unscoped update for JSON arrays/primitives', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(['eval-1', 'eval-2']));
      expect(readSignalFile()).toEqual({ type: 'update', evalId: undefined });

      mockReadFileSync.mockReturnValue('42');
      expect(readSignalFile()).toEqual({ type: 'update', evalId: undefined });

      mockReadFileSync.mockReturnValue('null');
      expect(readSignalFile()).toEqual({ type: 'update', evalId: undefined });
    });

    it('should return an unscoped update when the file read fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(readSignalFile()).toEqual({ type: 'update' });
    });
  });

  describe('signal coalescing within the debounce window', () => {
    function lastWrittenSignal(): string {
      const calls = mockWriteFileSync.mock.calls;
      return calls[calls.length - 1]?.[1] as string;
    }

    it('folds a pending delete into a following update so neither refresh is lost', () => {
      // A delete written <250ms ago is still pending when an unrelated eval save fires.
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-deleted-1'],
          timestamp: new Date().toISOString(),
        }),
      );

      updateSignalFile('eval-newly-saved');

      expect(JSON.parse(lastWrittenSignal())).toMatchObject({
        type: 'update',
        evalId: 'eval-newly-saved',
        deletedEvalIds: ['eval-deleted-1'],
      });
    });

    it('carries a pending scoped update into a following delete', () => {
      // A legacy `evalId:timestamp` update written <250ms ago is pending when a delete fires.
      mockReadFileSync.mockReturnValue(`eval-pending-update:${new Date().toISOString()}`);

      updateSignalFileForDeletedEvals(['eval-deleted-2']);

      expect(JSON.parse(lastWrittenSignal())).toMatchObject({
        type: 'delete',
        deletedEvalIds: ['eval-deleted-2'],
        evalId: 'eval-pending-update',
      });
    });

    it('ignores a stale pending signal outside the debounce window', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-old'],
          timestamp: new Date(Date.now() - 60_000).toISOString(),
        }),
      );

      updateSignalFile('eval-fresh');

      // The stale delete is not folded in; the update stays in the plain legacy text format.
      expect(lastWrittenSignal()).toMatch(/^eval-fresh:\d{4}-\d{2}-\d{2}T/);
    });

    it('folds a pending delete-all into a following update as an empty id list', () => {
      // A pending delete-all has no deletedEvalIds; folding it must produce an empty array,
      // which clients read as "all evals deleted" (then reload to the freshly written latest).
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ type: 'delete', timestamp: new Date().toISOString() }),
      );

      updateSignalFile('eval-after-delete-all');

      expect(JSON.parse(lastWrittenSignal())).toMatchObject({
        type: 'update',
        evalId: 'eval-after-delete-all',
        deletedEvalIds: [],
      });
    });

    it('folds a pending delete written just inside the window', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-recent'],
          timestamp: new Date(Date.now() - 200).toISOString(),
        }),
      );

      updateSignalFile('eval-x');

      expect(JSON.parse(lastWrittenSignal())).toMatchObject({
        type: 'update',
        evalId: 'eval-x',
        deletedEvalIds: ['eval-recent'],
      });
    });

    it('ignores a future-dated pending signal (clock-skew guard)', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-future'],
          timestamp: new Date(Date.now() + 60_000).toISOString(),
        }),
      );

      updateSignalFile('eval-fresh');

      // A future timestamp (negative elapsed) is rejected; the update stays as legacy text.
      expect(lastWrittenSignal()).toMatch(/^eval-fresh:\d{4}-\d{2}-\d{2}T/);
    });

    it('accumulates back-to-back scoped updates so neither eval is dropped', () => {
      // Regression for the single-update-slot overwrite: a scoped update Y written <250ms ago is
      // still pending when an update for a DIFFERENT eval Z fires; both ids must survive.
      mockReadFileSync.mockReturnValue(`eval-update-Y:${new Date().toISOString()}`);

      updateSignalFile('eval-update-Z');

      const written = JSON.parse(lastWrittenSignal());
      expect(written.type).toBe('update');
      expect(written.updatedEvalIds).toEqual(['eval-update-Y', 'eval-update-Z']);
    });

    it('keeps repeated updates to the same eval on the compact legacy text format', () => {
      // The common per-result run case: same eval signaled twice in the window. Nothing new to
      // preserve, so it stays legacy text rather than ballooning into JSON.
      mockReadFileSync.mockReturnValue(`eval-same-id:${new Date().toISOString()}`);

      updateSignalFile('eval-same-id');

      expect(lastWrittenSignal()).toMatch(/^eval-same-id:\d{4}-\d{2}-\d{2}T/);
    });

    it('carries every pending scoped update into a following delete', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'update',
          evalId: 'eval-update-2',
          updatedEvalIds: ['eval-update-1', 'eval-update-2'],
          timestamp: new Date().toISOString(),
        }),
      );

      updateSignalFileForDeletedEvals(['eval-removed']);

      expect(JSON.parse(lastWrittenSignal())).toMatchObject({
        type: 'delete',
        deletedEvalIds: ['eval-removed'],
        updatedEvalIds: ['eval-update-1', 'eval-update-2'],
      });
    });
  });

  describe('mixed-version signal compatibility', () => {
    // Snapshot of the pre-PR reader (main's readSignalEvalId) so we can pin how an OLD
    // view server degrades when it reads signals written by a NEW CLI. This guards the
    // documented mixed-version contract without depending on git history.
    function legacyReadSignalEvalId(content: string): string | undefined {
      const trimmed = content.trim();
      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        return undefined;
      }
      if (trimmed.includes(':')) {
        const evalId = trimmed.split(':')[0];
        if (evalId && evalId.length > 8) {
          return evalId;
        }
      }
      return undefined;
    }

    it('old reader degrades a new JSON delete payload to an unscoped update (Eval.latest fallback)', () => {
      const payload = JSON.stringify({
        type: 'delete',
        deletedEvalIds: ['eval-abc-2026-05-29T22:43:41'],
        timestamp: '2026-05-30T22:00:00.000Z',
      });

      // split(':')[0] === '{"type"' (7 chars), which fails the length > 8 guard, so the
      // old server sees no scoped id and falls back to broadcasting the latest eval.
      expect(legacyReadSignalEvalId(payload)).toBeUndefined();
    });

    it('new reader correctly parses legacy scoped signals an old CLI would write', () => {
      mockReadFileSync.mockReturnValue('eval-abc-2026-05-29T22:43:41:2026-05-29T22:43:42.000Z');

      // Regression guard: main's reader truncated colon-containing ids at the first colon
      // (eval-abc-2026-05-29T22). The new reader recovers the full id.
      expect(readSignalEvalId()).toBe('eval-abc-2026-05-29T22:43:41');
    });
  });

  describe('readSignalEvalId', () => {
    it('should return evalId when signal file contains evalId:timestamp format', () => {
      mockReadFileSync.mockReturnValue('eval-12345-abcdef:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBe('eval-12345-abcdef');
    });

    it('should preserve colons in eval IDs through a write-read round trip', () => {
      const evalId = 'eval-abc-2026-05-29T22:43:41';
      mockWriteFileSync.mockImplementation((_path, content) => {
        mockReadFileSync.mockReturnValue(content);
      });

      updateSignalFile(evalId);

      expect(readSignalEvalId()).toBe(evalId);
    });

    it('should return undefined when signal file contains only timestamp', () => {
      mockReadFileSync.mockReturnValue('2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should not treat structured deletion signals as scoped eval updates', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          type: 'delete',
          deletedEvalIds: ['eval-deleted-1'],
          timestamp: '2026-05-30T22:00:00.000Z',
        }),
      );

      expect(readSignalEvalId()).toBeUndefined();
    });

    it('should return undefined when evalId is too short (8 chars or less)', () => {
      mockReadFileSync.mockReturnValue('short:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should return evalId when it is longer than 8 characters', () => {
      mockReadFileSync.mockReturnValue('123456789:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBe('123456789');
    });

    it('should return undefined when file read fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should handle empty string content', () => {
      mockReadFileSync.mockReturnValue('');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should trim whitespace from content', () => {
      mockReadFileSync.mockReturnValue('  eval-12345-abcdef:2024-01-01T00:00:00.000Z  \n');

      const result = readSignalEvalId();

      expect(result).toBe('eval-12345-abcdef');
    });

    it('should handle UUID-style eval IDs', () => {
      mockReadFileSync.mockReturnValue(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890:2024-01-01T00:00:00.000Z',
      );

      const result = readSignalEvalId();

      expect(result).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });
});
