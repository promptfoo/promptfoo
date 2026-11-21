// Minimal stand-alone ACP peer. It deliberately splits assistant output into chunks
// and interleaves an unrelated session and a permission request.
import { randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const sessionId = randomUUID();
let mode;
let model;
let authMethod;
let pending;
const send = (message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
function update(update, target = sessionId) {
  send({ method: 'session/update', params: { sessionId: target, update } });
}
function textChunk(text) {
  return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } };
}
for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params, result } = JSON.parse(line);
  switch (method) {
    case 'initialize':
      if (params.clientCapabilities.terminal || params.clientCapabilities.fs?.writeTextFile) {
        throw new Error('Unexpected client capabilities');
      }
      send({
        id,
        result: {
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: [{ id: 'cursor_login', name: 'Cursor' }],
        },
      });
      break;
    case 'authenticate':
      authMethod = params.methodId;
      send({ id, result: {} });
      break;
    case 'session/new':
      if (realpathSync(params.cwd) !== realpathSync(process.cwd()) || params.mcpServers.length) {
        throw new Error('Unexpected workspace or MCP servers');
      }
      send({
        id,
        result: {
          sessionId,
          configOptions: [
            {
              id: 'llm',
              name: 'Model',
              type: 'select',
              category: 'model',
              currentValue: 'one',
              options: [{ value: 'one', name: 'One' }],
            },
          ],
        },
      });
      break;
    case 'session/set_config_option':
      model = params.value;
      send({ id, result: { configOptions: [] } });
      break;
    case 'session/set_mode':
      mode = params.modeId;
      send({ id, result: {} });
      break;
    case 'session/prompt': {
      const prompt = params.prompt[0].text;
      if (prompt === 'wait-for-shutdown') {
        writeFileSync('ready', sessionId);
        break;
      }
      if (prompt === 'hang') {
        break;
      }
      if (prompt === 'fail') {
        send({ id, error: { code: -32603, message: 'Example agent error' } });
        break;
      }
      if (prompt === 'signed-out') {
        send({ id, error: { code: -32000, message: 'Authentication required' } });
        break;
      }
      if (prompt === 'exit') {
        process.exit(3);
      }
      if (prompt === 'empty' || prompt === 'cancelled') {
        send({ id, result: { stopReason: prompt === 'empty' ? 'end_turn' : 'cancelled' } });
        break;
      }
      update(textChunk('other session'), 'different');
      update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'private' } });
      update({ sessionUpdate: 'tool_call', toolCallId: 'read', title: 'Read' });
      update(
        textChunk(
          prompt === 'inspect'
            ? JSON.stringify({
                pid: process.pid,
                cwd: process.cwd(),
                gitDir: process.env.GIT_DIR,
                args: process.argv.slice(2),
                mode,
                model,
                authMethod,
                cursorKeyPresent: Boolean(process.env.CURSOR_API_KEY),
                unrelatedKeyPresent: Boolean(process.env.OPENAI_API_KEY),
              })
            : prompt,
        ),
      );
      pending = id;
      send({
        id: 'permission',
        method: 'session/request_permission',
        params: {
          sessionId,
          toolCall: { toolCallId: 'read' },
          options: [
            { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
            { optionId: 'no', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
      break;
    }
    default:
      if (id === 'permission' && result?.outcome?.optionId === 'no') {
        update(textChunk('\n'));
        send({ id: pending, result: { stopReason: 'end_turn' } });
      } else if (method && id !== undefined) {
        send({ id, error: { code: -32601, message: 'Unsupported method' } });
      }
  }
}
