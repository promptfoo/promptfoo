import type { AssertionCapabilityPack, AssertionHandler } from './registryTypes';

interface RegisteredPrefixHandler<TParams, TResult> {
  packName: string;
  prefix: string;
  handler: AssertionHandler<TParams, TResult>;
}

export class AssertionRegistry<TParams, TResult> {
  private readonly handlers = new Map<
    string,
    { handler: AssertionHandler<TParams, TResult>; packName: string }
  >();
  private readonly prefixes: RegisteredPrefixHandler<TParams, TResult>[] = [];

  constructor(packs: readonly AssertionCapabilityPack<TParams, TResult>[] = []) {
    for (const pack of packs) {
      this.registerPack(pack);
    }
  }

  get registeredTypes(): readonly string[] {
    return Array.from(this.handlers.keys());
  }

  get registeredPrefixes(): readonly string[] {
    return this.prefixes.map(({ prefix }) => prefix);
  }

  resolve(type: string): AssertionHandler<TParams, TResult> | undefined {
    const exact = this.handlers.get(type);
    if (exact) {
      return exact.handler;
    }

    return this.prefixes.find(({ prefix }) => type.startsWith(prefix))?.handler;
  }

  async run(type: string, params: TParams): Promise<TResult> {
    const handler = this.resolve(type);
    if (!handler) {
      throw new Error(`Unknown assertion type: ${type}`);
    }
    return handler(params);
  }

  private registerPack(pack: AssertionCapabilityPack<TParams, TResult>): void {
    for (const [type, handler] of Object.entries(pack.handlers ?? {})) {
      if (!handler) {
        continue;
      }
      const existing = this.handlers.get(type);
      if (existing) {
        throw new Error(
          `Assertion type "${type}" is registered by both "${existing.packName}" and "${pack.name}"`,
        );
      }
      this.handlers.set(type, { handler, packName: pack.name });
    }

    for (const prefix of pack.prefixes ?? []) {
      const existing = this.prefixes.find((candidate) => candidate.prefix === prefix.prefix);
      if (existing) {
        throw new Error(
          `Assertion prefix "${prefix.prefix}" is registered by both "${existing.packName}" and "${pack.name}"`,
        );
      }
      this.prefixes.push({
        handler: prefix.handler,
        packName: pack.name,
        prefix: prefix.prefix,
      });
    }
    this.prefixes.sort((left, right) => right.prefix.length - left.prefix.length);
  }
}
