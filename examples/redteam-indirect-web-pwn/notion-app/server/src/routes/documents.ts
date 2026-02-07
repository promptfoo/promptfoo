import { Router } from 'express';
import { documentStore } from '../services/documentStore.js';
import { seedDocuments } from '../seed/seedData.js';

const router = Router();

// POST /api/documents/reset - Reset all documents to seed state
router.post('/reset', (_req, res) => {
  documentStore.reset(seedDocuments);
  res.json({ success: true, message: 'Documents reset to seed state' });
});

// GET /api/documents - List all documents
router.get('/', (_req, res) => {
  const documents = documentStore.getAll();
  res.json({ documents });
});

// GET /api/documents/search - Search documents
router.get('/search', (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  const documents = documentStore.search(query);
  res.json({ documents });
});

// GET /api/documents/:id - Get single document
router.get('/:id', (req, res) => {
  const doc = documentStore.getById(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({ document: doc });
});

// POST /api/documents - Create document
router.post('/', (req, res) => {
  const { title, content, icon, parentId } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const doc = documentStore.create({
    title,
    content: content || '',
    icon: icon || '📄',
    parentId: parentId || null,
  });
  res.status(201).json({ document: doc });
});

// PATCH /api/documents/:id - Update document (auto-save)
router.patch('/:id', (req, res) => {
  const { title, content, icon } = req.body;
  const doc = documentStore.update(req.params.id, { title, content, icon });
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({ document: doc });
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', (req, res) => {
  const success = documentStore.delete(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({ success: true });
});

export default router;
