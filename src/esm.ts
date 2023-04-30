// esm-specific crap that needs to get mocked out in tests

import path from 'path';
import { fileURLToPath } from 'url';

export function getDirectory(): string {
  // @ts-ignore: Jest chokes on this
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
}
