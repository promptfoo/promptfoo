import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { ApiSchemas } from '../apiSchemas';

export const userRouter = Router();

userRouter.get('/email', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = getUserEmail();
    res.json(ApiSchemas.User.Get.Response.parse({ email }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting email: ${fromError(error)}`);
    } else {
      logger.error(`Error getting email: ${error}`);
    }
    res.status(500).json({ error: 'Failed to get email' });
  }
});

userRouter.post('/email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = ApiSchemas.User.Update.Request.parse(req.body);
    setUserEmail(email);
    res.json(
      ApiSchemas.User.Update.Response.parse({
        success: true,
        message: `Email updated`,
      }),
    );
    await telemetry.recordAndSend('webui_api_event', { event: 'email_set' });
  } catch (error) {
    logger.error(`Error setting email: ${error}`);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to set email' });
    }
  }
});
