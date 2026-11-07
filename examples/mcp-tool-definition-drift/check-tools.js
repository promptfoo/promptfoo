import { open, readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';

const baselinePath = new URL('./baseline.json', import.meta.url);
const candidatePath = new URL('./candidate.json', import.meta.url);
const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
const fields = ['name', 'description', 'inputSchema'];

// Normalize JSON object keys only. Array order and string contents are preserved.
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function selectTools(tools) {
  if (!Array.isArray(tools)) {
    throw new Error('Expected a tools array');
  }
  const names = new Set();
  return tools
    .map((tool) => {
      ToolSchema.parse(tool);
      if (!tool.name || names.has(tool.name)) {
        throw new Error(`Empty or duplicate tool name: ${JSON.stringify(tool.name)}`);
      }
      names.add(tool.name);
      return canonical(
        Object.fromEntries(
          fields.filter((field) => Object.hasOwn(tool, field)).map((field) => [field, tool[field]]),
        ),
      );
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

async function discover() {
  const client = new Client({ name: 'tool-definition-precheck', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
  try {
    await client.connect(transport, { timeout: 5000 });
    const result = await client.listTools(undefined, { timeout: 5000 });
    if (Object.hasOwn(result, 'nextCursor')) {
      throw new Error('This example supports a single tools/list page; nextCursor is unsupported');
    }
    return { tools: selectTools(result.tools) };
  } finally {
    try {
      await client.close();
    } finally {
      await transport.close();
    }
  }
}

async function readBaseline() {
  const data = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (
    !data ||
    Array.isArray(data) ||
    Object.keys(data).join() !== 'tools' ||
    !Array.isArray(data.tools)
  ) {
    throw new Error('Baseline must contain only a tools array');
  }
  if (data.tools.some((tool) => !tool || Object.keys(tool).some((key) => !fields.includes(key)))) {
    throw new Error('Baseline tools must contain only name, description, and inputSchema');
  }
  return { tools: selectTools(data.tools) };
}

function showChanges(before, after) {
  const previous = new Map(before.tools.map((tool) => [tool.name, tool]));
  const current = new Map(after.tools.map((tool) => [tool.name, tool]));
  for (const [name, tool] of previous) {
    if (!current.has(name)) {
      console.log(`Removed tool ${JSON.stringify(name)}: ${JSON.stringify(tool, null, 2)}`);
    }
  }
  for (const [name, tool] of current) {
    const oldTool = previous.get(name);
    if (!oldTool) {
      console.log(`Added tool ${JSON.stringify(name)}: ${JSON.stringify(tool, null, 2)}`);
      continue;
    }
    for (const field of fields) {
      if (JSON.stringify(oldTool[field]) !== JSON.stringify(tool[field])) {
        console.log(`${JSON.stringify(name)}.${field} changed`);
        console.log(`Before: ${JSON.stringify(oldTool[field], null, 2) ?? '(absent)'}`);
        console.log(`After:  ${JSON.stringify(tool[field], null, 2) ?? '(absent)'}`);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--snapshot')) {
    throw new Error('Usage: node check-tools.js [--snapshot]');
  }
  if (args[0] === '--snapshot') {
    const snapshot = await discover();
    // Exclusive creation protects an existing candidate, including a previously reviewed one.
    const file = await open(candidatePath, 'wx');
    try {
      await file.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    } catch (error) {
      await file.close();
      await unlink(candidatePath);
      throw error;
    } finally {
      await file.close();
    }
    console.log('Wrote candidate.json. Review it before manually replacing baseline.json.');
    return 0;
  }

  const baseline = await readBaseline();
  const current = await discover();
  if (JSON.stringify(baseline) === JSON.stringify(current)) {
    console.log('UNCHANGED: selected MCP tool definition fields match baseline.json');
    return 0;
  }
  console.log('DRIFT_DETECTED: review the definition changes before starting the eval.');
  showChanges(baseline, current);
  return 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`CHECK_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
