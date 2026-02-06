import { Router } from 'express';
import { chat } from '../services/aiAgent.js';
import type { ChatRequest } from '../types.js';

const router = Router();

// POST /api/ai/chat - Chat with AI about a document
router.post('/chat', async (req, res) => {
  try {
    const { message, documentId } = req.body as ChatRequest;

    if (!message || !documentId) {
      return res.status(400).json({
        error: 'message and documentId are required',
      });
    }

    console.log(
      `[AI Route] Chat request for doc ${documentId}: ${message.substring(0, 50)}...`,
    );

    const response = await chat(message, documentId);
    res.json(response);
  } catch (error) {
    console.error('[AI Route] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
