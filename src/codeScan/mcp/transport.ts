/**
 * Socket.io MCP Transport Bridge (CLI Side)
 *
 * Bridges MCP stdio communication with socket.io:
 * - Reads from MCP stdout → emits to socket
 * - Listens to socket → writes to MCP stdin
 */

import type { ChildProcess } from 'child_process';

import { type Socket } from 'socket.io-client';
import logger from '../../logger';
import { SocketIoMcpBridgeError } from '../../types/codeScan';

import type { JsonRpcMessage } from '../../types/codeScan';

// The hosted scanner may inspect the checkout, including files outside the diff.
const readOnlyTools = new Set([
  'directory_tree',
  'get_file_info',
  'list_allowed_directories',
  'list_directory',
  'list_directory_with_sizes',
  'read_file',
  'read_media_file',
  'read_multiple_files',
  'read_text_file',
  'search_files',
]);

const passthroughMethods = new Set(['ping', 'notifications/initialized', 'tools/list']);

function isReadOnlyTool(tool: unknown): boolean {
  return (
    typeof tool === 'object' &&
    tool !== null &&
    'name' in tool &&
    typeof tool.name === 'string' &&
    readOnlyTools.has(tool.name)
  );
}

/**
 * Wire ID mapping for tracking request/response correlation
 */
interface WireIdMapping {
  batchId: number;
  originalId: string | number;
  method: string;
}

/**
 * Bridge between MCP stdio and socket.io
 */
export class SocketIoMcpBridge {
  private readBuffer = '';
  private wireIdSeq = 0; // Sequence counter for unique wire IDs
  private wireIdMap = new Map<string, WireIdMapping>(); // Wire ID → original ID mapping

  constructor(
    private mcpProcess: ChildProcess,
    public socket: Socket,
    private sessionId: string,
  ) {}

  /**
   * Start bridging MCP stdio with the provided socket
   */
  async connect(): Promise<void> {
    if (!this.socket.connected) {
      throw new SocketIoMcpBridgeError('Socket must be connected before starting bridge');
    }

    logger.debug(`Using existing socket connection (id: ${this.socket.id})`);
    this.startBridging();
  }

  /**
   * Start bridging MCP stdio and socket.io
   */
  private startBridging(): void {
    if (!this.socket) {
      throw new SocketIoMcpBridgeError('Socket not initialized');
    }

    // Return the server's responses and notifications to the scanner.
    this.mcpProcess.stdout?.on('data', (chunk: Buffer) => {
      this.readBuffer += chunk.toString('utf8');

      // Process complete lines (JSON-RPC messages are newline-delimited)
      while (true) {
        const newlineIndex = this.readBuffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = this.readBuffer.slice(0, newlineIndex);
        this.readBuffer = this.readBuffer.slice(newlineIndex + 1);

        if (!line.trim()) {
          continue; // Skip empty lines
        }

        try {
          const message = JSON.parse(line);

          if ('method' in message) {
            if (message.id == null) {
              this.socket.emit('mcp:server-notification', {
                session_id: this.sessionId,
                batch_id: 0,
                message,
              });
            } else {
              // No optional client capabilities are negotiated. Answer a server ping locally.
              const reply =
                message.method === 'ping'
                  ? { result: {} }
                  : { error: { code: -32601, message: 'Unsupported client method' } };
              this.mcpProcess.stdin?.write(
                JSON.stringify({ jsonrpc: '2.0', id: message.id, ...reply }) + '\n',
              );
            }
            continue;
          }

          const wireId = String(message.id);
          const mapping = this.wireIdMap.get(wireId);
          if (!mapping) {
            continue;
          }
          this.wireIdMap.delete(wireId);
          if (mapping.method === 'initialize' && message.result?.capabilities) {
            // The hosted client can discover and call tools through this bridge.
            message.result.capabilities = message.result.capabilities.tools ? { tools: {} } : {};
          }
          if (mapping.method === 'tools/list' && Array.isArray(message.result?.tools)) {
            message.result.tools = message.result.tools.filter(isReadOnlyTool);
          }
          this.socket.emit('mcp:response', {
            session_id: this.sessionId,
            batch_id: mapping.batchId,
            message: { ...message, id: mapping.originalId },
          });
        } catch (_error) {
          logger.debug(`Failed to parse MCP output: ${line}`);
        }
      }
    });

    // Allow the scanner to control a read-only MCP client session.
    this.socket.on('mcp:request', (message: JsonRpcMessage) => {
      try {
        const { id, method, params, _batch_id } = message;
        if (
          message.jsonrpc !== '2.0' ||
          typeof method !== 'string' ||
          'error' in message ||
          'result' in message
        ) {
          return;
        }
        const batchId = typeof _batch_id === 'number' ? _batch_id : 0;
        const forwarded: JsonRpcMessage = { jsonrpc: '2.0', method, params };
        if (method === 'initialize') {
          // Client-provided roots must never replace the directory passed by the local launcher.
          forwarded.params = { ...(typeof params === 'object' ? params : {}), capabilities: {} };
        } else if (method === 'notifications/cancelled') {
          const translated = this.takeCancellationParams(batchId, params);
          if (!translated) {
            return;
          }
          forwarded.params = translated;
        } else if (
          !passthroughMethods.has(method) &&
          !(method === 'tools/call' && isReadOnlyTool(params))
        ) {
          if (id != null) {
            this.socket.emit('mcp:response', {
              session_id: this.sessionId,
              batch_id: batchId,
              message: {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: 'Unsupported read-only scan request' },
              },
            });
          }
          return;
        }
        if (id != null) {
          const wireId = `b${batchId}:${String(id)}:${++this.wireIdSeq}`;
          this.wireIdMap.set(wireId, { batchId, originalId: id, method });
          forwarded.id = wireId;
        }
        // Write JSON-RPC message to MCP stdin with newline
        const jsonLine = JSON.stringify(forwarded) + '\n';
        this.mcpProcess.stdin?.write(jsonLine);
      } catch (error) {
        logger.error(
          `Failed to write to MCP stdin: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    logger.debug('MCP ↔ Socket.io bridge active');
  }

  private takeCancellationParams(batchId: number, params: unknown) {
    if (params && typeof params === 'object' && 'requestId' in params) {
      for (const [wireId, mapping] of this.wireIdMap) {
        if (mapping.batchId === batchId && mapping.originalId === params.requestId) {
          // A cancelled request may never receive a response.
          this.wireIdMap.delete(wireId);
          return { ...params, requestId: wireId };
        }
      }
    }
    return undefined;
  }

  /**
   * Stop bridging (socket lifecycle managed externally)
   */
  async disconnect(): Promise<void> {
    logger.debug('Stopping MCP bridge...');

    // Clear wire ID map to prevent stale mappings
    this.wireIdMap.clear();
    this.wireIdSeq = 0;

    logger.debug('MCP bridge stopped');
  }

  /**
   * Get socket ID (if connected)
   */
  get socketId(): string | null {
    return this.socket?.id || null;
  }

  /**
   * Check if currently connected
   */
  get connected(): boolean {
    return this.socket?.connected === true;
  }
}
