import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { getEnvBool } from '../../envars';
import { checkEmailStatus, getUserEmail, setUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { ApiSchemas } from '../apiSchemas';

export const userRouter = Router();

userRouter.get('/email', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = getUserEmail();
    if (email) {
      res.json(ApiSchemas.User.Get.Response.parse({ email }));
    } else {
      res.status(404).json({ error: 'User not found' });
    }
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
    await telemetry.recordAndSend('webui_api', {
      event: 'email_set',
      email,
      selfHosted: getEnvBool('PROMPTFOO_SELF_HOSTED'),
    });
  } catch (error) {
    logger.error(`Error setting email: ${error}`);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to set email' });
    }
  }
});

userRouter.get('/email/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await checkEmailStatus();

    res.json(
      ApiSchemas.User.EmailStatus.Response.parse({
        hasEmail: result.hasEmail,
        email: result.email,
        status: result.status,
        message: result.message,
      }),
    );
  } catch (error) {
    logger.error(`Error checking email status: ${error}`);
    res.status(500).json({ error: 'Failed to check email status' });
  }
});

userRouter.post('/consent', async (req: Request, res: Response) => {
  const { email, metadata } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    // Set the user email if it's not already set
    const currentEmail = getUserEmail();
    if (!currentEmail) {
      setUserEmail(email);
    }

    await telemetry.saveConsent(email, {
      source: 'webui_redteam',
      ...metadata,
    });

    await telemetry.recordAndSend('webui_api', {
      event: 'redteam_email_consent',
      email,
      selfHosted: getEnvBool('PROMPTFOO_SELF_HOSTED'),
    });

    res.status(200).json({ success: true });
  } catch (error) {
    logger.debug(`Failed to save consent: ${(error as Error).message}`);
    res.status(500).json({ error: 'Failed to save consent' });
  }
});
