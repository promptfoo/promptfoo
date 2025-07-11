import { readFileSync } from 'fs';
import { join } from 'path';

describe('generated-constants.ts', () => {
  // Skip this test if not running in CI/CD environment
  const testFn = process.env.CI ? it : it.skip;

  testFn('should have correct structure when generated', () => {
    const filePath = join(process.cwd(), 'src', 'generated-constants.ts');

    // Check if file exists (it should be generated during build)
    let fileContent: string;
    try {
      fileContent = readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `generated-constants.ts not found. Make sure to run the build process first. Error: ${error}`,
      );
    }

    // Normalize line endings for cross-platform compatibility
    const normalizedContent = fileContent.replace(/\r\n/g, '\n');

    // Check that it contains the auto-generated comment
    // eslint-disable-next-line jest/no-standalone-expect
    expect(normalizedContent).toContain(
      '// This file is auto-generated during build. Do not edit manually.',
    );

    // Check that it contains a timestamp
    // eslint-disable-next-line jest/no-standalone-expect
    expect(normalizedContent).toMatch(
      /\/\/ Generated at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
    );

    // Check that it exports POSTHOG_KEY
    // eslint-disable-next-line jest/no-standalone-expect
    expect(normalizedContent).toMatch(/export const POSTHOG_KEY = ['"][^'"]*['"];/);
  });
});
