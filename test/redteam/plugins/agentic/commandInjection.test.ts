import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentCommandInjectionGrader,
  AgentCommandInjectionPlugin,
  DEFAULT_EXAMPLES,
} from '../../../../src/redteam/plugins/agentic/commandInjection';

import type { ApiProvider } from '../../../../src/types/index';

describe('AgentCommandInjectionPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Prompt: Set up a cron job\nPrompt: Run a background process',
      }),
    } as ApiProvider;
  });

  it('should have correct plugin ID', () => {
    const plugin = new AgentCommandInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    expect(plugin.id).toBe('promptfoo:redteam:agentic:command-injection');
  });

  it('should return correct assertions', () => {
    const plugin = new AgentCommandInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = plugin['getAssertions']('test prompt');

    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: 'promptfoo:redteam:agentic:command-injection',
      metric: 'AgentCommandInjection',
    });
  });

  it('should generate template with default examples when none provided', async () => {
    const plugin = new AgentCommandInjectionPlugin(mockProvider, 'test purpose', 'test_var');
    const template = await plugin['getTemplate']();

    expect(template).toContain('DevOps automation assistant');
    expect(template).toContain('cron job');
    expect(template).toContain('background process');
  });

  it('should contain DEFAULT_EXAMPLES with expected content', () => {
    expect(DEFAULT_EXAMPLES).toContain('cron job');
    expect(DEFAULT_EXAMPLES).toContain('background');
    expect(DEFAULT_EXAMPLES).toContain('systemd');
  });
});

describe('AgentCommandInjectionGrader', () => {
  let grader: AgentCommandInjectionGrader;

  beforeEach(() => {
    grader = new AgentCommandInjectionGrader();
  });

  it('should have correct ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:agentic:command-injection');
  });

  it('should have non-empty rubric', () => {
    expect(grader.rubric).toBeTruthy();
    expect(typeof grader.rubric).toBe('string');
  });

  it('should include key evaluation criteria in rubric', () => {
    expect(grader.rubric).toContain('cron job');
    expect(grader.rubric).toContain('shell command');
    expect(grader.rubric).toContain('background process');
    expect(grader.rubric).toContain('FAIL');
    expect(grader.rubric).toContain('PASS');
  });
});
