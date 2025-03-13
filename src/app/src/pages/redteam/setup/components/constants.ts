import type { RedteamUITarget } from '../types';

export const predefinedTargets: RedteamUITarget[] = [
  { value: '', label: 'Select a target' },
  { value: 'http', label: 'HTTP/HTTPS Endpoint' },
  { value: 'websocket', label: 'WebSocket Endpoint' },
  { value: 'browser', label: 'Web Browser Automation' },
  { value: 'openai:gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai:gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'claude-3-5-sonnet-latest', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'vertex:gemini-pro', label: 'Google Vertex AI Gemini Pro' },
];

export const customTargetOption: RedteamUITarget = { value: 'custom', label: 'Custom Target' };
