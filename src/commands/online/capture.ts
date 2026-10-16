// Keep capture independent of the evaluator, logger, database, dotenv and project config.
// Agent hooks must only persist data, never execute code from the agent's working directory.
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { Command } from 'commander';
import { z } from 'zod';
import {
  AgentSchema,
  digest,
  enqueue,
  MAX_EVENT_BYTES,
  onlineDirectory,
  prepareDirectory,
  readJson,
  TurnSchema,
  writeJson,
} from './store';

import type { Agent } from './store';

const identifier = z.string().min(1).max(512);
const HookSchema = z.object({
  hook_event_name: z.enum(['UserPromptSubmit', 'Stop']),
  session_id: identifier,
  turn_id: identifier.optional(),
  prompt: z.unknown().optional(),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().max(250_000).nullable().optional(),
});
const PromptSchema = z.object({
  sessionId: identifier,
  turnId: identifier,
  input: z.string().min(1).max(250_000),
  completedOutput: z.string().optional(),
});
const NotifySchema = z.object({
  type: z.literal('agent-turn-complete'),
  'thread-id': identifier,
  'turn-id': identifier,
  'input-messages': z.array(z.string()).min(1),
  'last-assistant-message': z.string().max(250_000),
});

export async function captureEvent(
  directory: string,
  agent: Agent,
  payload: unknown,
): Promise<string | undefined> {
  const capturedAt = new Date().toISOString();
  if (agent === 'generic') {
    const turn = TurnSchema.parse({ ...(payload as object), agent, version: 1, capturedAt });
    return enqueue(directory, turn);
  }
  if (agent === 'codex' && NotifySchema.safeParse(payload).success) {
    const event = NotifySchema.parse(payload);
    return enqueue(directory, {
      version: 1,
      agent,
      sessionId: event['thread-id'],
      turnId: event['turn-id'],
      input: event['input-messages'].join('\n\n'),
      output: event['last-assistant-message'],
      capturedAt,
    });
  }
  const event = HookSchema.parse(payload);
  await prepareDirectory(directory);
  const prompts = path.join(directory, 'prompts');
  await prepareDirectory(prompts);
  // Codex exposes a turn id. Claude Code relies on synchronous hooks in one session.
  // Hash identifiers so no input can become a path or escape the data directory.
  const promptPath = path.join(
    prompts,
    `${digest([agent, event.session_id, event.turn_id ?? 'current'])}.json`,
  );
  if (event.hook_event_name === 'UserPromptSubmit') {
    // An invalid new prompt must not leave the previous turn available for pairing.
    await fs.unlink(promptPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
    const input = PromptSchema.parse({
      sessionId: event.session_id,
      turnId: event.turn_id ?? randomUUID(),
      input: event.prompt,
    });
    await writeJson(promptPath, input, true);
    return undefined;
  }
  if (event.last_assistant_message == null) {
    throw new Error('Stop hook did not include a final assistant message');
  }
  // Fail rather than grade an output against an invented or unrelated prompt.
  const prompt = PromptSchema.parse(await readJson(promptPath));
  if (prompt.sessionId !== event.session_id) {
    throw new Error('Hook session does not match captured prompt');
  }
  if (
    agent === 'claude-code' &&
    prompt.completedOutput &&
    prompt.completedOutput !== digest(event.last_assistant_message) &&
    !event.stop_hook_active
  ) {
    throw new Error('No new user prompt was captured for this reply');
  }
  const id = await enqueue(directory, {
    version: 1,
    agent,
    sessionId: prompt.sessionId,
    turnId: prompt.turnId,
    input: prompt.input,
    output: event.last_assistant_message,
    capturedAt,
  });
  await writeJson(
    promptPath,
    { ...prompt, completedOutput: digest(event.last_assistant_message) },
    true,
  );
  return id;
}

async function readInput(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('Expected a JSON hook event on stdin');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => process.stdin.destroy(new Error('Hook input timed out')), 5000);
  try {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_EVENT_BYTES) {
        throw new Error('Hook input exceeds size limit');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

export function configureCapture(command: Command): Command {
  return command
    .description(
      'Capture an Agent hook event without running a model or loading project configuration',
    )
    .requiredOption('--agent <name>', 'claude-code, codex, or generic')
    .option('--dir <path>', 'Private local queue directory', onlineDirectory())
    .argument('[payload]', 'Codex notify JSON argument; other hooks read stdin');
}

export async function runCapture(argv: string[]): Promise<void> {
  const command = configureCapture(new Command('promptfoo online capture')).exitOverride();
  // stdout belongs to the hook protocol, including on errors. Never echo payloads.
  command.configureOutput({ writeErr: () => {} });
  try {
    command.parse(argv, { from: 'user' });
    const options = command.opts<{ agent: string; dir: string }>();
    const input = command.args[0] ?? (await readInput());
    if (Buffer.byteLength(input) > MAX_EVENT_BYTES) {
      throw new Error('Hook input exceeds size limit');
    }
    await captureEvent(
      path.resolve(options.dir),
      AgentSchema.parse(options.agent),
      JSON.parse(input),
    );
  } catch (error) {
    if ((error as { code?: string }).code === 'commander.helpDisplayed') {
      return;
    }
    process.stderr.write(
      'Promptfoo online capture failed; check hook fields and private queue permissions.\n',
    );
    // Fail open: an observability hook must never block or continue the Agent's turn.
  }
  process.stdout.write('{}\n');
}
