import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasProtectedReceiptFiles,
  snapshotReceiptSetup,
  verifyCodingAgentResult,
  verifyTraceRedaction,
  withProtectedReceiptScope,
} from '../../../src/redteam/plugins/codingAgent/localVerifiers';
import {
  getProtectedAssertionValue,
  requiresTraceRedaction,
} from '../../../src/util/traceRedaction';

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

  it('pins a captured plan across cloned declarations and ignores target replacements', async () => {
    const config = path.join(directory, 'plan.json');
    fs.writeFileSync(config, JSON.stringify({ rawReceipt: original }));
    const assertion = {
      type: 'promptfoo:redteam:coding-agent:trace-redaction' as const,
      value: 'file://' + config,
    };
    await withProtectedReceiptScope([{ assert: [assertion] }], async () => {
      fs.writeFileSync(config, JSON.stringify({ rawReceipt: replacement }));
      const cloned = { ...assertion };
      const row = { assert: [cloned] };
      const setup = snapshotReceiptSetup(row);
      await withProtectedReceiptScope(
        [row],
        async () => {
          expect(getProtectedAssertionValue(cloned)).toEqual({ rawReceipt: original });
        },
        { inherit: true, setup },
      );
    });
  });

  it('accepts a missing plan only after an observed setup change', async () => {
    const config = path.join(directory, 'plan.json');
    const assertion = {
      type: 'promptfoo:redteam:coding-agent:trace-redaction' as const,
      value: 'file://' + config,
    };
    const row = { assert: [assertion] };
    await withProtectedReceiptScope([row], async () => {
      fs.writeFileSync(config, JSON.stringify({ rawReceipt: replacement }));
      const setup = snapshotReceiptSetup(row);
      await withProtectedReceiptScope(
        [row],
        async () => {
          expect(() => getProtectedAssertionValue(assertion)).toThrow(/static JSON/);
        },
        { inherit: true, setup },
      );
      fs.writeFileSync(config, JSON.stringify({ rawReceipt: original }));
      await withProtectedReceiptScope(
        [row],
        async () => {
          expect(getProtectedAssertionValue(assertion)).toEqual({ rawReceipt: original });
        },
        { inherit: true, setup },
      );
    });
  });

  it('fails closed when setup writes an unreadable replacement receipt', async () => {
    await withProtectedReceiptScope([test], async () => {
      const setup = snapshotReceiptSetup(test);
      fs.writeFileSync(receipt, '');
      await expect(
        withProtectedReceiptScope([test], async () => null, {
          inherit: true,
          setup,
        }),
      ).rejects.toThrow(/verifier artifact/);
    });
  });

  it('adds hook-written receipts to only their own case', async () => {
    const fresh = 'FRESH_CASE_ONLY_RECEIPT';
    const matches = (text: string) =>
      verifyTraceRedaction({ rawReceiptPath: receipt }, text)?.kind ===
      'redacted-artifact-sensitive-value';
    await withProtectedReceiptScope([test], async () => {
      fs.writeFileSync(receipt, replacement);
      const setup = snapshotReceiptSetup(test);
      fs.writeFileSync(receipt, fresh);
      await withProtectedReceiptScope(
        [test],
        async () => {
          expect(matches(original)).toBe(true);
          expect(matches(fresh)).toBe(true);
          expect(matches(replacement)).toBe(false);
        },
        { inherit: true, setup },
      );
      expect(matches(fresh)).toBe(false);
    });
  });

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

  it.each(['replaced', 'deleted'])(
    'uses the Markdown receipt snapshot after its file is %s',
    async (mode) => {
      const value = { markdownUrlReceiptPath: receipt };
      test.assert = [
        {
          type: 'assert-set',
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:markdown-url-exfil',
              value,
            },
          ],
        },
      ];
      expect(hasProtectedReceiptFiles(test)).toBe(true);
      await withProtectedReceiptScope([test], async () => {
        if (mode === 'replaced') {
          fs.writeFileSync(receipt, replacement);
        } else {
          fs.unlinkSync(receipt);
        }
        expect(
          verifyCodingAgentResult(
            'coding-agent:markdown-url-exfil',
            `[report](https://example.invalid/${original})`,
            test,
            value,
          )?.kind,
        ).toBe('markdown-url-sensitive-value');
        expect(
          verifyCodingAgentResult(
            'coding-agent:markdown-url-exfil',
            `[report](https://example.invalid/${replacement})`,
            test,
            value,
          ),
        ).toBeUndefined();
        const late = path.join(directory, 'late-markdown-receipt');
        fs.writeFileSync(late, replacement);
        expect(
          verifyCodingAgentResult('coding-agent:markdown-url-exfil', 'Clean', test, {
            markdownUrlReceiptPath: late,
          })?.kind,
        ).toBe('verifier-sidecar-failed');
      });
    },
  );

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

  it.each([
    'coding-agent:sandbox-read-escape',
    'coding-agent:verifier-sabotage',
    'harness:grader-injection-resistance',
  ] as const)('protects a static verifier config for %s', async (plugin) => {
    const config = path.join(directory, 'assertion.json');
    fs.writeFileSync(config, JSON.stringify({ canary: original }));
    const assertion = { type: `promptfoo:redteam:${plugin}` as const, value: `file://${config}` };
    const configured = { assert: [assertion] } as AtomicTestCase;
    expect(hasProtectedReceiptFiles(configured)).toBe(true);
    await withProtectedReceiptScope([configured], async () => {
      fs.writeFileSync(config, JSON.stringify({ canary: replacement }));
      expect(getProtectedAssertionValue(assertion)).toEqual({ canary: original });
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
