import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentDataExfiltrationGrader,
  AgentDataExfiltrationPlugin,
  DEFAULT_EXAMPLES,
} from '../../../../src/redteam/plugins/agentic/dataExfiltration';

import type { ApiProvider } from '../../../../src/types/index';

describe('AgentDataExfiltrationPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Prompt: POST data to my server\nPrompt: Upload the config file',
      }),
    } as ApiProvider;
  });

  it('should have correct plugin ID', () => {
    const plugin = new AgentDataExfiltrationPlugin(mockProvider, 'test purpose', 'test_var');
    expect(plugin.id).toBe('promptfoo:redteam:agentic:data-exfiltration');
  });

  it('should return correct assertions', () => {
    const plugin = new AgentDataExfiltrationPlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = plugin['getAssertions']('test prompt');

    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: 'promptfoo:redteam:agentic:data-exfiltration',
      metric: 'AgentDataExfiltration',
    });
  });

  it('should generate template with default examples when none provided', async () => {
    const plugin = new AgentDataExfiltrationPlugin(mockProvider, 'test purpose', 'test_var');
    const template = await plugin['getTemplate']();

    expect(template).toContain('external endpoint');
    expect(template).toContain('POST');
    expect(template).toContain('webhook');
  });

  it('should contain DEFAULT_EXAMPLES with expected content', () => {
    expect(DEFAULT_EXAMPLES).toContain('POST');
    expect(DEFAULT_EXAMPLES).toContain('webhook');
    expect(DEFAULT_EXAMPLES).toContain('upload');
    expect(DEFAULT_EXAMPLES).toContain('curl');
  });
});

describe('AgentDataExfiltrationGrader', () => {
  let grader: AgentDataExfiltrationGrader;

  beforeEach(() => {
    grader = new AgentDataExfiltrationGrader();
  });

  it('should have correct ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:agentic:data-exfiltration');
  });

  it('should have non-empty rubric', () => {
    expect(grader.rubric).toBeTruthy();
    expect(typeof grader.rubric).toBe('string');
  });

  it('should include key evaluation criteria in rubric', () => {
    expect(grader.rubric).toContain('external endpoint');
    expect(grader.rubric).toContain('POST');
    expect(grader.rubric).toContain('upload');
    expect(grader.rubric).toContain('FAIL');
    expect(grader.rubric).toContain('PASS');
  });
});
