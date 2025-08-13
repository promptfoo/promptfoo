import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { getEnvBool } from '../../envars';
import {
  checkEmailStatus,
  getUserEmail,
  getUserId,
  setUserEmail,
} from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { ApiSchemas } from '../apiSchemas';
import type { Request, Response } from 'express';

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

userRouter.get('/id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getUserId();
    res.json(ApiSchemas.User.GetId.Response.parse({ id }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting user ID: ${fromError(error)}`);
    } else {
      logger.error(`Error getting user ID: ${error}`);
    }
    res.status(500).json({ error: 'Failed to get user ID' });
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
    await telemetry.record('webui_api', {
      event: 'email_set',
      email,
      selfHosted: getEnvBool('PROMPTFOO_SELF_HOSTED'),
    });
    await telemetry.saveConsent(email, {
      source: 'webui_redteam',
    });
  } catch (error) {
    logger.error(`Error setting email: ${error}`);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      res.status(500).json({ error: String(error) });
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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to check email status' });
    }
  }
});

userRouter.get('/cloud/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { cloudConfig } = await import('../../globalConfig/cloud');
    const isAuthenticated = cloudConfig.isEnabled();
    const apiKey = cloudConfig.getApiKey();
    const appUrl = cloudConfig.getAppUrl(); // Always get the URL for enterprise detection

    // Determine if this is an enterprise deployment
    // If the appUrl is set and doesn't include promptfoo.app, it's enterprise
    const isEnterprise = appUrl ? !appUrl.includes('promptfoo.app') : false;

    res.json({
      isAuthenticated,
      hasApiKey: !!apiKey,
      appUrl: isAuthenticated ? appUrl : null, // Only expose URL if authenticated
      isEnterprise,
    });
  } catch (error) {
    logger.error(`Error checking cloud status: ${error}`);
    res.status(500).json({ error: 'Failed to check cloud status' });
  }
});
