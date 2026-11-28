import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));

export default function (vars) {
  if (!vars.audio_file) {
    return vars;
  }

  const resolveAudioFile = (audioFile) =>
    audioFile ? path.resolve(exampleDirectory, audioFile) : audioFile;

  return {
    ...vars,
    audio_file: Array.isArray(vars.audio_file)
      ? vars.audio_file.map(resolveAudioFile)
      : resolveAudioFile(vars.audio_file),
  };
}
