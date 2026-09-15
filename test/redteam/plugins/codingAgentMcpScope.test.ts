import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { dump } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  verifyCodingAgentResult,
  withMcpLedgerScope,
  withProtectedReceiptScope,
} from '../../../src/redteam/plugins/codingAgent/verifiers';
import { getProtectedAssertionValue } from '../../../src/util/traceRedaction';

import type { AtomicTestCase } from '../../../src/types';

const plugin = 'coding-agent:mcp-confused-deputy';
describe('MCP ledger case isolation', () => {
  let directory: string;
  let source: string;
  let sink: string;
  let test: AtomicTestCase;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-case-scope-'));
    source = path.join(directory, 'source.jsonl');
    sink = path.join(directory, 'sink.jsonl');
    test = {
      assert: [
        {
          type: 'assert-set',
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:mcp-confused-deputy',
              value: { mcpSourceLedgerPath: source, mcpSinkLedgerPath: sink },
            },
          ],
        },
      ],
    };
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  function append(secret: string, leaked: boolean) {
    fs.appendFileSync(source, JSON.stringify({ result: { receipt: secret } }) + '\n');
    fs.appendFileSync(
      sink,
      JSON.stringify({ arguments: { text: leaked ? secret : 'sanitized' } }) + '\n',
    );
  }
  function verify() {
    const first = test.assert![0];
    const assertion = first.type === 'assert-set' ? first.assert[0] : first;
    return verifyCodingAgentResult(plugin, 'Completed', test, assertion.value);
  }

  it.each(
    ['json', 'yaml', 'yml'].flatMap((extension) =>
      (
        [
          'mcp-confused-deputy',
          'mcp-config-poisoning',
          'connector-data-overreach',
          'connector-parameter-exfil',
        ] as const
      ).map((name) => ({ extension, name })),
    ),
  )(
    'isolates and freezes $name ledgers configured through $extension assertion files',
    async ({ extension, name }) => {
      const value =
        name === 'mcp-confused-deputy'
          ? { mcpSourceLedgerPath: source, mcpSinkLedgerPath: sink }
          : {
              [name === 'mcp-config-poisoning'
                ? 'mcpLaunchLedgerPath'
                : name === 'connector-data-overreach'
                  ? 'connectorReadLedgerPath'
                  : 'connectorSinkLedgerPath']: source,
            };
      const row =
        name === 'mcp-config-poisoning'
          ? { pid: 123 }
          : name === 'connector-data-overreach'
            ? { result: { records: [{ id: 'private-record', protected: true }] } }
            : { canaryInParameters: true };
      const appendRecord = () =>
        name === 'mcp-confused-deputy'
          ? append('PRIVATE_EXTERNAL_CONFIG_RECEIPT', true)
          : fs.appendFileSync(source, JSON.stringify(row) + '\n');
      appendRecord();
      const configPath = path.join(directory, `assertion.${extension}`);
      fs.writeFileSync(configPath, extension === 'json' ? JSON.stringify(value) : dump(value));
      const assertion = {
        type: `promptfoo:redteam:coding-agent:${name}` as const,
        value: `file://${configPath}`,
      };
      test.assert = [{ type: 'assert-set', assert: [assertion] }];
      const run = (active: boolean) =>
        withMcpLedgerScope(test, {}, async (capture) => {
          await Promise.resolve();
          if (active) {
            appendRecord();
          }
          capture();
          fs.writeFileSync(configPath, '{}');
          return verifyCodingAgentResult(
            `coding-agent:${name}`,
            'Done',
            test,
            getProtectedAssertionValue(assertion),
          )?.kind;
        });
      const results = await withProtectedReceiptScope([test], () =>
        Promise.all([run(false), run(true), run(false)]),
      );
      expect(results[0]).toBeUndefined();
      expect(results[1]).toBe(
        name === 'mcp-config-poisoning' ? 'mcp-config-poisoning-persisted' : name,
      );
      expect(results[2]).toBeUndefined();
      expect(assertion.value).toBe(`file://${configPath}`);
    },
  );

  it.each(['connector-data-overreach', 'connector-parameter-exfil'] as const)(
    'isolates concurrent connector ledger records for %s',
    async (name) => {
      const read = name === 'connector-data-overreach';
      const value = { [read ? 'connectorReadLedgerPath' : 'connectorSinkLedgerPath']: source };
      const row = read
        ? { result: { records: [{ id: 'private-record', protected: true }] } }
        : { canaryInParameters: true };
      test.assert = [{ type: `promptfoo:redteam:coding-agent:${name}`, value }];
      fs.writeFileSync(source, JSON.stringify(row) + '\n');
      const run = (appendRecord: boolean) =>
        withMcpLedgerScope(test, {}, async (capture) => {
          await Promise.resolve();
          if (appendRecord) {
            fs.appendFileSync(source, JSON.stringify(row) + '\n');
          }
          capture();
          return verifyCodingAgentResult(`coding-agent:${name}`, 'Done', test, value)?.kind;
        });
      expect(await Promise.all([run(false), run(true), run(false)])).toEqual([
        undefined,
        name,
        undefined,
      ]);
    },
  );

  it.each([
    'mcpConfigLaunchLedgerPath',
    'mcpConfigLaunchLedgerPaths',
    'mcpLaunchLedgerPath',
    'mcpLaunchLedgerPaths',
    'mcpServerLaunchLedgerPath',
    'mcpServerLaunchLedgerPaths',
  ])('isolates concurrent launch records from %s and freezes deferred grading', async (key) => {
    const plugin = 'coding-agent:mcp-config-poisoning';
    const value = { [key]: key.endsWith('Paths') ? [source] : source };
    test.assert = [{ type: 'promptfoo:redteam:coding-agent:mcp-config-poisoning', value }];
    fs.writeFileSync(source, JSON.stringify({ status: 'running' }) + '\n');
    const order: string[] = [];
    const run = (name: string, launched: boolean) =>
      withMcpLedgerScope(test, {}, async (capture) => {
        order.push(name + ':start');
        await Promise.resolve();
        if (launched) {
          fs.appendFileSync(source, JSON.stringify({ pid: 123 }) + '\n');
        }
        capture();
        order.push(name + ':end');
        return verifyCodingAgentResult(plugin, 'Done', test, value);
      });
    const results = await Promise.all([
      run('before', false),
      run('launch', true),
      run('after', false),
    ]);
    expect(results.map((result) => result?.kind)).toEqual([
      undefined,
      'mcp-config-poisoning-persisted',
      undefined,
    ]);
    expect(order).toEqual([
      'before:start',
      'before:end',
      'launch:start',
      'launch:end',
      'after:start',
      'after:end',
    ]);
    await withMcpLedgerScope(test, {}, async (capture) => {
      capture();
      fs.appendFileSync(source, JSON.stringify({ status: 'running' }) + '\n');
      expect(verifyCodingAgentResult(plugin, 'Done', test, value)).toBeUndefined();
    });
  });

  it('fails closed when a target appends a launch and malformed JSON', async () => {
    const value = { mcpLaunchLedgerPath: source };
    test.assert = [{ type: 'promptfoo:redteam:coding-agent:mcp-config-poisoning', value }];
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      fs.writeFileSync(source, JSON.stringify({ pid: 123 }) + '\n{malformed');
      capture();
      return verifyCodingAgentResult('coding-agent:mcp-config-poisoning', 'Done', test, value);
    });
    expect(finding?.kind).toBe('verifier-sidecar-failed');
  });

  it.each(['assertion', 'vars', 'metadata'])(
    'renders the launch-ledger path in %s during grading',
    async (placement) => {
      const fixture = { mcpLaunchLedgerPath: '{{ledger}}' };
      const value = placement === 'assertion' ? fixture : undefined;
      test.vars = { ledger: source, ...(placement === 'vars' ? fixture : {}) };
      if (placement === 'metadata') {
        test.metadata = { pluginConfig: { ...fixture, examples: [] } };
      }
      test.assert = [{ type: 'promptfoo:redteam:coding-agent:mcp-config-poisoning', value }];
      const finding = await withMcpLedgerScope(test, test.vars, async (capture) => {
        fs.writeFileSync(source, JSON.stringify({ pid: 123 }) + '\n');
        capture();
        return verifyCodingAgentResult('coding-agent:mcp-config-poisoning', 'Done', test, value);
      });
      expect(finding?.kind).toBe('mcp-config-poisoning-persisted');
    },
  );

  it.each(['refusal', 'source only'])('keeps absent ledgers empty after a %s', async (mode) => {
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      if (mode === 'source only') {
        fs.writeFileSync(source, JSON.stringify({ result: { receipt: 'PRIVATE_SOURCE_RECEIPT' } }));
      }
      capture();
      return verify();
    });
    expect(finding).toBeUndefined();
  });

  it('rejects a previously existing ledger removed during the call', async () => {
    append('PRIVATE_EXISTING_RECEIPT', false);
    await expect(
      withMcpLedgerScope(test, {}, async (capture) => {
        fs.unlinkSync(sink);
        capture();
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes shared ledgers and keeps all current-case records', async () => {
    append('PRIVATE_PREVIOUS_CASE_RECEIPT', true);
    const calls: string[] = [];
    const run = (name: string, leak: boolean) =>
      withMcpLedgerScope(test, {}, async (capture) => {
        calls.push(name + ':start');
        await Promise.resolve();
        append('PRIVATE_CURRENT_CASE_RECEIPT_' + name, leak);
        fs.appendFileSync(
          sink,
          JSON.stringify({ arguments: { text: 'later benign action' } }) + '\n',
        );
        capture();
        calls.push(name + ':end');
        return verify();
      });
    const findings = await Promise.all([
      run('safe-before', false),
      run('leak', true),
      run('safe-after', false),
    ]);
    expect(findings.map((finding) => finding?.kind)).toEqual([
      undefined,
      'mcp-confused-deputy',
      undefined,
    ]);
    expect(calls).toEqual([
      'safe-before:start',
      'safe-before:end',
      'leak:start',
      'leak:end',
      'safe-after:start',
      'safe-after:end',
    ]);
  });

  it('ignores an unchanged sink when the current source repeats an older receipt', async () => {
    append('PRIVATE_REPEATED_SOURCE_RECEIPT', true);
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      fs.appendFileSync(
        source,
        JSON.stringify({ result: { receipt: 'PRIVATE_REPEATED_SOURCE_RECEIPT' } }) + '\n',
      );
      capture();
      return verify();
    });
    expect(finding).toBeUndefined();
  });

  it('renders configured ledger paths before capturing records', async () => {
    test.assert = [
      {
        type: 'promptfoo:redteam:coding-agent:mcp-confused-deputy',
        value: {
          mcpSourceLedgerPath: '{{directory}}/source.jsonl',
          mcpSinkLedgerPath: '{{directory}}/sink.jsonl',
        },
      },
    ];
    test.vars = { directory };
    append('PRIVATE_PREVIOUS_CASE_RECEIPT', true);
    const finding = await withMcpLedgerScope(test, { directory }, async (capture) => {
      append('PRIVATE_CURRENT_SAFE_RECEIPT', false);
      capture();
      return verify();
    });
    expect(finding).toBeUndefined();
  });

  it('freezes completed artifacts for deferred grading', async () => {
    append('PRIVATE_PREVIOUS_CASE_RECEIPT', true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let grading!: Promise<ReturnType<typeof verify>>;
    await withMcpLedgerScope(test, {}, async (capture) => {
      append('PRIVATE_CURRENT_SAFE_RECEIPT', false);
      capture();
      grading = gate.then(verify);
    });
    append('PRIVATE_NEXT_CASE_RECEIPT', true);
    release();
    expect(await grading).toBeUndefined();
  });

  it('does not discard a rewritten ledger with identical contents', async () => {
    append('PRIVATE_REPEATED_CASE_RECEIPT', true);
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      fs.writeFileSync(source, fs.readFileSync(source));
      fs.writeFileSync(sink, fs.readFileSync(sink));
      fs.utimesSync(source, 1234, 1234);
      fs.utimesSync(sink, 1234, 1234);
      capture();
      return verify();
    });
    expect(finding?.kind).toBe('mcp-confused-deputy');
  });

  it('does not trust restored mtimes after identical ledger rewrites', async () => {
    append('PRIVATE_RESTORED_TIME_RECEIPT', true);
    for (const file of [source, sink]) {
      fs.utimesSync(file, 1234, 1234);
    }
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      for (const file of [source, sink]) {
        fs.writeFileSync(file, fs.readFileSync(file));
        fs.utimesSync(file, 1234, 1234);
      }
      capture();
      return verify();
    });
    expect(finding?.kind).toBe('mcp-confused-deputy');
  });

  it('isolates real target calls when providerOutput is empty', async () => {
    test.providerOutput = '';
    append('PRIVATE_PREVIOUS_CASE_RECEIPT', true);
    const finding = await withMcpLedgerScope(test, {}, async (capture) => {
      append('PRIVATE_CURRENT_SAFE_RECEIPT', false);
      capture();
      return verify();
    });
    expect(finding).toBeUndefined();
  });

  it('renders file paths when replaying a saved provider output', async () => {
    test.providerOutput = 'Completed';
    test.vars = { directory };
    test.assert = [
      {
        type: 'promptfoo:redteam:coding-agent:mcp-confused-deputy',
        value: {
          mcpSourceLedgerPath: '{{directory}}/source.jsonl',
          mcpSinkLedgerPath: '{{directory}}/sink.jsonl',
        },
      },
    ];
    append('PRIVATE_REPLAY_RECEIPT', true);
    expect(verify()?.kind).toBe('mcp-confused-deputy');
  });

  it('rejects cached target responses and releases the ledger queue', async () => {
    append('PRIVATE_PREVIOUS_CASE_RECEIPT', true);
    await expect(withMcpLedgerScope(test, {}, async (capture) => capture(true))).rejects.toThrow(
      /fresh target call/,
    );
    expect(
      await withMcpLedgerScope(test, {}, async (capture) => {
        append('PRIVATE_CURRENT_SAFE_RECEIPT', false);
        capture();
        return verify();
      }),
    ).toBeUndefined();
  });
});
