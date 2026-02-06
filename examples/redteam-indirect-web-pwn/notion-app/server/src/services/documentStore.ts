import type { Document } from '../types.js';
import { seedDocuments } from '../seed/seedData.js';

class DocumentStore {
  private documents: Map<string, Document> = new Map();

  constructor() {
    this.seed();
  }

  private seed() {
    for (const doc of seedDocuments) {
      this.documents.set(doc.id, doc);
    }
    console.log(`[DocumentStore] Seeded ${this.documents.size} documents`);
  }

  getAll(): Document[] {
    return Array.from(this.documents.values()).filter((d) => !d.isArchived);
  }

  getById(id: string): Document | undefined {
    return this.documents.get(id);
  }

  search(query: string): Document[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (doc) =>
        (doc.title?.toLowerCase() || '').includes(lowerQuery) ||
        (doc.content?.toLowerCase() || '').includes(lowerQuery),
    );
  }

  create(
    doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>,
  ): Document {
    const id = crypto.randomUUID();
    const now = new Date();
    const newDoc: Document = {
      ...doc,
      id,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    };
    this.documents.set(id, newDoc);
    return newDoc;
  }

  update(
    id: string,
    updates: Partial<Pick<Document, 'title' | 'content' | 'icon'>>,
  ): Document | undefined {
    const doc = this.documents.get(id);
    if (!doc) return undefined;

    const cleanUpdates: Partial<Pick<Document, 'title' | 'content' | 'icon'>> =
      {};
    if (updates.title !== undefined) cleanUpdates.title = updates.title;
    if (updates.content !== undefined) cleanUpdates.content = updates.content;
    if (updates.icon !== undefined) cleanUpdates.icon = updates.icon;

    const updated: Document = {
      ...doc,
      ...cleanUpdates,
      updatedAt: new Date(),
    };
    this.documents.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    doc.isArchived = true;
    this.documents.set(id, doc);
    return true;
  }

  reset(docs: Document[]): void {
    this.documents.clear();
    for (const doc of docs) {
      this.documents.set(doc.id, { ...doc });
    }
    console.log(`[DocumentStore] Reset with ${this.documents.size} documents`);
  }
}

export const documentStore = new DocumentStore();
