import { buildReconPrompt, DEFAULT_EXCLUSIONS } from '../../../../src/redteam/commands/recon/prompt';

describe('buildReconPrompt', () => {
  afterEach(() => {
    jest.resetAllMocks();
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
    expect(prompt).toContain('Phase 1: High-Level Understanding');
    expect(prompt).toContain('Phase 2: LLM/AI Integration Analysis');
    expect(prompt).toContain('Phase 3: Security Boundary Analysis');
    expect(prompt).toContain('Phase 4: External Research');
    expect(prompt).toContain('Phase 5: Artifact Extraction');
  });

  it('should include tool instructions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('Read, Grep, Glob, LS');
    expect(prompt).toContain('WebFetch, WebSearch');
  });

  it('should include secret handling instructions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('CRITICAL: Secret Handling');
    expect(prompt).toContain('DO NOT include the actual secret values');
  });

  it('should include plugin suggestions', () => {
    const prompt = buildReconPrompt('/tmp/notes.md');
    expect(prompt).toContain('pii:direct');
    expect(prompt).toContain('sql-injection');
    expect(prompt).toContain('prompt-injection');
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
});
