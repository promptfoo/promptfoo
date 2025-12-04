import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import logger from '../../logger';

const findUp = (start: string, target: string): string | null => {
  let dir = start;
  while (true) {
    const candidate = join(dir, target);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const resolvePython = () =>
  findUp(process.cwd(), join('.venv', 'bin', 'python')) ||
  findUp(__dirname, join('..', '..', '..', '.venv', 'bin', 'python')) ||
  'python';

const resolveScript = () => {
  const fromCwd = findUp(process.cwd(), join('scripts', 'liquid_stt.py'));
  if (fromCwd) return fromCwd;
  return resolve(__dirname, '..', '..', '..', 'scripts', 'liquid_stt.py');
};

const transcribeWithLiquidAudio = (audioPath: string): string | null => {
  const script = resolveScript();
  const cmd = process.env.LIQUID_AUDIO_STT_CMD || `${resolvePython()} ${script}`;
  if (!cmd) return null;
  try {
    const finalCmd = cmd.includes('{file}')
      ? cmd.replace('{file}', audioPath)
      : `${cmd} ${audioPath}`;
    const out = execSync(finalCmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    return out || null;
  } catch (error) {
    logger.warn('Liquid Audio STT command failed', { error, cmd });
    return null;
  }
};

const transcribeWithOpenAi = async (audioPath: string): Promise<string | null> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const data = readFileSync(audioPath);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: (() => {
        const form = new FormData();
        form.append('file', new File([data], 'audio.wav', { type: 'audio/wav' }));
        form.append('model', 'whisper-1');
        return form;
      })(),
    });
    if (!res.ok) {
      throw new Error(`OpenAI transcription failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { text?: string };
    return json?.text || null;
  } catch (error) {
    logger.warn('OpenAI STT failed', { error });
    return null;
  }
};

export const transcribeAudio = async (audioPath: string): Promise<string | null> => {
  const liquid = transcribeWithLiquidAudio(audioPath);
  if (liquid) return liquid;
  return transcribeWithOpenAi(audioPath);
};
