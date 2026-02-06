import type { Document, AIResponse } from '../types';

const API_BASE = '/api';

export const api = {
  async getDocuments(): Promise<Document[]> {
    const res = await fetch(`${API_BASE}/documents`);
    const data = await res.json();
    return data.documents;
  },

  async getDocument(id: string): Promise<Document> {
    const res = await fetch(`${API_BASE}/documents/${id}`);
    const data = await res.json();
    return data.document;
  },

  async updateDocument(
    id: string,
    updates: Partial<Pick<Document, 'title' | 'content' | 'icon'>>,
  ): Promise<Document> {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return data.document;
  },

  async createDocument(doc: {
    title: string;
    content?: string;
    icon?: string;
    parentId?: string;
  }): Promise<Document> {
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    const data = await res.json();
    return data.document;
  },

  async deleteDocument(id: string): Promise<void> {
    await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
  },

  async chat(message: string, documentId: string): Promise<AIResponse> {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, documentId }),
    });
    return res.json();
  },
};
