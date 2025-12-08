import { vi } from 'vitest';
import {
  buildReconPrompt,
  DEFAULT_EXCLUSIONS,
} from '../../../../src/redteam/commands/recon/prompt';

describe('buildReconPrompt', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should include scratchpad path in prompt', () => {
    const prompt = buildReconPrompt('/tmp/scratchpad/notes.md');
    expect(prompt).toContain('/tmp/scratchpad/notes.md');
  });

  it('should include default exclusions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('node_modules/**');
    expect(prompt).toContain('.git/**');
    expect(prompt).toContain('.env*');
  });

  it('should include additional exclusions when provided', () => {
    const prompt = buildReconPrompt('/tmp/notes.md', ['custom/**', '*.secret']);
    expect(prompt).toContain('custom/**');
    expect(prompt).toContain('*.secret');
  });

  it('should include analysis instructions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('Phase 1: Application Understanding');
    expect(prompt).toContain('Phase 2: LLM Integration Discovery');
    expect(prompt).toContain('Phase 3: Attack Surface Mapping');
    expect(prompt).toContain('Phase 4: Entity Extraction');
  });

  it('should include tool instructions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('Read, Grep, Glob, LS');
    expect(prompt).toContain('WebFetch, WebSearch');
  });

  it('should include output rules for blackbox perspective', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('CRITICAL OUTPUT RULES');
    expect(prompt).toContain('NO FILE REFERENCES in descriptive fields');
    expect(prompt).toContain('NO SECRET VALUES');
  });

  it('should include guidance on redteamUser persona', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain("redteamUser should be the APPLICATION'S user");
    expect(prompt).toContain('NOT security tester');
  });

  it('should include guidance on connectedSystems', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('connectedSystems should be LLM-accessible tools');
    expect(prompt).toContain('NOT internal architecture');
  });

  it('should include guidance on stateful detection for strategy selection', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('STATEFUL (multi-turn) or STATELESS (single-turn)');
    expect(prompt).toContain('conversation history');
    expect(prompt).toContain('stateful determines attack strategy selection');
  });

  it('should include plugin suggestions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('pii:direct');
    expect(prompt).toContain('sql-injection');
    expect(prompt).toContain('prompt-extraction');
    // Verify strategies are explicitly NOT listed as plugins
    expect(prompt).toContain('prompt-injection (this is a STRATEGY, not a plugin)');
  });

  it('should include output schema', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
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
  });

  it('should exclude git directory', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('.git/**');
  });

  it('should exclude promptfoo config files', () => {
    expect(DEFAULT_EXCLUSIONS).toContain('promptfooconfig.yaml');
    expect(DEFAULT_EXCLUSIONS).toContain('redteam.yaml');
  });
});
