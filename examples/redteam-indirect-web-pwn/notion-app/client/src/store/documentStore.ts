import { create } from 'zustand';
import type { Document } from '../types';
import { api } from '../services/api';

interface DocumentState {
  documents: Document[];
  currentDocument: Document | null;
  isLoading: boolean;
  error: string | null;
  lastSaved: Date | null;
  fetchDocuments: () => Promise<void>;
  fetchDocument: (id: string) => Promise<void>;
  updateContent: (content: string) => void;
  saveDocument: () => Promise<void>;
  setCurrentDocument: (doc: Document | null) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocument: null,
  isLoading: false,
  error: null,
  lastSaved: null,

  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const documents = await api.getDocuments();
      set({ documents, isLoading: false });
    } catch {
      set({ error: 'Failed to fetch documents', isLoading: false });
    }
  },

  fetchDocument: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const document = await api.getDocument(id);
      set({ currentDocument: document, isLoading: false });
    } catch {
      set({ error: 'Failed to fetch document', isLoading: false });
    }
  },

  updateContent: (content: string) => {
    const { currentDocument } = get();
    if (currentDocument) {
      set({ currentDocument: { ...currentDocument, content } });
    }
  },

  saveDocument: async () => {
    const { currentDocument } = get();
    if (!currentDocument) return;

    try {
      const updated = await api.updateDocument(currentDocument.id, {
        content: currentDocument.content,
      });
      set({ currentDocument: updated, lastSaved: new Date() });
    } catch (err) {
      console.error('[Store] Failed to save document:', err);
    }
  },

  setCurrentDocument: (doc) => {
    set({ currentDocument: doc });
  },
}));
