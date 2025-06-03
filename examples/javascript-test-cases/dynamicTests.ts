// For TypeScript users:
// To get type checking, uncomment the following line and Promise<TestCase[]> below
// import type { TestCase } from 'promptfoo';

interface MockTranslation {
  input: string;
  language: string;
  expected: string;
}

interface DatabaseConfig {
  dataset?: string;
  max_results?: number;
  languages?: string[];
  difficulty?: 'basic' | 'intermediate' | 'advanced';
}

// Generate test cases dynamically from a database with optional configuration
export async function generateFromDatabase(config?: DatabaseConfig) {
  // : Promise<TestCase[]> {

  // Default configuration
  const defaultConfig = {
    dataset: 'basic_translations',
    max_results: 10,
    languages: [],
    difficulty: 'basic' as const,
  };

  const mergedConfig = { ...defaultConfig, ...config };

  // Simulate different database queries based on configuration
  const mockDb = {
    query: async (dataset: string, difficulty: string) => {
      const datasets: Record<string, Record<string, MockTranslation[]>> = {
        basic_translations: {
          basic: [
            { input: 'Good night', language: 'Italian', expected: 'Buona notte' },
            { input: 'Thank you', language: 'German', expected: 'Danke' },
            { input: 'Hello', language: 'Spanish', expected: 'Hola' },
            { input: 'Please', language: 'French', expected: "S'il vous plaît" },
          ],
          intermediate: [
            { input: 'How much does this cost?', language: 'Italian', expected: 'Quanto costa?' },
            {
              input: 'Where is the train station?',
              language: 'German',
              expected: 'Wo ist der Bahnhof?',
            },
            { input: 'Can you help me?', language: 'Spanish', expected: '¿Puedes ayudarme?' },
            {
              input: 'I would like to order',
              language: 'French',
              expected: 'Je voudrais commander',
            },
          ],
        },
        travel_phrases: {
          basic: [
            { input: 'Airport', language: 'Italian', expected: 'Aeroporto' },
            { input: 'Hotel', language: 'German', expected: 'Hotel' },
            { input: 'Restaurant', language: 'Spanish', expected: 'Restaurante' },
            { input: 'Taxi', language: 'French', expected: 'Taxi' },
          ],
          intermediate: [
            {
              input: 'I need a taxi to the airport',
              language: 'Italian',
              expected: "Ho bisogno di un taxi per l'aeroporto",
            },
            {
              input: 'What time does the hotel close?',
              language: 'German',
              expected: 'Wann schließt das Hotel?',
            },
            {
              input: 'Do you have a table for two?',
              language: 'Spanish',
              expected: '¿Tienen una mesa para dos?',
            },
            {
              input: 'The bill, please',
              language: 'French',
              expected: "L'addition, s'il vous plaît",
            },
          ],
        },
      };

      return datasets[dataset]?.[difficulty] || datasets.basic_translations.basic;
    },
  };

  let results = await mockDb.query(mergedConfig.dataset, mergedConfig.difficulty);

  // Apply language filtering if specified
  if (mergedConfig.languages.length > 0) {
    results = results.filter((row) => mergedConfig.languages.includes(row.language));
  }

  // Apply result limiting
  results = results.slice(0, mergedConfig.max_results);

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
    description: `[${mergedConfig.difficulty.toUpperCase()}] ${mergedConfig.dataset}: ${row.input} → ${row.language}`,
  }));
}
