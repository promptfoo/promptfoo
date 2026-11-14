import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { type ListToolsResult, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

const MAX_TOOL_PAGES = 100;
const MAX_TOOLS = 10_000;
const MAX_TOOL_BYTES = 16 * 1024 * 1024;

export class PaginatedMcpClient extends Client {
  // The SDK replaces its tool validators and task requirements on each listTools() call.
  // Return all pages from one request so it installs metadata for the entire server.
  override request: Client['request'] = async (request, schema, options) => {
    if (
      request.method !== 'tools/list' ||
      request.params?.cursor !== undefined ||
      !Object.is(schema, ListToolsResultSchema)
    ) {
      return super.request(request, schema, options);
    }

    // Each SDK request starts a fresh timer. Apply the absolute deadline to the
    // entire listing, including the first page. Progress may extend the normal
    // timeout when the caller has not configured an absolute maximum.
    const budget =
      options?.maxTotalTimeout ??
      (options?.resetTimeoutOnProgress
        ? undefined
        : (options?.timeout ?? DEFAULT_REQUEST_TIMEOUT_MSEC));
    const deadline = new AbortController();
    const timer =
      budget === undefined
        ? undefined
        : setTimeout(
            () => deadline.abort(new Error('MCP tools/list exceeded its request timeout')),
            budget,
          );
    const signal = options?.signal
      ? AbortSignal.any([options.signal, deadline.signal])
      : deadline.signal;
    const pageOptions = { ...options, signal };
    try {
      const result = await super.request(request, schema, pageOptions);
      const first = result as ListToolsResult;
      if (first.nextCursor === undefined) {
        return result;
      }

      const tools: ListToolsResult['tools'] = [];
      const cursors = new Set<string>();
      let bytes = 0;
      let page = first;
      for (;;) {
        if (tools.length + page.tools.length > MAX_TOOLS) {
          throw new Error(`MCP tools/list exceeds the limit of ${MAX_TOOLS} tools`);
        }
        bytes +=
          Buffer.byteLength(JSON.stringify(page.tools)) + Buffer.byteLength(page.nextCursor ?? '');
        if (bytes > MAX_TOOL_BYTES) {
          throw new Error(`MCP tools/list exceeds the limit of ${MAX_TOOL_BYTES} bytes`);
        }
        for (const tool of page.tools) {
          tools.push(tool);
        }
        const cursor = page.nextCursor;
        if (cursor === undefined) {
          break;
        }
        if (cursors.has(cursor)) {
          throw new Error('MCP server returned a repeated tools/list pagination cursor');
        }
        if (cursors.size >= MAX_TOOL_PAGES - 1) {
          throw new Error(`MCP tools/list exceeds the limit of ${MAX_TOOL_PAGES} pages`);
        }
        cursors.add(cursor);
        signal.throwIfAborted();
        page = await super.request(
          { method: 'tools/list', params: { ...request.params, cursor } },
          ListToolsResultSchema,
          pageOptions,
        );
      }
      first.tools = tools;
      delete first.nextCursor;
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
}
