import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasProtectedReceiptFiles,
  verifyTraceRedaction,
  withProtectedReceiptScope,
} from '../../../src/redteam/plugins/codingAgent/verifiers';
import { requiresTraceRedaction } from '../../../src/util/traceRedaction';

import type { AtomicTestCase } from '../../../src/types';

describe('protected redaction receipts', () => {
  let directory: string;
  let receipt: string;
  let test: AtomicTestCase;
  const original = 'ORIGINAL_PROTECTED_RECEIPT';
  const replacement = 'TARGET_SUPPLIED_DECOY_RECEIPT';

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redaction-scope-'));
    receipt = path.join(directory, 'receipt');
    fs.writeFileSync(receipt, original);
    test = {
      assert: [
        {
          type: 'promptfoo:redteam:coding-agent:trace-redaction',
          value: { rawReceiptPath: receipt },
        },
      ],
    };
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('finds privacy assertions after a cyclic assertion set', () => {
    const group: Record<string, unknown> = { type: 'assert-set' };
    group.assert = [group];
    const assertions = [group, ...test.assert!] as AtomicTestCase['assert'];
    expect(requiresTraceRedaction(assertions)).toBe(true);
    expect(requiresTraceRedaction([group] as AtomicTestCase['assert'])).toBe(false);
  });

  it.each(['replaced', 'deleted'])(
    'checks the original receipt after its file is %s',
    async (mode) => {
      await withProtectedReceiptScope([test], async () => {
        if (mode === 'replaced') {
          fs.writeFileSync(receipt, replacement);
        } else {
          fs.unlinkSync(receipt);
        }
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)?.kind).toBe(
          'redacted-artifact-sensitive-value',
        );
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, replacement)).toBeUndefined();
      });
    },
  );

  it('keeps a fresh nested evaluation separate from its parent', async () => {
    await withProtectedReceiptScope([test], async () => {
      fs.writeFileSync(receipt, replacement);
      await withProtectedReceiptScope([test], async () => {
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, replacement)?.kind).toBe(
          'redacted-artifact-sensitive-value',
        );
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)).toBeUndefined();
      });
      expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)?.kind).toBe(
        'redacted-artifact-sensitive-value',
      );
      expect(verifyTraceRedaction({ rawReceiptPath: receipt }, replacement)).toBeUndefined();
    });
  });

  it('rejects receipt paths introduced after the snapshot', async () => {
    await withProtectedReceiptScope([test], async () => {
      const late = path.join(directory, 'late-receipt');
      fs.writeFileSync(late, replacement);
      expect(verifyTraceRedaction({ rawReceiptPath: late }, 'Clean')?.kind).toBe(
        'verifier-sidecar-failed',
      );
    });
  });

  it('captures newly configured files without rereading inherited receipts', async () => {
    await withProtectedReceiptScope([test], async () => {
      const added = path.join(directory, 'hook-receipt');
      fs.writeFileSync(added, 'HOOK_CREATED_RECEIPT');
      fs.writeFileSync(receipt, replacement);
      const prepared: AtomicTestCase = {
        assert: [
          {
            type: 'promptfoo:redteam:coding-agent:trace-redaction',
            value: { rawReceiptPaths: [receipt, added] },
          },
        ],
      };
      await withProtectedReceiptScope(
        [prepared],
        async () => {
          fs.writeFileSync(added, replacement);
          expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)?.kind).toBe(
            'redacted-artifact-sensitive-value',
          );
          expect(verifyTraceRedaction({ rawReceiptPath: receipt }, replacement)).toBeUndefined();
          expect(
            verifyTraceRedaction({ rawReceiptPath: added }, 'HOOK_CREATED_RECEIPT')?.kind,
          ).toBe('redacted-artifact-sensitive-value');
        },
        { inherit: true },
      );
      expect(verifyTraceRedaction({ rawReceiptPath: added }, 'Clean')?.kind).toBe(
        'verifier-sidecar-failed',
      );
    });
  });

  it('visits shared and cyclic assertion sets once', async () => {
    const group: Record<string, unknown> = { type: 'assert-set' };
    group.assert = [...test.assert!, group];
    test = { assert: [group, group] } as unknown as AtomicTestCase;
    expect(hasProtectedReceiptFiles(test)).toBe(true);
    await withProtectedReceiptScope([test], async () => {
      fs.writeFileSync(receipt, replacement);
      expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)?.kind).toBe(
        'redacted-artifact-sensitive-value',
      );
    });
  });

  it.each(['json', 'yaml', 'yml'])(
    'snapshots receipts in a static %s assertion file',
    async (extension) => {
      const config = path.join(directory, `assertion.${extension}`);
      fs.writeFileSync(config, JSON.stringify({ rawReceiptPath: receipt }));
      test.assert = [
        { type: 'promptfoo:redteam:coding-agent:trace-redaction', value: `file://${config}` },
      ];
      await withProtectedReceiptScope([test], async () => {
        fs.writeFileSync(receipt, replacement);
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, 'Clean report')).toBeUndefined();
        expect(verifyTraceRedaction({ rawReceiptPath: receipt }, original)?.kind).toBe(
          'redacted-artifact-sensitive-value',
        );
      });
    },
  );
});
