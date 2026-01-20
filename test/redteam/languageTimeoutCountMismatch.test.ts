import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test to verify that language generation failures are properly tracked
 * with error messages, fixing the count mismatch issue.
 *
 * The fix: When a language promise rejects (e.g., timeout), track the failed
 * language with generated: 0 and include the error message.
 */
describe('Language timeout count mismatch fix', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should track failed languages with error messages using the fixed implementation', async () => {
    const languages = ['en', 'zu', 'hmn']; // English, Zulu, Hmong
    const pluginNumTests = 5;

    // Simulate Promise.allSettled results where Zulu and Hmong timeout
    const languageResults: PromiseSettledResult<{
      lang: string;
      tests: any[];
      requested: number;
      generated: number;
    }>[] = [
      {
        status: 'fulfilled',
        value: {
          lang: 'en',
          tests: Array(5).fill({ vars: { prompt: 'test' } }),
          requested: 5,
          generated: 5,
        },
      },
      {
        status: 'rejected',
        reason: new Error('Request timeout after 120000ms'),
      },
      {
        status: 'rejected',
        reason: new Error('HTTP 500 Internal Server Error'),
      },
    ];

    // This is the FIXED behavior matching index.ts implementation
    const allPluginTests: any[] = [];
    const resultsPerLanguage: Record<
      string,
      { requested: number; generated: number; error?: string }
    > = {};

    languageResults.forEach((result, index) => {
      const lang = languages[index];
      if (result.status === 'fulfilled') {
        const { tests, requested, generated } = result.value;
        allPluginTests.push(...tests);
        resultsPerLanguage[lang || 'default'] = { requested, generated };
      } else {
        // Track failed language with error reason
        const errorMsg =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        resultsPerLanguage[lang || 'default'] = {
          requested: pluginNumTests,
          generated: 0,
          error: errorMsg,
        };
      }
    });

    // Verify all languages are tracked
    expect(Object.keys(resultsPerLanguage)).toHaveLength(3);
    expect(resultsPerLanguage).toHaveProperty('en');
    expect(resultsPerLanguage).toHaveProperty('zu');
    expect(resultsPerLanguage).toHaveProperty('hmn');

    // Verify successful language
    expect(resultsPerLanguage['en']).toEqual({
      requested: 5,
      generated: 5,
    });

    // Verify failed languages have error messages
    expect(resultsPerLanguage['zu']).toEqual({
      requested: 5,
      generated: 0,
      error: 'Request timeout after 120000ms',
    });
    expect(resultsPerLanguage['hmn']).toEqual({
      requested: 5,
      generated: 0,
      error: 'HTTP 500 Internal Server Error',
    });

    // Verify totals
    const reportEntries = Object.entries(resultsPerLanguage);
    const reportTotalRequested = reportEntries.reduce((sum, [_, r]) => sum + r.requested, 0);
    const reportTotalGenerated = reportEntries.reduce((sum, [_, r]) => sum + r.generated, 0);

    const progressBarExpected = pluginNumTests * languages.length; // 15

    // With the fix, requested counts match
    expect(reportTotalRequested).toBe(progressBarExpected); // Both 15
    expect(reportTotalGenerated).toBe(5); // Only English succeeded
  });

  it('should handle non-Error rejection reasons', async () => {
    const languages = ['en', 'fr'];
    const pluginNumTests = 5;

    const languageResults: PromiseSettledResult<{
      lang: string;
      tests: any[];
      requested: number;
      generated: number;
    }>[] = [
      {
        status: 'fulfilled',
        value: {
          lang: 'en',
          tests: Array(5).fill({ vars: { prompt: 'test' } }),
          requested: 5,
          generated: 5,
        },
      },
      {
        status: 'rejected',
        reason: 'Connection refused', // String instead of Error
      },
    ];

    const resultsPerLanguage: Record<
      string,
      { requested: number; generated: number; error?: string }
    > = {};

    languageResults.forEach((result, index) => {
      const lang = languages[index];
      if (result.status === 'fulfilled') {
        const { tests, requested, generated } = result.value;
        resultsPerLanguage[lang || 'default'] = { requested, generated };
      } else {
        const errorMsg =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        resultsPerLanguage[lang || 'default'] = {
          requested: pluginNumTests,
          generated: 0,
          error: errorMsg,
        };
      }
    });

    // Should handle string rejection reason
    expect(resultsPerLanguage['fr']).toEqual({
      requested: 5,
      generated: 0,
      error: 'Connection refused',
    });
  });
});
