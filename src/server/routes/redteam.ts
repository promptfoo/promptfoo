import { Router } from 'express';
import type { Request, Response } from 'express';
import logger from '../../logger';
import { getRemoteGenerationUrl } from '../../redteam/remoteGeneration';

export const redteamRouter = Router();

redteamRouter.post('/:task', async (req: Request, res: Response): Promise<void> => {
  const { task } = req.params;
  const cloudFunctionUrl = getRemoteGenerationUrl();
  logger.debug(`Received ${task} task request:`, {
    method: req.method,
    url: req.url,
    body: req.body,
  });

  try {
    logger.debug(`Sending request to cloud function: ${cloudFunctionUrl}`);
    const response = await fetch(cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        ...req.body,
      }),
    });

    if (!response.ok) {
      logger.error(`Cloud function responded with status ${response.status}`);
      throw new Error(`Cloud function responded with status ${response.status}`);
    }

    const data = await response.json();
    logger.debug(`Received response from cloud function:`, data);
    res.json(data);
  } catch (error) {
    logger.error(`Error in ${task} task:`, error);
    res.status(500).json({ error: `Failed to process ${task} task` });
  }
});
