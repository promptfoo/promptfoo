declare module 'rouge' {
  function n(
    candidate: string,
    reference: string | string[],
    n?: number,
    jackknife?: boolean,
  ): number;
  function l(candidate: string, reference: string | string[], jackknife?: boolean): number;
  function s(candidate: string, reference: string | string[], jackknife?: boolean): number;
}
