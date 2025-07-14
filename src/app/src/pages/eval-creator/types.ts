// Type definitions for eval creator generation features

// Prompt suggestion types
export interface PromptSuggestion {
  label: string;
  template: string;
  description: string;
  variables?: string[];
  category?: 'general' | 'testing' | 'safety' | 'performance' | 'ux';
}
