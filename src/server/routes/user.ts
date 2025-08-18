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

/**
 * Determines if a URL represents an enterprise deployment by checking
 * if it's a custom domain (not the standard promptfoo.app domain)
 */
function isEnterpriseUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // Standard promptfoo domains are not enterprise
    const standardDomains = ['promptfoo.app', 'www.promptfoo.app', 'app.promptfoo.app'];

    return !standardDomains.includes(hostname);
  } catch {
    // Invalid URL format
    return false;
  }
}

userRouter.get('/cloud/status', async (req: Request, res: Response): Promise<void> => {
  try {
    let cloudConfig;
    try {
      const cloudModule = await import('../../globalConfig/cloud');
      cloudConfig = cloudModule.cloudConfig;
    } catch (importError) {
      logger.error(`Error importing cloud config: ${importError}`);
      throw new Error('Cloud configuration unavailable');
    }

    const isAuthenticated = cloudConfig.isEnabled();
    const apiKey = cloudConfig.getApiKey();
    const appUrl = cloudConfig.getAppUrl();

    // Determine enterprise status based on URL domain
    const isEnterprise = isEnterpriseUrl(appUrl);

    const responseData = {
      isAuthenticated,
      hasApiKey: !!apiKey,
      appUrl: isAuthenticated ? appUrl : null, // Only expose URL if authenticated
      isEnterprise,
    };

    res.json(ApiSchemas.User.CloudStatus.Response.parse(responseData));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Cloud status validation error: ${fromError(error)}`);
      res.status(500).json({ error: 'Invalid cloud status data' });
    } else {
      logger.error(`Error checking cloud status: ${error}`);
      res.status(500).json({ error: 'Failed to check cloud status' });
    }
  }
});
