import { readFileSync } from 'fs';
import { join } from 'path';

describe('generated-constants.ts', () => {
  const EXPECTED_CONTENT = `// This file is a placeholder for development.
// During build, the compiled output is modified to inject the actual PostHog key.
// The source file is never modified, ensuring clean version control.

export const POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
`;

  it('should remain unchanged from the placeholder version', () => {
    const filePath = join(process.cwd(), 'src', 'generated-constants.ts');
    const actualContent = readFileSync(filePath, 'utf-8');

    // Normalize line endings for cross-platform compatibility
    const normalizedActual = actualContent.replace(/\r\n/g, '\n');
    const normalizedExpected = EXPECTED_CONTENT.replace(/\r\n/g, '\n');

    expect(normalizedActual).toBe(normalizedExpected);
  });

  it('should be a development placeholder that reads from environment variables', () => {
    // This test ensures that the source file always uses process.env
    // The actual injection happens post-compilation in the dist folder
    const filePath = join(process.cwd(), 'src', 'generated-constants.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    expect(content).toContain('process.env.PROMPTFOO_POSTHOG_KEY');
    expect(content).not.toMatch(/export const POSTHOG_KEY = '[^']+';/); // Should not contain hardcoded keys
  });
});
