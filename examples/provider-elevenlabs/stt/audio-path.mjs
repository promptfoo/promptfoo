import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));

export default function ({ vars }) {
  return path.resolve(exampleDirectory, vars.audioFile);
}
