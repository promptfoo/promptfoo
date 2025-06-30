// Type definitions for natural module (optional dependency)
export interface DataRecord {
  [key: string]: any;
  synonyms: string[];
}

export interface Stemmer {
  stem(token: string): string;
}

export interface WordNetInstance {
  lookup(word: string, callback: (results: DataRecord[]) => void): void;
}

export interface WordNetStatic {
  new (): WordNetInstance;
}

// Module augmentation for when 'natural' is available
declare module 'natural' {
  export interface DataRecord {
    [key: string]: any;
    synonyms: string[];
  }

  export interface Stemmer {
    stem(token: string): string;
  }

  export interface WordNetInstance {
    lookup(word: string, callback: (results: DataRecord[]) => void): void;
  }

  export interface WordNetStatic {
    new (): WordNetInstance;
  }

  export const PorterStemmer: Stemmer;
  export const WordNet: WordNetStatic;
}