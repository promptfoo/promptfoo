import express from 'express';
import cors from 'cors';
import documentsRouter from './routes/documents.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/documents', documentsRouter);
app.use('/api/ai', aiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Notion Clone Server running on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
