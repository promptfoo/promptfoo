import { z } from 'zod';
import { McpAuthInputSchema, McpAuthSchema } from './auth.js';

export const McpServerFieldsSchema = z.looseObject({
  path: z
    .string()
    .describe('Local MCP server script; the shared client supports .js and .py files')
    .optional(),
  command: z.string().describe('Command to launch a stdio MCP server').optional(),
  args: z.array(z.string()).optional().describe('Arguments passed to command; not used with path'),
  name: z.string().optional().describe('Optional server name used to identify its tools'),
  url: z
    .string()
    .describe('Remote MCP server URL; connection validates the effective URL')
    .optional(),
  auth: McpAuthInputSchema.optional().describe(
    'Authentication for remote servers; omitted means no configured auth',
  ),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Additional remote-server HTTP headers; generated auth headers take precedence'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('Environment variables for a stdio server process'),
});

export const McpServerInputSchema = z
  .union(
    [
      McpServerFieldsSchema.extend({
        command: McpServerFieldsSchema.shape.command.unwrap().min(1),
      }).strict(),
      McpServerFieldsSchema.extend({
        path: McpServerFieldsSchema.shape.path.unwrap().min(1),
      }).strict(),
      McpServerFieldsSchema.extend({
        url: McpServerFieldsSchema.shape.url.unwrap().min(1),
      }).strict(),
    ],
    { error: 'Either command or path or url must be specified for MCP server' },
  )
  .describe(
    'At least one connection field is required. The shared client prefers command, then path, then url; the Claude adapter prefers url, then command, then path',
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

export const McpConfigInputSchema = z.strictObject({
  enabled: z.boolean().optional().describe('Defaults to true when parsed for execution'),
  server: McpServerInputSchema.optional().describe(
    'Single server; the shared client uses servers instead when that array is present',
  ),
  servers: z
    .array(McpServerInputSchema)
    .optional()
    .describe(
      'Servers to connect to; an empty array is allowed. The Claude adapter also includes server',
    ),
  serverName: z.string().optional().describe('Server name supplied by mcp:<name> provider IDs'),
  defaultArgs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Arguments merged into every tool call; per-call arguments take precedence'),
  transformResponse: z
    .string()
    .optional()
    .describe(
      'Response transform expression or file:// module reference; evaluated only at runtime',
    ),
  responseParser: z.string().optional().meta({
    description: 'Deprecated alias for transformResponse',
    deprecated: true,
  }),
  timeout: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Request timeout in milliseconds; omitted uses MCP_REQUEST_TIMEOUT_MS then the SDK default of 60000 (60 seconds). Zero leaves the SDK timeout unchanged',
    ),
  resetTimeoutOnProgress: z
    .boolean()
    .optional()
    .describe('Reset the request timeout on progress notifications; defaults to false'),
  maxTotalTimeout: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Maximum request duration in milliseconds, including progress updates; zero or omitted adds no maximum',
    ),
  pingOnConnect: z
    .boolean()
    .optional()
    .describe('Ping the server after connecting; defaults to false'),
  tools: z
    .array(z.string())
    .optional()
    .describe(
      'Tool-name allowlist for the shared client; unsupported by the Claude Agent SDK adapter',
    ),
  exclude_tools: z
    .array(z.string())
    .optional()
    .describe(
      'Tool names to exclude; nonempty exclusions are unsupported by the Claude Agent SDK adapter',
    ),
  debug: z.boolean().optional().describe('Enable debug logging; falls back to MCP_DEBUG'),
  verbose: z.boolean().optional().describe('Enable verbose logging; falls back to MCP_VERBOSE'),
});

const McpResponseTransformSchema = z.union([
  z.string(),
  z.custom<Function>((value) => typeof value === 'function'),
]);

export const McpConfigSchema = McpConfigInputSchema.loose().extend({
  enabled: z.boolean().prefault(true),
  server: McpServerSchema.optional(),
  servers: z.array(McpServerSchema).optional(),
  transformResponse: McpResponseTransformSchema.optional(),
  responseParser: McpResponseTransformSchema.optional().meta({
    ...McpConfigInputSchema.shape.responseParser.meta(),
  }),
});

interface McpRequestOptions {
  /**
   * Request timeout in milliseconds for MCP operations.
   * Uses MCP_REQUEST_TIMEOUT_MS when omitted, then the SDK default of 60000 (60 seconds).
   * Zero leaves the SDK timeout unchanged.
   */
  timeout?: z.input<typeof McpConfigInputSchema>['timeout'];
  /**
   * Reset the request timeout when progress notifications arrive.
   * Useful for long-running operations that send periodic progress updates. Defaults to false.
   */
  resetTimeoutOnProgress?: z.input<typeof McpConfigInputSchema>['resetTimeoutOnProgress'];
  /**
   * Maximum total request duration in milliseconds, regardless of progress notifications.
   * Zero or omitted adds no maximum.
   */
  maxTotalTimeout?: z.input<typeof McpConfigInputSchema>['maxTotalTimeout'];
  /** Ping the MCP server after connecting to verify it is responsive. Defaults to false. */
  pingOnConnect?: z.input<typeof McpConfigInputSchema>['pingOnConnect'];
}

export type McpServerInput = z.input<typeof McpServerInputSchema>;
export type McpServerParsed = z.output<typeof McpServerSchema>;

export interface McpConfigInput extends McpRequestOptions, z.input<typeof McpConfigInputSchema> {
  /** @deprecated Use transformResponse instead. */
  responseParser?: z.input<typeof McpConfigInputSchema>['responseParser'];
}

export interface McpConfig extends McpRequestOptions, z.input<typeof McpConfigSchema> {
  /** @deprecated Use transformResponse instead. */
  responseParser?: z.input<typeof McpConfigSchema>['responseParser'];
}

export interface McpConfigParsed extends McpRequestOptions, z.output<typeof McpConfigSchema> {
  /** @deprecated Use transformResponse instead. */
  responseParser?: z.output<typeof McpConfigSchema>['responseParser'];
}

export const McpConfigInputJsonSchema = z.toJSONSchema(McpConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
});
