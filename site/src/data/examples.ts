import generatedExamples from '../.generated-examples.json';

export interface ExampleData {
  slug: string;
  humanName: string;
  description: string;
  tags: string[];
  initCommand: string;
  githubUrl: string;
}

export interface ExampleTag {
  id: string;
  label: string;
  count: number;
}

export const examples: ExampleData[] = generatedExamples.examples;
export const tags: ExampleTag[] = generatedExamples.tags;
export const totalCount: number = generatedExamples.totalCount;

export function searchExamples(query: string, tagFilter?: string): ExampleData[] {
  let results = examples;

  if (tagFilter && tagFilter !== 'all') {
    results = results.filter((ex) => ex.tags.includes(tagFilter));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (ex) =>
        ex.humanName.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.slug.toLowerCase().includes(q) ||
        ex.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return results;
}
