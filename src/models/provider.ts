import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { providers as providerTable } from '../database/tables';
import type { ApiProvider } from '../types';
import { sha256 } from '../util/createHash';

function getProviderId(provider: ApiProvider): string {
  return sha256(provider.id() + JSON.stringify(provider.config));
}

export default class Provider {
  static async createMultiple(providers: ApiProvider[]) {
    const db = getDb();
    const ret: Provider[] = [];

    for (const provider of providers) {
      const id = getProviderId(provider);
      let providerResult: { id: string; provider_id: string; config: Record<string, any> };
      let results = await db.select().from(providerTable).where(eq(providerTable.id, id));
      if (results.length > 0) {
        providerResult = results[0];
      } else {
        results = await db
          .insert(providerTable)
          .values({
            id,
            provider_id: provider.id(),
            config: provider.config || {},
          })
          .onConflictDoNothing()
          .returning();
        providerResult = results[0];
      }
      ret.push(new Provider(providerResult.id, providerResult.provider_id, providerResult.config));
    }

    return ret;
  }

  constructor(
    public id: string,
    public providerId: string,
    public config: Record<string, any>,
  ) {
    this.id = id;
    this.providerId = providerId;
    this.config = config;
  }
}
