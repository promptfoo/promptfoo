import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { providers as providerTable } from '../database/tables';
import type { ApiProvider } from '../types';
import { sha256 } from '../util/createHash';

function getProviderId(provider: ApiProvider): string {
  return sha256(provider.id() + JSON.stringify(provider.config));
}

export default class Provider {
  static async createMultiple(providers: ApiProvider[], opts?: { persist: boolean }) {
    const ret: Provider[] = [];
    for (const provider of providers) {
      const id = getProviderId(provider);
      if (opts?.persist) {
        const db = getDb();
        let results = await db.select().from(providerTable).where(eq(providerTable.id, id));
        let providerResult: { id: string; providerId: string; label: string | null };
        if (results.length > 0) {
          providerResult = results[0];
        } else {
          results = await db
            .insert(providerTable)
            .values({
              id,
              providerId: provider.id(),
              label: provider.label,
            })
            .onConflictDoNothing()
            .returning();
          providerResult = results[0];
        }
        ret.push(new Provider(providerResult.id, providerResult.providerId, providerResult.label));
      } else {
        ret.push(new Provider(id, provider.id(), provider.label));
      }
    }
    return ret;
  }

  constructor(
    public id: string,
    public providerId: string,
    public label: string | null = null,
  ) {
    this.id = id;
    this.providerId = providerId;
    this.label = label;
  }
}
