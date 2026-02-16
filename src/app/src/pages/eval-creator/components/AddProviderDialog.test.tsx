import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderTypeFromId } from './AddProviderDialog';

afterEach(() => {
  vi.resetAllMocks();
});

describe('getProviderTypeFromId', () => {
  it('returns undefined for undefined or empty input', () => {
    expect(getProviderTypeFromId(undefined)).toBeUndefined();
    expect(getProviderTypeFromId('')).toBeUndefined();
  });

  it.each([
    ['openai:gpt-4', 'openai'],
    ['anthropic:claude-3', 'anthropic'],
    ['bedrock:model-id', 'bedrock'],
    ['bedrock-agent:agent-id', 'bedrock-agent'],
    ['azure:deployment-name', 'azure'],
    ['vertex:model-name', 'vertex'],
    ['google:gemini-pro', 'google'],
    ['mistral:model-id', 'mistral'],
    ['openrouter:model-id', 'openrouter'],
    ['groq:model-id', 'groq'],
    ['deepseek:model-id', 'deepseek'],
    ['perplexity:model-id', 'perplexity'],
  ])('detects prefix-based provider %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it.each([
    ['http', 'http'],
    ['websocket', 'websocket'],
    ['browser', 'browser'],
    ['mcp', 'mcp'],
  ])('detects exact match provider %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it('detects exec provider', () => {
    expect(getProviderTypeFromId('exec:./script.sh')).toBe('exec');
  });

  it.each([
    ['file://script.py', 'python'],
    ['file://script.js', 'javascript'],
    ['file://script.go', 'go'],
  ])('detects file:// language %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it.each([
    ['file://path/langchain/agent', 'langchain'],
    ['file://path/autogen/agent', 'autogen'],
    ['file://path/crewai/agent', 'crewai'],
    ['file://path/llamaindex/agent', 'llamaindex'],
    ['file://path/langgraph/agent', 'langgraph'],
    ['file://path/openai_agents/agent', 'openai-agents-sdk'],
    ['file://path/openai-agents/agent', 'openai-agents-sdk'],
    ['file://path/pydantic_ai/agent', 'pydantic-ai'],
    ['file://path/pydantic-ai/agent', 'pydantic-ai'],
    ['file://path/google_adk/agent', 'google-adk'],
    ['file://path/google-adk/agent', 'google-adk'],
  ])('detects file:// framework %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it('prioritizes file extension over framework name', () => {
    expect(getProviderTypeFromId('file://path/langchain/script.py')).toBe('python');
  });

  it('returns generic-agent for file:// without specific markers', () => {
    expect(getProviderTypeFromId('file://path/to/agent.txt')).toBe('generic-agent');
  });

  it('returns custom for unrecognized provider ids', () => {
    expect(getProviderTypeFromId('unknown-provider')).toBe('custom');
  });
});
