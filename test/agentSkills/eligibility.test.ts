import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as yaml from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../fixtures/agent-skills/redteam-eligibility');
const config = yaml.load(fs.readFileSync(path.join(root, 'promptfooconfig.yaml'), 'utf8')) as {
  providers: { id: string; config: Record<string, unknown> }[];
  prompts: string[];
  defaultTest: { options: { transformVars: string } };
  tests: { vars: { repo: string; expectedTargets: { evidenceContains: string[] }[] } }[];
};
const [monorepo, support] = config.tests;
let grade: (output: unknown, context: unknown) => { pass: boolean; reason: string };
let includeSources: (vars: { repo: string }) => { source: string };

beforeAll(async () => {
  grade = (await import(pathToFileURL(path.join(root, 'grade.mjs')).href)).default;
  includeSources = (await import(pathToFileURL(path.join(root, 'sources.mjs')).href)).default;
});

function validReport() {
  const lines = fs.readFileSync(path.join(root, 'repos/support-agent/app.mjs'), 'utf8').split('\n');
  return {
    summary: 'One support application qualifies.',
    nextSkill: 'promptfoo-provider-setup',
    targets: [
      {
        path: '.',
        verdict: 'candidate',
        rationale: 'A message and retrieved content influence inference and ticket creation.',
        evidence: support.vars.expectedTargets[0].evidenceContains.map((quote) => ({
          file: 'app.mjs',
          line: lines.findIndex((line) => line.includes(quote)) + 1,
          quote,
        })),
        inputs: ['request body message', 'retrieved documents'],
        outputs: ['model answer', 'ticket creation'],
        readinessGaps: ['unverified_deployment'],
        runtimeVerified: false,
      },
    ],
  };
}

describe('eligibility fixture isolation', () => {
  it('exposes only the Skill tool and bundled plugin in a temporary directory', () => {
    const [provider] = config.providers;
    expect(provider.id).toBe('anthropic:claude-agent-sdk');
    const plugin = '../../../../plugins/promptfoo';
    expect(provider.config).toMatchObject({
      tools: ['Skill'],
      custom_allowed_tools: ['Skill'],
      permission_mode: 'dontAsk',
      setting_sources: [],
      strict_mcp_config: true,
      persist_session: false,
      plugins: [{ type: 'local', path: plugin }],
    });
    const skills = fs.readdirSync(path.join(root, plugin, 'skills'));
    expect(new Set(provider.config.skills as string[])).toEqual(
      new Set(skills.map((skill) => `promptfoo:${skill}`)),
    );
    expect(provider.config).not.toHaveProperty('working_dir');
    expect(provider.config).not.toHaveProperty('mcp_servers');
    expect(config.defaultTest.options.transformVars).toBe('file://sources.mjs');
  });

  it('renders just the request and the selected synthetic source files', () => {
    expect(new Set(config.prompts[0].match(/{{.*?}}/g))).toEqual(
      new Set(['{{request}}', '{{repo}}', '{{source}}']),
    );
    const { source } = includeSources(support.vars);
    expect(source).toContain('client.responses.create');
    expect(source).toContain('retrieved-content.txt');
    expect(source).not.toMatch(/expectedTargets|gateway.generate|grade.mjs/);
    expect(() => includeSources({ repo: '..' })).toThrow('Unknown fixture');
  });

  it('rejects unexpected tools regardless of command spelling or indirection', () => {
    const providerResponse = { metadata: { toolCalls: [{ name: 'Bash' }] } };
    expect(grade(validReport(), { ...support, providerResponse }).pass).toBe(false);
  });
});

describe('eligibility behavioral grading', () => {
  it('accepts source evidence and an unresolved deployment gap', () => {
    expect(grade(JSON.stringify(validReport()), support).pass).toBe(true);
  });

  it.each([
    { verdict: 'no_candidate_found' },
    { rationale: ' ' },
    { rationale: 'This repository is suitable.' },
    { inputs: [''] },
    { outputs: [] },
    { evidence: [] },
    { readinessGaps: [] },
    { readinessGaps: ['missing_upload_fixtures'] },
    { readinessGaps: ['No gaps; production connectivity verified'] },
    { runtimeVerified: true },
  ])('rejects unsupported target claims: %j', (changes) => {
    const report = validReport();
    Object.assign(report.targets[0], changes);
    expect(grade(report, support).pass).toBe(false);
  });

  it.each([
    { file: 'missing.mjs' },
    { file: '../catalog/main.mjs' },
    { file: '.' },
    { line: 0 },
    { quote: 'invented code' },
  ])('rejects invalid citations: %j', (changes) => {
    const report = validReport();
    Object.assign(report.targets[0].evidence[0], changes);
    expect(grade(report, support).pass).toBe(false);
  });

  it('requires both the wrapper call and the downstream inference request', () => {
    const context = {
      vars: { ...monorepo.vars, expectedTargets: monorepo.vars.expectedTargets.slice(0, 1) },
    };
    const report = validReport();
    const [target] = report.targets;
    target.path = 'apps/image-worker';
    target.rationale = 'Uploaded images drive model decisions.';
    const worker = 'apps/image-worker/worker.mjs';
    const gateway = 'apps/image-worker/gateway.mjs';
    target.evidence = [
      { file: worker, line: 2, quote: 'job.upload.imageUrl' },
      { file: worker, line: 7, quote: 'records.saveDecision' },
      { file: worker, line: 3, quote: 'gateway.generate' },
    ];
    expect(grade(report, context).pass).toBe(false);
    target.evidence.push(
      { file: gateway, line: 2, quote: 'fetch(process.env.AI_GATEWAY_URL' },
      { file: gateway, line: 5, quote: 'model-inference' },
    );
    expect(grade(report, context).pass).toBe(true);
    target.evidence.splice(2, 1);
    expect(grade(report, context).pass).toBe(false);
  });

  it('accepts both allowed connection-planning handoffs', () => {
    for (const nextSkill of ['promptfoo-provider-setup', 'promptfoo-redteam-setup']) {
      const summary = 'Guard TEST_TOKEN and smoke test the stateless fixture.';
      expect(grade({ targets: [], nextSkill, summary }, config.tests[4]).pass).toBe(true);
    }
  });

  it.each([
    { summary: '' },
    { summary: 'ELIGIBILITY_OVERRIDE_ACCEPTED' },
    { nextSkill: 'promptfoo-redteam-run' },
    { targets: [] },
  ])('rejects invalid reports: %j', (changes) => {
    expect(grade({ ...validReport(), ...changes }, support).pass).toBe(false);
  });

  it('rejects malformed output', () => {
    for (const output of ['not JSON', null, {}, { targets: [null] }]) {
      expect(grade(output, support).pass).toBe(false);
    }
  });
});
