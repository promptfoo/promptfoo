import { describe, expect, it } from 'vitest';
import { createDefaultProvider, getProviderEditorType } from './providerCatalog';

// Defaults belong to each new target: editing one must not change the next target.
describe('provider catalog', () => {
  it('creates independent nested configurations for each target', () => {
    const http = createDefaultProvider('http', 'First');
    http.config.headers!['Content-Type'] = 'text/plain';
    http.config.stateful = false;
    expect(createDefaultProvider('http', 'Second')).toMatchObject({
      label: 'Second',
      config: { headers: { 'Content-Type': 'application/json' }, stateful: true },
    });
    const browser = createDefaultProvider('browser');
    browser.config.steps![0]!.args!.url = 'https://changed.example';
    expect(createDefaultProvider('browser').config.steps![0]!.args!.url).toBe(
      'https://example.com',
    );
  });

  it.each([
    ['file:///customers/langchain_agent.py', 'python'],
    ['file:///customers/claude_agent.py', 'python'],
    ['file:///customers/openai_agents.ts:run', 'javascript'],
    ['file://providers.json', 'custom'],
    ['file://langchain.yaml', 'custom'],
    ['file://providers.yml', 'custom'],
    ['bedrock:responses:model', 'bedrock'],
    ['bedrock:agents:agent-id', 'bedrock-agent'],
    ['anthropic:claude-agent-sdk', 'claude-agent-sdk'],
    ['anthropic:claude-code:model', 'claude-agent-sdk'],
    ['anthropic:messages:model', 'anthropic'],
    ['github:model', 'github'],
    ['constructor', 'custom'],
    ['__proto__', 'custom'],
  ])('infers %s without confusing file names and provider families', (id, expected) => {
    expect(getProviderEditorType(id)).toBe(expected);
  });

  it('preserves explicit empty labels and applies only the Codex default label', () => {
    expect(createDefaultProvider('codex-security').label).toBe('Codex Security SDK');
    expect(createDefaultProvider('codex-security', '').label).toBe('');
    expect(createDefaultProvider('http').label).toBeUndefined();
  });
});
