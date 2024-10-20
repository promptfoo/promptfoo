import type { Request, Response } from 'express';
import { Router } from 'express';
import logger from '../../logger';
import { ApiSchemas } from '../apiSchemas';

export const redteamRouter = Router();

export const sendConfigCopy = async (req: Request, res: Response) => {
  try {
    const { email, config } = ApiSchemas.Redteam.Send.Request.parse(req.body);

    // Mock sending email
    logger.info(`Sending config to ${email}:`, config);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    res.json(
      ApiSchemas.Redteam.Send.Response.parse({
        success: true,
        message: `Configuration sent to ${email}`,
      }),
    );
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

redteamRouter.post('/send', sendConfigCopy);

redteamRouter.post('/:task', async (req: Request, res: Response) => {
  const { task } = req.params;
  const CLOUD_FUNCTION_URL =
    process.env.PROMPTFOO_REMOTE_GENERATION_URL || 'https://api.promptfoo.dev/v1/generate';

  logger.debug(`Received ${task} task request:`, {
    method: req.method,
    url: req.url,
    body: req.body,
    // headers: req.headers,
  });

  try {
    logger.debug(`Sending request to cloud function: ${CLOUD_FUNCTION_URL}`);
    const response = await fetch(CLOUD_FUNCTION_URL, {
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
