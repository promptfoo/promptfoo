import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import logger from '../../logger';
import { ensureWav } from './audio';

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
  const fromCwd = findUp(process.cwd(), join('scripts', 'liquid_tts.py'));
  if (fromCwd) return fromCwd;
  return resolve(__dirname, '..', '..', '..', 'scripts', 'liquid_tts.py');
};

export const synthesizeWithLiquidTts = (text: string): Buffer | null => {
  const script = resolveScript();
  const cmd = process.env.LIQUID_AUDIO_TTS_CMD || `${resolvePython()} ${script}`;
  if (!cmd) return null;
  try {
    const payload = JSON.stringify({ text });
    const out = execSync(cmd, { input: payload });
    return out && out.length ? ensureWav(Buffer.from(out)) : null;
  } catch (error) {
    logger.warn('Liquid Audio TTS failed, falling back', { error });
    return null;
  }
};
