import express from 'express';
import cors from 'cors';

import promptfoo from '../index.js';

import type { Request, Response } from 'express';

export function init(port = 3001) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  interface EvaluateRequestBody {
    provider: string;
    options: {
      prompts: string[];
      vars: Record<string, string>[];
    };
  }

  app.post('/evaluate', async (req: Request, res: Response) => {
    try {
      const { provider, options } = req.body as EvaluateRequestBody;
      const summary = await promptfoo.evaluate(provider, options);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: 'Error evaluating prompts' });
    }
  });

  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
}
