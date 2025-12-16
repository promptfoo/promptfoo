import express from 'express';
import { nanoid } from 'nanoid';

const app = express();
app.use(express.json());

interface Page {
  content: string;
  fetchCount: number;
  lastFetched?: Date;
  createdAt: Date;
}

const pages = new Map<string, Page>();

// Create a new page
app.post('/pages', (req, res) => {
  const id = nanoid(10);
  const page: Page = {
    content: req.body.content,
    fetchCount: 0,
    createdAt: new Date(),
  };
  pages.set(id, page);

  const port = process.env.PORT || 3456;
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

  console.log(`[${new Date().toISOString()}] Created page ${id}`);

  res.json({
    id,
    url: `${baseUrl}/pages/${id}`,
  });
});

// Serve a page (and track fetch count)
app.get('/pages/:id', (req, res) => {
  const page = pages.get(req.params.id);
  if (!page) {
    return res.status(404).send('Not found');
  }

  page.fetchCount++;
  page.lastFetched = new Date();

  console.log(
    `[${new Date().toISOString()}] Page ${req.params.id} fetched (count: ${page.fetchCount})`,
  );

  res.type('html').send(page.content);
});

// Update a page
app.put('/pages/:id', (req, res) => {
  const page = pages.get(req.params.id);
  if (!page) {
    return res.status(404).send('Not found');
  }

  page.content = req.body.content;

  console.log(`[${new Date().toISOString()}] Updated page ${req.params.id}`);

  res.json({ success: true });
});

// Get page stats
app.get('/pages/:id/stats', (req, res) => {
  const page = pages.get(req.params.id);
  if (!page) {
    return res.status(404).json({ fetchCount: 0 });
  }

  res.json({
    fetchCount: page.fetchCount,
    lastFetched: page.lastFetched,
    createdAt: page.createdAt,
  });
});

// List all pages (for debugging)
app.get('/pages', (_req, res) => {
  const list = Array.from(pages.entries()).map(([id, page]) => ({
    id,
    fetchCount: page.fetchCount,
    lastFetched: page.lastFetched,
    createdAt: page.createdAt,
    contentPreview: page.content.substring(0, 100) + '...',
  }));
  res.json(list);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', pageCount: pages.size });
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Injection server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /pages         - Create a new page');
  console.log('  GET  /pages/:id     - Serve page content');
  console.log('  PUT  /pages/:id     - Update page content');
  console.log('  GET  /pages/:id/stats - Get page statistics');
  console.log('  GET  /pages         - List all pages');
  console.log('  GET  /health        - Health check');
});
