import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('generated-constants.ts', () => {
  it('should have valid generated content', () => {
    const filePath = join(process.cwd(), 'src', 'generated-constants.ts');
    const actualContent = readFileSync(filePath, 'utf-8');

    // Normalize line endings for cross-platform compatibility
    const normalizedActual = actualContent.replace(/\r\n/g, '\n');

    // Check that it's either the placeholder or generated content
    const isPlaceholder = normalizedActual.includes('This file is a placeholder for development');
    const isGenerated = normalizedActual.includes('This file is auto-generated during build');

    expect(isPlaceholder || isGenerated).toBe(true);

    // Check that it exports POSTHOG_KEY
    expect(normalizedActual).toContain('export const POSTHOG_KEY = ');
  });
});
