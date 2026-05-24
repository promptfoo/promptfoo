import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReconPrompt,
  DEFAULT_EXCLUSIONS,
} from '../../../../src/redteam/commands/recon/prompt';

describe('buildReconPrompt', () => {
  const targetDirectory = '/repo/customer-support-app';
  const scratchpadPath = '/tmp/scratchpad/notes.md';
  const buildPrompt = (exclusions?: string[]) =>
    buildReconPrompt(targetDirectory, scratchpadPath, exclusions);

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should identify the target directory separately from the execution workspace', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain(targetDirectory);
    expect(prompt).toContain('must not be used as evidence');
  });

  it('should include scratchpad path in prompt', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain(scratchpadPath);
  });

  it('should include default exclusions', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('node_modules/**');
    expect(prompt).toContain('.git/**');
    expect(prompt).toContain('.env*');
  });

  it('should include additional exclusions when provided', () => {
    const prompt = buildPrompt(['custom/**', '*.secret']);
    expect(prompt).toContain('custom/**');
    expect(prompt).toContain('*.secret');
  });

  it('should include analysis instructions', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('Phase 1: Application Understanding');
    expect(prompt).toContain('Phase 2: LLM Integration Discovery');
    expect(prompt).toContain('Phase 3: Attack Surface Mapping');
    expect(prompt).toContain('Phase 4: Entity Extraction');
  });

  it('should include tool instructions', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('Read, Grep, Glob, LS');
    expect(prompt).toContain('provider-approved documentation search tools');
    expect(prompt).toContain('Do not fetch arbitrary URLs or use shell/network egress');
  });

  it('should include output rules for blackbox perspective', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('CRITICAL OUTPUT RULES');
    expect(prompt).toContain('NO FILE REFERENCES in descriptive fields');
    expect(prompt).toContain('NO SECRET VALUES');
  });

  it('should include guidance on redteamUser persona', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain("redteamUser should be the APPLICATION'S user");
    expect(prompt).toContain('NOT security tester');
  });

  it('should include guidance on connectedSystems', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('connectedSystems should be LLM-accessible tools');
    expect(prompt).toContain('NOT internal architecture');
  });

  it('should include guidance on stateful detection for strategy selection', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('STATEFUL (multi-turn) or STATELESS (single-turn)');
    expect(prompt).toContain('conversation history');
    expect(prompt).toContain('stateful determines attack strategy selection');
  });

  it('should require null output values rather than invented reconnaissance context', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('Use null for unknown values');
    expect(prompt).toContain('rather than guessing or inventing context');
  });

  it('should include plugin suggestions', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('pii:direct');
    expect(prompt).toContain('sql-injection');
    expect(prompt).toContain('prompt-extraction');
    // Verify strategies are explicitly NOT listed as plugins
    expect(prompt).toContain('prompt-injection (this is a STRATEGY, not a plugin)');
  });

  it('should include output schema', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('"purpose"');
    expect(prompt).toContain('"features"');
    expect(prompt).toContain('"discoveredTools"');
  });
});

describe('DEFAULT_EXCLUSIONS', () => {
  it('should include common build directories', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('node_modules/**');
    expect(DEFAULT_EXCLUSIONS).toContain('dist/**');
    expect(DEFAULT_EXCLUSIONS).toContain('build/**');
    expect(DEFAULT_EXCLUSIONS).toContain('.next/**');
  });

  it('should include Python artifacts', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('__pycache__/**');
    expect(DEFAULT_EXCLUSIONS).toContain('*.pyc');
    expect(DEFAULT_EXCLUSIONS).toContain('.venv/**');
    expect(DEFAULT_EXCLUSIONS).toContain('venv/**');
  });

  it('should exclude secret files', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('.env*');
    expect(DEFAULT_EXCLUSIONS).toContain('.npmrc');
    expect(DEFAULT_EXCLUSIONS).toContain('.pypirc');
    expect(DEFAULT_EXCLUSIONS).toContain('.netrc');
    expect(DEFAULT_EXCLUSIONS).toContain('.git-credentials');
    expect(DEFAULT_EXCLUSIONS).toContain('.ssh/**');
    expect(DEFAULT_EXCLUSIONS).toContain('.docker/config.json');
    expect(DEFAULT_EXCLUSIONS).toContain('.aws/credentials');
    expect(DEFAULT_EXCLUSIONS).toContain('.kube/config');
    expect(DEFAULT_EXCLUSIONS).toContain('id_rsa');
    expect(DEFAULT_EXCLUSIONS).toContain('id_ed25519');
    expect(DEFAULT_EXCLUSIONS).toContain('*.pem');
    expect(DEFAULT_EXCLUSIONS).toContain('*.key');
    expect(DEFAULT_EXCLUSIONS).toContain('*.p12');
    expect(DEFAULT_EXCLUSIONS).toContain('*.pfx');
    expect(DEFAULT_EXCLUSIONS).toContain('*.jks');
    expect(DEFAULT_EXCLUSIONS).toContain('*.keystore');
  });

  it('should exclude git directory', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('.git/**');
  });

  it('should exclude promptfoo config files', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('promptfooconfig.yaml');
    expect(DEFAULT_EXCLUSIONS).toContain('redteam.yaml');
  });
});
