import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { getEnvBool } from '../../envars';
import {
  checkEmailStatus,
  clearUserEmail,
  getUserEmail,
  getUserId,
  setUserEmail,
} from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { ApiSchemas } from '../apiSchemas';
import type { Request, Response } from 'express';

export const userRouter = Router();

userRouter.get('/email', async (_req: Request, res: Response): Promise<void> => {
  try {
    const email = getUserEmail();
    // Return 200 with null email instead of 404 to avoid console errors when no email is configured
    res.json(ApiSchemas.User.Get.Response.parse({ email: email || null }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting email: ${fromError(error)}`);
    } else {
      logger.error(`Error getting email: ${error}`);
    }
    res.status(500).json({ error: 'Failed to get email' });
  }
});

userRouter.get('/id', async (_req: Request, res: Response): Promise<void> => {
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

userRouter.put('/email/clear', async (_req: Request, res: Response): Promise<void> => {
  try {
    clearUserEmail();
    res.json({ success: true, message: 'Email cleared' });
  } catch (error) {
    logger.error(`Error clearing email: ${error}`);
    res.status(500).json({ error: 'Failed to clear email' });
  }
});

userRouter.get('/email/status', async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract validate query parameter
    const validate = req.query.validate === 'true';
    const result = await checkEmailStatus({ validate });

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

userRouter.get('/cloud/status', async (_req: Request, res: Response): Promise<void> => {
  try {
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

// New API key authentication endpoint that mirrors CLI behavior
userRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey, apiHost } = z
      .object({
        apiKey: z.string().min(1, 'API key is required').max(512, 'API key too long'),
        apiHost: z.string().url().optional(),
      })
      .parse(req.body);

    const host = apiHost || cloudConfig.getApiHost();

    // Use the same validation logic as CLI
    const { user, organization, app } = await cloudConfig.validateAndSetApiToken(apiKey, host);

    // Sync email to local config (same as CLI)
    const existingEmail = getUserEmail();
    if (existingEmail && existingEmail !== user.email) {
      logger.info(`Updating local email configuration from ${existingEmail} to ${user.email}`);
    }
    setUserEmail(user.email);

    // Record telemetry and consent
    await telemetry.record('webui_api', {
      event: 'api_key_login',
      email: user.email,
      selfHosted: getEnvBool('PROMPTFOO_SELF_HOSTED'),
    });
    await telemetry.saveConsent(user.email, {
      source: 'web_login',
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      organization: {
        id: organization.id,
        name: organization.name,
      },
      app: {
        url: app.url,
      },
    });
  } catch (error) {
    logger.error(
      `Error during API key login: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      // Don't expose internal error details to client
      res.status(401).json({ error: 'Invalid API key or authentication failed' });
    }
  }
});

// Logout endpoint - clears local authentication data
userRouter.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Clear stored email and cloud config (same as CLI logout)
    setUserEmail('');
    cloudConfig.delete();

    logger.info('User logged out successfully');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error(
      `Error during logout: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Returns information about the Promptfoo Cloud config for the current user.
 */
userRouter.get('/cloud-config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cloudConfigData = {
      appUrl: cloudConfig.getAppUrl(),
      isEnabled: cloudConfig.isEnabled(),
    };

    res.json({
      appUrl: cloudConfigData.appUrl,
      isEnabled: cloudConfigData.isEnabled,
    });
  } catch (error) {
    logger.error(`Error getting cloud config: ${error}`);
    res.status(500).json({ error: 'Failed to get cloud config' });
  }
});
