import * as fs from 'fs';
import type { ImportFile } from '../types/schemas/import';

/**
 * Parses a large JSON file in a streaming manner to avoid memory exhaustion.
 * This is a simplified parser that expects a specific structure.
 */
export async function parseImportFileStream(filePath: string): Promise<ImportFile> {
  const stats = await fs.promises.stat(filePath);

  // For small files (< 10MB), use regular parsing
  if (stats.size < 10 * 1024 * 1024) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  // For large files, we need to be more careful
  // This is a simplified approach that reads the file in chunks
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    let buffer = '';
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    stream.on('data', (chunk) => {
      buffer += chunk;

      // Try to parse complete objects from the buffer
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
          }
        }

        // Check if we have a complete object
        if (braceCount === 0 && i > 0) {
          try {
            const objectStr = buffer.substring(0, i + 1);
            const parsed = JSON.parse(objectStr);

            // Store the parsed data
            if ('results' in parsed && 'version' in parsed.results) {
              resolve(parsed);
              stream.destroy();
              return;
            }
          } catch {
            // Not a complete object yet, continue
          }
        }
      }

      // Prevent buffer from growing too large
      if (buffer.length > 50 * 1024 * 1024) {
        // 50MB buffer limit
        reject(new Error('File too complex for streaming parser'));
        stream.destroy();
      }
    });

    stream.on('error', reject);
    stream.on('end', () => {
      reject(new Error('Unexpected end of file'));
    });
  });
}

/**
 * Process import file results in batches to avoid memory issues
 */
export async function* processResultsInBatches(
  results: any[],
  batchSize: number = 1000,
): AsyncGenerator<any[], void, unknown> {
  for (let i = 0; i < results.length; i += batchSize) {
    yield results.slice(i, i + batchSize);
  }
}
