import { Router } from 'express';
import { z } from 'zod';
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
import { UserSchemas } from '../../types/api/user';
import type { Request, Response } from 'express';

export const userRouter = Router();

userRouter.get('/email', async (_req: Request, res: Response): Promise<void> => {
  try {
    const email = getUserEmail();
    // Return 200 with null email instead of 404 to avoid console errors when no email is configured
    res.json(UserSchemas.Get.Response.parse({ email: email || null }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting email: ${z.prettifyError(error)}`);
    } else {
      logger.error(`Error getting email: ${error}`);
    }
    res.status(500).json({ error: 'Failed to get email' });
  }
});

userRouter.get('/id', async (_req: Request, res: Response): Promise<void> => {
  try {
    const id = getUserId();
    res.json(UserSchemas.GetId.Response.parse({ id }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting user ID: ${z.prettifyError(error)}`);
    } else {
      logger.error(`Error getting user ID: ${error}`);
    }
    res.status(500).json({ error: 'Failed to get user ID' });
  }
});

userRouter.post('/email', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = UserSchemas.Update.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { email } = bodyResult.data;
  try {
    setUserEmail(email);
    res.json(
      UserSchemas.Update.Response.parse({
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
    res.status(500).json({ error: 'Failed to update email' });
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
    // Schema uses z.unknown() for backward compat — accepts any shape, coerces to boolean
    const { validate } = UserSchemas.EmailStatus.Query.parse(req.query);
    const result = await checkEmailStatus({ validate });

    res.json(
      UserSchemas.EmailStatus.Response.parse({
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

// New API key authentication endpoint that mirrors CLI behavior
userRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = UserSchemas.Login.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { apiKey, apiHost } = bodyResult.data;
  try {
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

    res.json(
      UserSchemas.Login.Response.parse({
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
      }),
    );
  } catch (error) {
    logger.error(
      `Error during API key login: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    // Don't expose internal error details to client
    res.status(401).json({ error: 'Invalid API key or authentication failed' });
  }
});

// Logout endpoint - clears local authentication data
userRouter.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Clear stored email and cloud config (same as CLI logout)
    setUserEmail('');
    cloudConfig.delete();

    logger.info('User logged out successfully');

    res.json(
      UserSchemas.Logout.Response.parse({
        success: true,
        message: 'Logged out successfully',
      }),
    );
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
    res.json(
      UserSchemas.CloudConfig.Response.parse({
        appUrl: cloudConfig.getAppUrl(),
        isEnabled: cloudConfig.isEnabled(),
      }),
    );
  } catch (error) {
    logger.error(`Error getting cloud config: ${error}`);
    res.status(500).json({ error: 'Failed to get cloud config' });
  }
});
