import fs from 'fs';

// Valid Node.js buffer encodings
const VALID_ENCODINGS: readonly BufferEncoding[] = [
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'ucs2',
  'ucs-2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
] as const;

/**
 * Detects encoding from system locale environment variables
 */
function getSystemEncoding(): string {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_CTYPE || '';
  
  // Common locale to encoding mappings
  if (lang.includes('UTF-8') || lang.includes('utf8')) {
    return 'utf-8';
  } else if (lang.includes('ISO-8859-1') || lang.includes('latin1')) {
    return 'latin1';
  } else if (lang.includes('UTF-16') || lang.includes('utf16')) {
    return 'utf16le';
  }
  
  return 'utf-8'; // Default fallback
}

/**
 * Parse file path for encoding specification
 * Supports: file://path/to/file.csv#encoding=utf16le
 */
export function parseFilePathWithEncoding(filePath: string): { path: string; encoding?: string } {
  const hashIndex = filePath.indexOf('#encoding=');
  if (hashIndex !== -1) {
    const path = filePath.substring(0, hashIndex);
    const encoding = filePath.substring(hashIndex + 10); // 10 = '#encoding='.length
    return { path, encoding };
  }
  return { path: filePath };
}

/**
 * Get the encoding to use for CSV files.
 * Priority order:
 * 1. File-specific encoding (e.g., file.csv#encoding=utf16le)
 * 2. System locale (LANG/LC_ALL environment variables)
 * 3. Default to 'utf-8'
 * 
 * Common Windows encodings:
 * - 'utf16le' for Excel on Windows
 * - 'latin1' for older Windows applications
 * - 'utf-8' for modern applications (default)
 */
export function getCsvEncoding(fileSpecificEncoding?: string): BufferEncoding {
  // 1. File-specific encoding takes highest priority
  if (fileSpecificEncoding) {
    if (!VALID_ENCODINGS.includes(fileSpecificEncoding as BufferEncoding)) {
      throw new Error(
        `Invalid CSV encoding '${fileSpecificEncoding}'. Valid encodings are: ${VALID_ENCODINGS.join(', ')}`,
      );
    }
    return fileSpecificEncoding as BufferEncoding;
  }
  
  // 2. Check system locale
  const systemEncoding = getSystemEncoding();
  if (VALID_ENCODINGS.includes(systemEncoding as BufferEncoding)) {
    return systemEncoding as BufferEncoding;
  }
  
  // 3. Default fallback
  return 'utf-8';
}

/**
 * Read a CSV file using the configured encoding.
 * @throws {Error} If the encoding is invalid or file cannot be read
 */
export function readCsvFile(path: string): string {
  try {
    const { path: cleanPath, encoding } = parseFilePathWithEncoding(path);
    return fs.readFileSync(cleanPath, getCsvEncoding(encoding));
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid CSV encoding')) {
      throw error;
    }
    throw new Error(
      `Failed to read CSV file '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Write CSV content using the configured encoding.
 * @throws {Error} If the encoding is invalid or file cannot be written
 */
export function writeCsvFile(path: string, content: string): void {
  try {
    const { path: cleanPath, encoding } = parseFilePathWithEncoding(path);
    fs.writeFileSync(cleanPath, content, getCsvEncoding(encoding));
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid CSV encoding')) {
      throw error;
    }
    throw new Error(
      `Failed to write CSV file '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Append CSV content using the configured encoding.
 * @throws {Error} If the encoding is invalid or file cannot be appended
 */
export function appendCsvFile(path: string, content: string): void {
  try {
    const { path: cleanPath, encoding } = parseFilePathWithEncoding(path);
    fs.appendFileSync(cleanPath, content, getCsvEncoding(encoding));
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid CSV encoding')) {
      throw error;
    }
    throw new Error(
      `Failed to append to CSV file '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
