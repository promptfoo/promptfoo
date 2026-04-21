#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

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
 *   npm install @modelcontextprotocol/sdk zod
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Create MCP server
const server = new McpServer({
  name: 'example-text-server',
  version: '1.0.0',
});

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
    environment: detailed ? 'Environment: Production, Node.js v20.0.0' : 'Environment: Production',
  };

  return info[infoType] || 'Unknown system information type';
}

// Register tools with the MCP server
server.registerTool(
  'read_file',
  {
    title: 'Read File',
    description: 'Read contents of a file from the local filesystem',
    inputSchema: {
      path: z.string().describe('File path to read'),
      encoding: z.enum(['utf8', 'base64', 'binary']).prefault('utf8').describe('File encoding'),
    },
  },
  async (args) => {
    try {
      const result = readFile(args.path, args.encoding);
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
  },
);

server.registerTool(
  'write_file',
  {
    title: 'Write File',
    description: 'Write content to a file on the local filesystem',
    inputSchema: {
      path: z.string().describe('File path to write to'),
      content: z.string().describe('Content to write to the file'),
      mode: z.enum(['write', 'append']).prefault('write').describe('Write mode'),
    },
  },
  async (args) => {
    try {
      const result = writeFile(args.path, args.content, args.mode);
      return {
        content: [
          {
            type: 'text',
            text: result,
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
  },
);

server.registerTool(
  'execute_command',
  {
    title: 'Execute Command',
    description: 'Execute a system command',
    inputSchema: {
      command: z.string().describe('Command to execute'),
      args: z.array(z.string()).prefault([]).describe('Command arguments'),
      timeout: z.number().prefault(5000).describe('Timeout in milliseconds'),
    },
  },
  async (args) => {
    try {
      const result = await executeCommand(args.command, args.args, args.timeout);
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
  },
);

server.registerTool(
  'fetch_url',
  {
    title: 'Fetch URL',
    description: 'Fetch content from a URL',
    inputSchema: {
      url: z.string().describe('URL to fetch'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).prefault('GET').describe('HTTP method'),
      headers: z.record(z.string(), z.string()).prefault({}).describe('HTTP headers'),
      body: z.string().optional().describe('Request body for POST/PUT requests'),
    },
  },
  async (args) => {
    try {
      const result = await fetchUrl(args.url, args.method, args.headers, args.body);
      return {
        content: [
          {
            type: 'text',
            text: result,
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
  },
);

server.registerTool(
  'query_database',
  {
    title: 'Query Database',
    description: 'Execute a database query',
    inputSchema: {
      query: z.string().describe('SQL query to execute'),
      database: z.string().prefault('default').describe('Database name'),
      params: z.array(z.string()).prefault([]).describe('Query parameters'),
    },
  },
  async (args) => {
    try {
      const result = queryDatabase(args.query, args.database, args.params);
      return {
        content: [
          {
            type: 'text',
            text: result,
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
  },
);

server.registerTool(
  'process_data',
  {
    title: 'Process Data',
    description: 'Process and transform data',
    inputSchema: {
      data: z.string().describe('Data to process (JSON string or plain text)'),
      operation: z.enum(['validate', 'transform', 'extract']).describe('Operation to perform'),
      format: z
        .enum(['json', 'xml', 'csv', 'text'])
        .prefault('text')
        .describe('Expected data format'),
    },
  },
  async (args) => {
    try {
      const result = processData(args.data, args.operation, args.format);
      return {
        content: [
          {
            type: 'text',
            text: result,
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
  },
);

server.registerTool(
  'get_system_info',
  {
    title: 'Get System Info',
    description: 'Get system information',
    inputSchema: {
      info_type: z
        .enum(['cpu', 'memory', 'disk', 'network', 'processes', 'environment'])
        .describe('Type of system information'),
      detailed: z.boolean().prefault(false).describe('Return detailed information'),
    },
  },
  async (args) => {
    try {
      const result = getSystemInfo(args.info_type, args.detailed);
      return {
        content: [
          {
            type: 'text',
            text: result,
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
  },
);

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
