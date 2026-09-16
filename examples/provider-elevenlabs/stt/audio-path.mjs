import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));

export default function (vars) {
  if (!vars.audioFile) {
    return vars;
  }

  const resolveAudioFile = (audioFile) =>
    audioFile ? path.resolve(exampleDirectory, audioFile) : audioFile;

  return {
    ...vars,
    audioFile: Array.isArray(vars.audioFile)
      ? vars.audioFile.map(resolveAudioFile)
      : resolveAudioFile(vars.audioFile),
  };
}
