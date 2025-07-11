import { toSimpleProviderList } from '../../../../providers/defaultProviders';
import type { RedteamUITarget } from '../types';

// Convert the centralized provider list to RedteamUITarget format
const providerOptions = toSimpleProviderList();

// Create predefined targets with special target types first, then foundation models
export const predefinedTargets: RedteamUITarget[] = [
  { value: '', label: 'Select a target' },
  { value: 'http', label: 'HTTP/HTTPS Endpoint' },
  { value: 'websocket', label: 'WebSocket Endpoint' },
  { value: 'browser', label: 'Web Browser Automation' },
  // Add all foundation models from centralized list
  ...providerOptions.slice(0, 20).map((provider) => ({
    value: provider.value,
    label: provider.label,
  })),
];

export const customTargetOption: RedteamUITarget = { value: 'custom', label: 'Custom Target' };
