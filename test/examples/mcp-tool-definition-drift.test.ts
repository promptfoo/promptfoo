import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

type Baseline = { tools: ToolDefinition[] };

const repositoryRoot = path.resolve(__dirname, '../..');
const exampleRoot = path.join(repositoryRoot, 'examples/mcp-tool-definition-drift');
const scratchRoot = path.join(repositoryRoot, 'scratch/mcp-tool-definition-drift-tests');
const temporaryDirectories: string[] = [];

function createFixture() {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratchRoot, 'case with spaces-'));
  temporaryDirectories.push(directory);
  for (const name of ['check-tools.js', 'server.js', 'baseline.json', 'package.json']) {
    fs.copyFileSync(path.join(exampleRoot, name), path.join(directory, name));
  }
  return directory;
}

function baseline(directory: string): Baseline {
  return JSON.parse(fs.readFileSync(path.join(directory, 'baseline.json'), 'utf8'));
}

function writeBaseline(directory: string, value: Baseline) {
  fs.writeFileSync(path.join(directory, 'baseline.json'), JSON.stringify(value));
}

// These fixtures speak MCP over stdio; the checker still connects through the real SDK.
function writeServer(directory: string, handler: string) {
  fs.writeFileSync(
    path.join(directory, 'server.js'),
    `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const server = new Server({ name: 'drift-test', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => { ${handler} });
await server.connect(new StdioServerTransport());
`,
  );
}

function serveTools(directory: string, tools: ToolDefinition[]) {
  writeServer(directory, `return ${JSON.stringify({ tools })};`);
}

function runCheck(directory: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [path.join(directory, 'check-tools.js'), ...args], {
    // The files must be resolved beside the checker, independently of the caller's cwd.
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 15000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

function expectError(directory: string, args: string[] = []) {
  const result = runCheck(directory, args);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('CHECK_ERROR:');
  expect(result.stdout).not.toContain('DRIFT_DETECTED:');
  expect(fs.existsSync(path.join(directory, 'candidate.json'))).toBe(false);
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reverseObjectKeys(entry)]),
    );
  }
  return value;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const relative = path.relative(scratchRoot, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
      throw new Error(`Refusing to remove a directory outside the fixture root: ${directory}`);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('MCP tool definition drift example', () => {
  it('checks the shipped MCP server without modifying the baseline or creating a candidate', () => {
    const directory = createFixture();
    const before = fs.readFileSync(path.join(directory, 'baseline.json'), 'utf8');

    const result = runCheck(directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNCHANGED:');
    expect(fs.readFileSync(path.join(directory, 'baseline.json'), 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(directory, 'candidate.json'))).toBe(false);
  });

  it.each<[string, (tool: ToolDefinition) => ToolDefinition]>([
    ['description', (tool) => ({ ...tool, description: 'Forecast weather for a city.' })],
    ['name', (tool) => ({ ...tool, name: 'weather_forecast' })],
    [
      'required parameters',
      (tool) => ({
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...(tool.inputSchema.properties as Record<string, unknown>),
            units: { type: 'string' },
          },
          required: [...(tool.inputSchema.required as string[]), 'units'],
        },
      }),
    ],
  ])('detects a change to %s', (field, change) => {
    const directory = createFixture();
    const before = fs.readFileSync(path.join(directory, 'baseline.json'), 'utf8');
    serveTools(directory, baseline(directory).tools.map(change));

    const result = runCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DRIFT_DETECTED:');
    if (field === 'name') {
      expect(result.stdout).toContain('Removed tool "get_weather"');
      expect(result.stdout).toContain('Added tool "weather_forecast"');
    } else {
      expect(result.stdout).toContain(
        `${field === 'description' ? 'description' : 'inputSchema'} changed`,
      );
    }
    expect(fs.readFileSync(path.join(directory, 'baseline.json'), 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(directory, 'candidate.json'))).toBe(false);
  });

  it('ignores JSON object key order and tools/list order', () => {
    const directory = createFixture();
    const original = baseline(directory).tools[0];
    const tools = [original, { ...original, name: 'another_weather_tool' }];
    writeBaseline(directory, { tools });
    serveTools(directory, reverseObjectKeys([...tools].reverse()) as ToolDefinition[]);

    const result = runCheck(directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNCHANGED:');
  });

  it('preserves array order inside an input schema', () => {
    const directory = createFixture();
    const tool = baseline(directory).tools[0];
    tool.inputSchema.properties = { city: { type: 'string', enum: ['Paris', 'Tokyo'] } };
    writeBaseline(directory, { tools: [tool] });
    tool.inputSchema.properties = { city: { type: 'string', enum: ['Tokyo', 'Paris'] } };
    serveTools(directory, [tool]);

    const result = runCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DRIFT_DETECTED:');
    expect(result.stdout).toContain('inputSchema changed');
  });

  it('distinguishes a missing description from an empty description', () => {
    const directory = createFixture();
    const tool = baseline(directory).tools[0];
    delete tool.description;
    writeBaseline(directory, { tools: [tool] });
    serveTools(directory, [{ ...tool, description: '' }]);

    const result = runCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('description changed');
    expect(result.stdout).toContain('(absent)');
  });

  it('reports an empty tools list as drift rather than a connection error', () => {
    const directory = createFixture();
    serveTools(directory, []);

    const result = runCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Removed tool "get_weather"');
    expect(result.stderr).not.toContain('CHECK_ERROR:');
  });

  it.each(['missing', 'invalid JSON', 'unexpected field', 'invalid tools array'] as const)(
    'reports a %s baseline as a check error',
    (problem) => {
      const directory = createFixture();
      const filename = path.join(directory, 'baseline.json');
      if (problem === 'missing') {
        fs.unlinkSync(filename);
      } else {
        const content = {
          'invalid JSON': '{',
          'unexpected field': JSON.stringify({ ...baseline(directory), timestamp: 'untrusted' }),
          'invalid tools array': '{"tools":null}',
        }[problem];
        fs.writeFileSync(filename, content);
      }

      expectError(directory);
    },
  );

  it.each(['duplicate names', 'malformed tool', 'pagination', 'empty pagination cursor'] as const)(
    'rejects %s and leaves no partial snapshot',
    (problem) => {
      const directory = createFixture();
      const tool = baseline(directory).tools[0];
      const result = {
        'duplicate names': { tools: [tool, tool] },
        'malformed tool': { tools: [{ ...tool, inputSchema: { type: 'string' } }] },
        pagination: { tools: [tool], nextCursor: 'next-page' },
        'empty pagination cursor': { tools: [tool], nextCursor: '' },
      }[problem];
      writeServer(directory, `return ${JSON.stringify(result)};`);

      expectError(directory);
      expectError(directory, ['--snapshot']);
    },
  );

  it('reports an early server exit as a connection error', () => {
    const directory = createFixture();
    fs.writeFileSync(path.join(directory, 'server.js'), 'process.exit(7);\n');

    expectError(directory, ['--snapshot']);
  });

  it('times out a tools/list request without leaving a candidate', () => {
    const directory = createFixture();
    writeServer(directory, 'return await new Promise(() => {});');

    expectError(directory, ['--snapshot']);
  });

  it('requires manual acceptance before a snapshot changes the check result', () => {
    const directory = createFixture();
    const baselinePath = path.join(directory, 'baseline.json');
    const candidatePath = path.join(directory, 'candidate.json');
    const before = fs.readFileSync(baselinePath, 'utf8');
    const tool = { ...baseline(directory).tools[0], description: 'Updated tool description.' };
    serveTools(directory, [tool]);

    const snapshot = runCheck(directory, ['--snapshot']);

    expect(snapshot.status).toBe(0);
    expect(snapshot.stdout).toContain('Wrote candidate.json');
    expect(fs.readFileSync(baselinePath, 'utf8')).toBe(before);
    expect(JSON.parse(fs.readFileSync(candidatePath, 'utf8'))).toEqual({ tools: [tool] });
    expect(runCheck(directory).status).toBe(1);

    fs.copyFileSync(candidatePath, baselinePath);
    expect(runCheck(directory).status).toBe(0);
  });

  it('creates a snapshot without a baseline and refuses to overwrite an existing candidate', () => {
    const directory = createFixture();
    const candidatePath = path.join(directory, 'candidate.json');
    fs.unlinkSync(path.join(directory, 'baseline.json'));

    expect(runCheck(directory, ['--snapshot']).status).toBe(0);
    const before = fs.readFileSync(candidatePath, 'utf8');
    const second = runCheck(directory, ['--snapshot']);

    expect(second.status).toBe(2);
    expect(second.stderr).toContain('CHECK_ERROR:');
    expect(fs.readFileSync(candidatePath, 'utf8')).toBe(before);
  });

  it('rejects unsupported options instead of changing its fixed server or baseline', () => {
    const directory = createFixture();

    expectError(directory, ['--baseline', 'other.json']);
  });
});
