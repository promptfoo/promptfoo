import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  verifyTraceRedaction,
  withTraceRedactionReceiptScope,
} from '../../../src/redteam/plugins/codingAgent/verifiers';

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

  it.each(['replaced', 'deleted'])(
    'checks the original receipt after its file is %s',
    async (mode) => {
      await withTraceRedactionReceiptScope([test], async () => {
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
    await withTraceRedactionReceiptScope([test], async () => {
      fs.writeFileSync(receipt, replacement);
      await withTraceRedactionReceiptScope([test], async () => {
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
    await withTraceRedactionReceiptScope([test], async () => {
      const late = path.join(directory, 'late-receipt');
      fs.writeFileSync(late, replacement);
      expect(verifyTraceRedaction({ rawReceiptPath: late }, 'Clean')?.kind).toBe(
        'verifier-sidecar-failed',
      );
    });
  });
});
