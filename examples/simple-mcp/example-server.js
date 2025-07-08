#!/usr/bin/env node
/**
 * Simple MCP Server Example
 *
 * This is a basic MCP server that provides text generation tools.
 * You can run this server locally to test the MCP provider.
 *
 * Usage:
 *   node example-server.js
 *
 * Dependencies:
 *   npm install @modelcontextprotocol/sdk
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { exec } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

// Create MCP server
const server = new Server(
  {
    name: 'example-text-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define available tools
const tools = [
  {
    name: 'read_file',
    description: 'Read contents of a file from the local filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to read',
        },
        encoding: {
          type: 'string',
          description: 'File encoding',
          enum: ['utf8', 'base64', 'binary'],
          default: 'utf8',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write to',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
        mode: {
          type: 'string',
          description: 'Write mode',
          enum: ['write', 'append'],
          default: 'write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a system command',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments',
          default: [],
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 5000,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch content from a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch',
        },
        method: {
          type: 'string',
          description: 'HTTP method',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          default: 'GET',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers',
          default: {},
        },
        body: {
          type: 'string',
          description: 'Request body for POST/PUT requests',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'query_database',
    description: 'Execute a database query',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute',
        },
        database: {
          type: 'string',
          description: 'Database name',
          default: 'default',
        },
        params: {
          type: 'array',
          items: { type: 'string' },
          description: 'Query parameters',
          default: [],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'process_data',
    description: 'Process and transform data',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'Data to process (JSON string or plain text)',
        },
        operation: {
          type: 'string',
          description: 'Operation to perform',
          enum: ['validate', 'transform', 'extract'],
        },
        format: {
          type: 'string',
          description: 'Expected data format',
          enum: ['json', 'xml', 'csv', 'text'],
          default: 'text',
        },
      },
      required: ['data', 'operation'],
    },
  },
  {
    name: 'get_system_info',
    description: 'Get system information',
    inputSchema: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          description: 'Type of system information',
          enum: ['cpu', 'memory', 'disk', 'network', 'processes', 'environment'],
        },
        detailed: {
          type: 'boolean',
          description: 'Return detailed information',
          default: false,
        },
      },
      required: ['info_type'],
    },
  },
];

const execAsync = promisify(exec);

// File operations
function readFile(path, encoding = 'utf8') {
  // Security check - prevent path traversal
  if (path.includes('..') || path.includes('~')) {
    throw new Error('Invalid path: Path traversal not allowed');
  }

  // Simulate reading restricted files
  if (path.includes('/etc/passwd') || path.includes('/etc/shadow')) {
    throw new Error('Permission denied: Cannot read system files');
  }

  try {
    if (encoding === 'base64') {
      return fs.readFileSync(path).toString('base64');
    }
    return fs.readFileSync(path, encoding);
  } catch (error) {
    throw new Error(`File read error: ${error.message}`);
  }
}

function writeFile(path, content, mode = 'write') {
  // Security check - prevent writing to system directories
  if (path.startsWith('/etc/') || path.startsWith('/sys/') || path.startsWith('/proc/')) {
    throw new Error('Permission denied: Cannot write to system directories');
  }

  try {
    if (mode === 'append') {
      fs.appendFileSync(path, content);
    } else {
      fs.writeFileSync(path, content);
    }
    return `Successfully ${mode === 'append' ? 'appended to' : 'wrote'} file: ${path}`;
  } catch (error) {
    throw new Error(`File write error: ${error.message}`);
  }
}

// Command execution
async function executeCommand(command, args = [], timeout = 5000) {
  // Security check - block dangerous commands
  const blockedCommands = ['rm', 'del', 'format', 'sudo', 'su', 'chmod', 'chown'];
  if (blockedCommands.some((cmd) => command.toLowerCase().includes(cmd))) {
    throw new Error('Security violation: Dangerous command blocked');
  }

  try {
    const fullCommand = `${command} ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(fullCommand, { timeout });
    return stdout || stderr;
  } catch (error) {
    if (error.killed) {
      throw new Error(`Command timed out after ${timeout}ms`);
    }
    throw new Error(`Command execution failed: ${error.message}`);
  }
}

// URL fetching
async function fetchUrl(url, method = 'GET', headers = {}, body = null) {
  // Security check - prevent SSRF to internal networks
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.')) {
    throw new Error('Security violation: Internal network access blocked');
  }

  try {
    // Simulate HTTP request
    return `Mock response from ${method} ${url} with headers: ${JSON.stringify(headers)}`;
  } catch (error) {
    throw new Error(`HTTP request failed: ${error.message}`);
  }
}

// Database operations
function queryDatabase(query, database = 'default', params = []) {
  // Security check - prevent SQL injection patterns
  const dangerousPatterns = ['DROP', 'DELETE', 'UPDATE', 'INSERT', '--', ';'];
  if (dangerousPatterns.some((pattern) => query.toUpperCase().includes(pattern))) {
    throw new Error('Security violation: Potentially dangerous SQL query blocked');
  }

  // Simulate database query
  return `Mock query result for: ${query} on database: ${database} with params: ${JSON.stringify(params)}`;
}

// Data processing
function processData(data, operation, format = 'text') {
  try {
    switch (operation) {
      case 'validate':
        if (format === 'json') {
          JSON.parse(data);
          return 'Valid JSON data';
        }
        return 'Data validation completed';

      case 'transform':
        return `Transformed data: ${data.substring(0, 50)}...`;

      case 'extract':
        return `Extracted fields from ${format} data`;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    throw new Error(`Data processing failed: ${error.message}`);
  }
}

// System information
function getSystemInfo(infoType, detailed = false) {
  const info = {
    cpu: detailed ? 'CPU: Intel i7-9700K @ 3.60GHz, 8 cores' : 'CPU: Intel i7',
    memory: detailed ? 'Memory: 16GB DDR4, 8GB available' : 'Memory: 16GB',
    disk: detailed ? 'Disk: 500GB SSD, 200GB free' : 'Disk: 500GB',
    network: detailed ? 'Network: Ethernet connected, WiFi available' : 'Network: Connected',
    processes: detailed ? 'Processes: 156 running, top: chrome (15%), node (8%)' : 'Processes: 156',
    environment: detailed ? 'Environment: Production, Node.js v18.17.0' : 'Environment: Production',
  };

  return info[infoType] || 'Unknown system information type';
}

// Handle tool listing
server.setRequestHandler('tools/list', async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'read_file':
        result = readFile(args.path, args.encoding);
        break;

      case 'write_file':
        result = writeFile(args.path, args.content, args.mode);
        break;

      case 'execute_command':
        result = await executeCommand(args.command, args.args, args.timeout);
        break;

      case 'fetch_url':
        result = await fetchUrl(args.url, args.method, args.headers, args.body);
        break;

      case 'query_database':
        result = queryDatabase(args.query, args.database, args.params);
        break;

      case 'process_data':
        result = processData(args.data, args.operation, args.format);
        break;

      case 'get_system_info':
        result = getSystemInfo(args.info_type, args.detailed);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: String(result),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Example MCP Server running...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
