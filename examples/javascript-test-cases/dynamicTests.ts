// For TypeScript users:
// To get type checking, uncomment the following line and Promise<TestCase[]> below
// import type { TestCase } from 'promptfoo';

// Generate test cases dynamically from a database
export async function generateFromDatabase() {
  // : Promise<TestCase[]> {
  // Simulate database query
  const mockDb = {
    query: async (query: string) => [
      { input: 'Good night', language: 'Italian', expected: 'Buona notte' },
      { input: 'Thank you', language: 'German', expected: 'Danke' },
    ],
  };

  const results = await mockDb.query('SELECT input, language, expected FROM translations');

  return results.map((row, i) => ({
    vars: {
      target_language: row.language,
      text: row.input,
    },
    assert: [
      {
        type: 'contains',
        value: row.expected,
      },
    ],
    description: `Translation test case #${i + 1}`,
  }));
}
