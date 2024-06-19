declare module 'rouge' {
  function n(
    cand: string,
    ref: string,
    opts?: {
      n: number;
      nGram: (tokens: Array<string>, n: number) => Array<string>;
      tokenizer: (input: string) => Array<string>;
    },
  ): number;

  function l(
    cand: string,
    ref: string,
    opts?: {
      beta: number;
      lcs: (a: Array<string>, b: Array<string>) => Array<string>;
      segmenter: (input: string) => Array<string>;
      tokenizer: (input: string) => Array<string>;
    },
  ): number;

  function s(
    cand: string,
    ref: string,
    opts?: {
      beta: number;
      skipBigram: (tokens: Array<string>) => Array<string>;
      tokenizer: (input: string) => Array<string>;
    },
  ): number;
}
