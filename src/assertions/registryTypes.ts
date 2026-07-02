export type AssertionHandler<TParams, TResult> = (params: TParams) => TResult | Promise<TResult>;

export interface AssertionPrefixHandler<TParams, TResult> {
  prefix: string;
  handler: AssertionHandler<TParams, TResult>;
}

export interface AssertionCapabilityPack<TParams, TResult> {
  name: string;
  handlers?: Readonly<Record<string, AssertionHandler<TParams, TResult>>>;
  prefixes?: readonly AssertionPrefixHandler<TParams, TResult>[];
}
