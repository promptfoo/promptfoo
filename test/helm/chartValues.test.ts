import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';
import { loadYaml } from '../../src/util/yamlLoad';

const rootDir = path.join(__dirname, '../..');
const valuesPath = path.join(rootDir, 'helm/chart/promptfoo/values.yaml');
const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
const selfHostingDocPath = path.join(rootDir, 'site/docs/usage/self-hosting.md');

/** Matches a YAML mapping key at the start of a line, e.g. `  hosts:`. */
const KEY_RE = /^(\s*)([A-Za-z_][A-Za-z0-9_.\-]*):(\s|$)/;

/**
 * Undo a single level of commenting the way an operator would: drop the first
 * `#` and one optional following space. `  # hosts:` becomes `  hosts:`.
 */
function uncomment(line: string): string {
  return line.replace(/^(\s*)#( ?)/, '$1');
}

interface KeyEntry {
  /** Dotted path of enclosing live keys, e.g. `ingress`. */
  scope: string;
  key: string;
  indent: number;
  lineNumber: number;
}

/**
 * Collect every mapping key in the document, both the live ones and the ones
 * that a commented-out example would introduce if it were uncommented in
 * place. Scope is tracked from the live keys only, since comments never nest.
 */
function collectKeys(content: string): { live: KeyEntry[]; commented: KeyEntry[] } {
  const live: KeyEntry[] = [];
  const commented: KeyEntry[] = [];
  const stack: { key: string; indent: number }[] = [];

  // Split on \r?\n so a Windows CRLF checkout does not leave a trailing \r on
  // every line, which would break the key regex below.
  content.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const isComment = /^\s*#/.test(line);
    const match = KEY_RE.exec(isComment ? uncomment(line) : line);
    if (!match) {
      return;
    }
    const indent = match[1].length;
    const key = match[2];

    if (isComment) {
      // Resolve the scope this key would land in without mutating the stack.
      const enclosing = stack.filter((frame) => frame.indent < indent);
      commented.push({ scope: enclosing.map((f) => f.key).join('.'), key, indent, lineNumber });
      return;
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    live.push({ scope: stack.map((f) => f.key).join('.'), key, indent, lineNumber });
    stack.push({ key, indent });
  });

  return { live, commented };
}

describe('helm chart values.yaml', () => {
  it('parses and keeps the ingress defaults empty', () => {
    const values = loadYaml(valuesContent) as Record<string, any>;

    expect(values.ingress).toMatchObject({
      enabled: true,
      className: '',
      annotations: {},
      hosts: [],
      tls: [],
    });
    expect(values.domainName).toBe('promptfoo.example.com');
  });

  /**
   * A commented-out example that names a key which already exists live in the
   * same block is a silent footgun: uncommenting it in place produces a
   * duplicate YAML key, and Helm's last-wins parsing discards the operator's
   * values with no lint or template error. Commented examples must therefore
   * sit *below* the live key they illustrate (as list items), so that
   * uncommenting in place fails loudly instead.
   */
  it('has no commented example that shadows a live key in the same block', () => {
    const { live, commented } = collectKeys(valuesContent);
    const liveKeys = new Set(live.map((entry) => `${entry.scope}\u0000${entry.key}`));

    const shadowed = commented
      .filter((entry) => liveKeys.has(`${entry.scope}\u0000${entry.key}`))
      .map((entry) => `line ${entry.lineNumber}: ${entry.scope || '<root>'}.${entry.key}`);

    expect(shadowed).toEqual([]);
  });

  /**
   * The self-hosting guide ships a copy-pasteable `my-values.yaml`. Helm
   * silently ignores a key the chart never reads, so a typo there (e.g.
   * `persistentVolumeClaims` vs the chart's `persistentVolumesClaims`) leaves
   * the operator on chart defaults with no lint or template error.
   */
  it('documents only value keys that the chart actually reads', () => {
    const doc = fs.readFileSync(selfHostingDocPath, 'utf-8');
    // \r?\n so the fence still matches on Windows checkouts, where git hands
    // back CRLF line endings and a bare \n never matches.
    const block = /```yaml title="my-values\.yaml"\r?\n([\s\S]*?)```/.exec(doc);
    expect(block).not.toBeNull();

    const documented = collectKeys(block![1]).live.filter((entry) => entry.indent === 0);
    expect(documented.length).toBeGreaterThan(0);

    const chartKeys = new Set(Object.keys(loadYaml(valuesContent) as Record<string, unknown>));
    const unknown = documented.filter((entry) => !chartKeys.has(entry.key)).map((e) => e.key);

    expect(unknown).toEqual([]);
  });
});
