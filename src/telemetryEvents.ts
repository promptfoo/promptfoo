import { z } from 'zod';
import { VERSION } from './constants';

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

export const TelemetryPropertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const TelemetryEventSchema = z.object({
  event: z.enum(TELEMETRY_EVENTS),
  packageVersion: z.string().optional().prefault(VERSION),
  properties: z.record(z.string(), TelemetryPropertyValueSchema),
});

export type TelemetryEventTypes = (typeof TELEMETRY_EVENTS)[number];
export type EventProperties = z.infer<typeof TelemetryEventSchema>['properties'];
