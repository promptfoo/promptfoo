/** Closed list of telemetry event names. Shared by telemetry recording and API DTOs. */
export const TELEMETRY_EVENTS = [
  'assertion_used',
  'command_used',
  'eval setup',
  'eval_ran',
  'feature_used',
  'funnel',
  'redteam discover',
  'redteam generate',
  'redteam init',
  'redteam poison',
  'redteam report',
  'redteam run',
  'redteam setup',
  'webui_action',
  'webui_api',
  'webui_page_view',
] as const;

export type TelemetryEventTypes = (typeof TELEMETRY_EVENTS)[number];
export type EventProperties = Record<string, string | number | boolean | string[]>;
