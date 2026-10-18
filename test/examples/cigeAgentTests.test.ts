import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';
import cliState from '../../src/cliState';
import { readTests } from '../../src/util/testCaseReader';

import type { ApiProvider, GradingResult, TestCase } from '../../src/types';

type Cige = {
  context: { tools: string[] };
  intent: { goal: string; success_criteria: unknown[]; required_evidence?: string[] };
  guardrails: unknown[];
  execution: { initial_path: Array<{ tool: string; args?: Record<string, unknown> }> };
};
type Transcript = {
  status: string;
  steps: Array<{ tool: string; status: string; result?: unknown }>;
  blocked: Array<{ tool: string; reasons: string[] }>;
  evidence: Record<string, unknown>;
  state: { deletedSessions: string[] };
  received: string[];
  criteria?: unknown[];
  redactions: number;
  advisory: string[];
  notImplemented: string[];
};
type RunResult = { refusal?: string; transcript: Transcript };

const exampleDir = path.resolve(process.cwd(), 'examples/eval-cige-agent-tests');
const loadCase = (name: string) =>
  yaml.parse(readFileSync(path.join(exampleDir, 'cases', name), 'utf8')) as Cige;
const provider: ApiProvider = { id: () => 'cige-example-test', callApi: async () => ({}) };

let validateCige: (cige: unknown) => string[];
let gradeCige: (cige: Cige, transcript: Transcript) => GradingResult;
let runCige: (cige: Cige, fixtureOptions?: Record<string, unknown>) => RunResult;
let cigeTests: (config: { cases: unknown[] }) => TestCase[];
let CigeRunner: new () => ApiProvider;

describe('CIGE agentic test case example', () => {
  beforeAll(async () => {
    const importExample = (file: string) => import(pathToFileURL(path.join(exampleDir, file)).href);
    ({ validateCige, gradeCige } = await importExample('cige.mjs'));
    ({ runCige, default: CigeRunner } = await importExample('cige-runner.mjs'));
    cigeTests = (await importExample('cige-tests.mjs')).default;
  });

  describe('validation', () => {
    it('accepts the example cases', () => {
      for (const name of [
        'streaming-session.cige.yaml',
        'streaming-undeclared-tool.cige.yaml',
        'streaming-requires-approval.cige.yaml',
      ]) {
        expect(validateCige(loadCase(name))).toEqual([]);
      }
    });

    it('reports each missing top-level field', () => {
      const {
        guardrails: _guardrails,
        execution: _execution,
        ...partial
      } = loadCase('streaming-session.cige.yaml');
      expect(validateCige(partial)).toEqual([
        'missing required top-level field "guardrails"',
        'missing required top-level field "execution"',
      ]);
      expect(validateCige('file://cases/streaming-session.cige.yaml')).toEqual([
        'CIGE case must be an object, got string',
      ]);
    });

    it('rejects malformed checks and steps', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.intent.success_criteria = [{ id: 'bad', check: { path: 'session.status' } }];
      cige.execution.initial_path = [{ args: {} } as never];
      expect(validateCige(cige)).toEqual([
        'intent.success_criteria[0].check needs a "path" and exactly one of equals, lte, gte',
        'execution.initial_path[0] must be an object with a "tool" name',
      ]);
    });
  });

  describe('adapter', () => {
    it('passes the complete CIGE object through with its source', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      const [test] = cigeTests({ cases: [{ source: 'cases/a.cige.yaml', case: cige }] });
      expect(test.vars).toEqual({ cige, fixture: {} });
      expect(test.metadata).toEqual({ cigeSource: 'cases/a.cige.yaml' });
      expect(test.description).toBe(cige.intent.goal);
    });

    it('fails loudly on an invalid case', () => {
      expect(() =>
        cigeTests({ cases: [{ source: 'cases/broken.cige.yaml', case: { context: {} } }] }),
      ).toThrow(
        /Invalid CIGE case cases\/broken\.cige\.yaml:\n- missing required top-level field "intent"/,
      );
      expect(() => cigeTests({ cases: [] })).toThrow(/at least one CIGE case/);
    });

    it('loads the configured cases through promptfoo test loading', async () => {
      const config = yaml.parse(
        readFileSync(path.join(exampleDir, 'promptfooconfig.yaml'), 'utf8'),
      );
      const tests = await readTests(config.tests, exampleDir);
      expect(tests.map((test) => test.metadata?.cigeSource)).toEqual([
        'cases/streaming-session.cige.yaml',
        'cases/streaming-undeclared-tool.cige.yaml',
        'cases/streaming-session.cige.yaml',
        'cases/streaming-requires-approval.cige.yaml',
      ]);
      expect(tests[0].vars?.cige).toEqual(loadCase('streaming-session.cige.yaml'));
      expect(tests[2].vars?.fixture).toEqual({ connectionLogRetention: false });
    });
  });

  describe('runner and grading', () => {
    it('passes the healthy case and redacts the session token', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      const { refusal, transcript } = runCige(cige);
      expect(refusal).toBeUndefined();
      expect(transcript.redactions).toBe(1);
      expect(JSON.stringify(transcript)).not.toMatch(/tok_/);
      expect(transcript.advisory).toHaveLength(3);
      expect(transcript.notImplemented).toEqual(['context.reveal_policy']);

      const result = gradeCige(cige, transcript);
      expect(result.pass).toBe(true);
      expect(result.namedScores).toEqual({ outcome: 1, evidence: 1, guardrails: 1 });
    });

    it('blocks a forbidden call before it reaches the tool', () => {
      const cige = loadCase('streaming-undeclared-tool.cige.yaml');
      const { transcript } = runCige(cige);
      expect(transcript.blocked).toEqual([
        {
          index: 2,
          tool: 'delete_session',
          reasons: [
            '"delete_session" is not declared in context.tools',
            'denied by guardrail "Do not delete resources"',
          ],
        },
      ]);
      expect(transcript.received).not.toContain('delete_session');
      expect(transcript.state.deletedSessions).toEqual([]);

      const result = gradeCige(cige, transcript);
      expect(result.pass).toBe(false);
      expect(result.namedScores).toEqual({ outcome: 1, evidence: 1, guardrails: 0 });
      expect(result.reason).toMatch(/^Forbidden tool call attempted and blocked before dispatch/);
    });

    it('blocks undeclared tools even without a deny guardrail', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.guardrails = [];
      cige.execution.initial_path.push({ tool: 'delete_session' });
      const { transcript } = runCige(cige);
      expect(transcript.blocked[0].reasons).toEqual([
        '"delete_session" is not declared in context.tools',
      ]);
      expect(transcript.received).not.toContain('delete_session');
    });

    it('fails when tools succeed but required evidence is missing', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      const { transcript } = runCige(cige, { connectionLogRetention: false });
      expect(transcript.steps.every((step) => step.status === 'ok')).toBe(true);
      expect(transcript.blocked).toEqual([]);

      const result = gradeCige(cige, transcript);
      expect(result.pass).toBe(false);
      expect(result.namedScores).toEqual({ outcome: 1, evidence: 0, guardrails: 1 });
      expect(result.reason).toBe(
        'Tools succeeded and outcome criteria were met, but intent is not satisfied. Required evidence missing: connection_log',
      );
    });

    it('refuses before any tool call when a mandatory guardrail cannot be enforced', () => {
      const { refusal, transcript } = runCige(loadCase('streaming-requires-approval.cige.yaml'));
      expect(refusal).toBe(
        'CIGE preflight refused: this runner cannot enforce mandatory guardrail(s) "Do not change intent without human approval" (require_human_approval). No tool calls were made.',
      );
      expect(transcript.received).toEqual([]);
    });

    it('fails criteria that cannot be checked instead of passing them', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.intent.success_criteria.push('stream looks smooth to a human');
      const result = gradeCige(cige, runCige(cige).transcript);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain(
        'stream looks smooth to a human (unverifiable: no machine-checkable "check")',
      );
    });

    it('redacts forbidden values everywhere in the emitted transcript', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      // The session id is also kept in the observed state, not only in tool results.
      cige.guardrails.push({
        rule: 'Never expose session ids',
        mandatory: true,
        enforce: { forbid_output_pattern: 'sess-[0-9]+' },
      });
      const { transcript } = runCige(cige);
      expect(JSON.stringify(transcript)).not.toMatch(/sess-[0-9]+/);
      expect(transcript.redactions).toBeGreaterThan(1);
    });

    it('fails a check whose path is missing instead of treating it as null', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.intent.success_criteria = [
        { id: 'typo', check: { path: 'session.errror', equals: null } },
        { id: 'stored-null', check: { path: 'session.error', equals: null } },
      ];
      const result = gradeCige(cige, runCige(cige).transcript);
      expect(result.pass).toBe(false);
      expect(result.reason).toBe(
        'Outcome criteria not met: typo (session.errror not found in observed state)',
      );
    });

    it('rejects an invalid redaction pattern before any tool runs', async () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.guardrails.push({
        rule: 'Broken pattern',
        mandatory: true,
        enforce: { forbid_output_pattern: '[' },
      });
      expect(validateCige(cige)).toEqual([
        expect.stringMatching(
          /^guardrails\[5\]\.enforce\.forbid_output_pattern is not a valid regular expression/,
        ),
      ]);
      const { refusal, transcript } = runCige(cige);
      expect(refusal).toMatch(/^Invalid CIGE case: /);
      expect(transcript.received).toEqual([]);

      const response = await new CigeRunner().callApi('', {
        prompt: { raw: '', label: '' },
        vars: { cige },
      });
      expect(response.error).toMatch(/not a valid regular expression/);
      expect(response.output).toBeUndefined();
    });

    it('rejects null success criteria instead of crashing', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.intent.success_criteria.push(null);
      expect(validateCige(cige)).toEqual([
        'intent.success_criteria[3] must be a string or an object',
      ]);
      expect(runCige(cige).refusal).toMatch(/^Invalid CIGE case: /);
    });

    it('grades criteria on the raw state even when the value is redacted', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      cige.intent.success_criteria.push({
        id: 'signed-in-as-test-user',
        check: { path: 'user', equals: 'test-enterprise-user' },
      });
      cige.guardrails.push({
        rule: 'Never expose account names',
        mandatory: true,
        enforce: { forbid_output_pattern: 'test-enterprise-user' },
      });
      const { transcript } = runCige(cige);
      expect(JSON.stringify(transcript)).not.toContain('test-enterprise-user');
      expect(gradeCige(cige, transcript).namedScores).toEqual({
        outcome: 1,
        evidence: 1,
        guardrails: 1,
      });
    });

    it('checks transcript.state when a runner reports no criterion results', () => {
      const cige = loadCase('streaming-session.cige.yaml');
      const { criteria: _criteria, ...transcript } = runCige(cige).transcript;
      expect(gradeCige(cige, transcript).pass).toBe(true);
      transcript.state = { ...transcript.state, session: { status: 'idle' } } as never;
      expect(gradeCige(cige, transcript).pass).toBe(false);
    });

    it('reports components through the javascript assertion', async () => {
      const cige = loadCase('streaming-session.cige.yaml');
      const { transcript } = runCige(cige, { connectionLogRetention: false });
      // Resolve the assertion relative to the example, exactly as promptfooconfig.yaml does.
      const result = await cliState.withBasePath(exampleDir, () =>
        runAssertions({
          prompt: cige.intent.goal,
          provider,
          providerResponse: { output: transcript },
          test: {
            vars: { cige },
            assert: [{ type: 'javascript', value: 'file://cige.mjs:assertIntent' }],
          },
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.namedScores).toEqual({ outcome: 1, evidence: 0, guardrails: 1 });
    });
  });
});
