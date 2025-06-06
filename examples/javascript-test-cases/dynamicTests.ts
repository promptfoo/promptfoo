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
          advanced: [
            {
              input: 'Could you explain the historical significance of this monument?',
              language: 'Italian',
              expected: 'Potresti spiegare il significato storico di questo monumento?',
            },
            {
              input: 'I would appreciate if you could provide detailed instructions.',
              language: 'German',
              expected: 'Ich wäre dankbar, wenn Sie detaillierte Anweisungen geben könnten.',
            },
            {
              input: 'What are the implications of this economic policy?',
              language: 'Spanish',
              expected: '¿Cuáles son las implicaciones de esta política económica?',
            },
            {
              input: 'The philosophical underpinnings of this theory are complex.',
              language: 'French',
              expected: 'Les fondements philosophiques de cette théorie sont complexes.',
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
          advanced: [
            {
              input: 'I need to arrange special dietary accommodations for my conference',
              language: 'Italian',
              expected: 'Devo organizzare sistemazioni dietetiche speciali per la mia conferenza',
            },
            {
              input: 'Could you recommend luxury hotels with business centers?',
              language: 'German',
              expected: 'Könnten Sie Luxushotels mit Geschäftszentren empfehlen?',
            },
            {
              input: 'We require a private dining room for our corporate event',
              language: 'Spanish',
              expected: 'Requerimos un comedor privado para nuestro evento corporativo',
            },
            {
              input: 'Please arrange ground transportation with multilingual drivers',
              language: 'French',
              expected:
                'Veuillez organiser le transport terrestre avec des chauffeurs multilingues',
            },
          ],
        },
      };

      if (!datasets[dataset]?.[difficulty]) {
        throw new Error(`Invalid dataset/difficulty combination: ${dataset}/${difficulty}`);
      }
      return datasets[dataset][difficulty];
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
