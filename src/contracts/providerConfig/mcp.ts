import { z } from 'zod';
import { McpAuthInputSchema, McpAuthSchema } from './auth.js';

export const McpServerFieldsSchema = z.looseObject({
  path: z
    .string()
    .optional()
    .describe('Local MCP server script; the shared client supports .js and .py files'),
  command: z.string().optional().describe('Command to launch a stdio MCP server'),
  args: z.array(z.string()).optional(),
  name: z.string().optional(),
  url: z
    .string()
    .optional()
    .describe('Remote MCP server URL; connection validates the effective URL'),
  auth: McpAuthInputSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const McpServerInputSchema = z.union(
  [
    McpServerFieldsSchema.extend({ command: z.string().min(1) }),
    McpServerFieldsSchema.extend({ path: z.string().min(1) }),
    McpServerFieldsSchema.extend({ url: z.string().min(1) }),
  ],
  { error: 'Either command or path or url must be specified for MCP server' },
);

const McpServerRuntimeFieldsSchema = McpServerFieldsSchema.extend({
  auth: McpAuthSchema.optional(),
});

export const McpServerSchema = z.union(
  [
    McpServerRuntimeFieldsSchema.extend({ command: z.string().min(1) }),
    McpServerRuntimeFieldsSchema.extend({ path: z.string().min(1) }),
    McpServerRuntimeFieldsSchema.extend({ url: z.string().min(1) }),
  ],
  { error: 'Either command or path or url must be specified for MCP server' },
);

export const McpConfigInputSchema = z.looseObject({
  enabled: z.boolean().optional().describe('Defaults to true when parsed for execution'),
  server: McpServerInputSchema.optional(),
  servers: z.array(McpServerInputSchema).optional(),
  serverName: z.string().optional(),
  transformResponse: z.string().optional(),
  responseParser: z.string().optional().describe('Deprecated alias for transformResponse'),
  timeout: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Request timeout in milliseconds; falls back to MCP_REQUEST_TIMEOUT_MS and the SDK default',
    ),
  resetTimeoutOnProgress: z.boolean().optional(),
  maxTotalTimeout: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum request duration in milliseconds, including progress updates'),
  pingOnConnect: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  exclude_tools: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

const McpResponseTransformSchema = z.union([
  z.string(),
  z.custom<Function>((value) => typeof value === 'function'),
]);

export const McpConfigSchema = McpConfigInputSchema.extend({
  enabled: z.boolean().prefault(true),
  server: McpServerSchema.optional(),
  servers: z.array(McpServerSchema).optional(),
  transformResponse: McpResponseTransformSchema.optional(),
  responseParser: McpResponseTransformSchema.optional(),
});

export type McpServerInput = z.input<typeof McpServerInputSchema>;
export type McpServerParsed = z.output<typeof McpServerSchema>;
export type McpConfigInput = z.input<typeof McpConfigInputSchema>;
export type McpConfig = z.input<typeof McpConfigSchema>;
export type McpConfigParsed = z.output<typeof McpConfigSchema>;

export const McpConfigInputJsonSchema = z.toJSONSchema(McpConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
