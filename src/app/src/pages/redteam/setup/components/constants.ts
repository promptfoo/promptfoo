import type { RedteamUITarget } from '../types';

export const predefinedTargets: RedteamUITarget[] = [
  { value: '', label: 'Select a target' },
  { value: 'http', label: 'HTTP/HTTPS Endpoint' },
  { value: 'websocket', label: 'WebSocket Endpoint' },
  { value: 'browser', label: 'Web Browser Automation' },
  { value: 'openai:gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'openai:gpt-4.1', label: 'OpenAI GPT-4.1' },
  { value: 'openai:gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
  { value: 'claude-sonnet-4-20250514', label: 'Anthropic Claude 4 Sonnet' },
  { value: 'claude-opus-4-20250514', label: 'Anthropic Claude 4 Opus' },
  { value: 'claude-3-7-sonnet-latest', label: 'Anthropic Claude 3.7 Sonnet' },
  { value: 'vertex:gemini-2.5-pro', label: 'Google Vertex AI Gemini 2.5 Pro' },
];

export const customTargetOption: RedteamUITarget = { value: 'custom', label: 'Custom Target' };
