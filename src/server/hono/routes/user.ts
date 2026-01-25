import { Hono } from 'hono';
import { z } from 'zod';

import { getEnvBool } from '../../../envars';
import {
  checkEmailStatus,
  clearUserEmail,
  getUserEmail,
  getUserId,
  setUserEmail,
} from '../../../globalConfig/accounts';
import { cloudConfig } from '../../../globalConfig/cloud';
import logger from '../../../logger';
import telemetry from '../../../telemetry';
import { ApiSchemas } from '../../apiSchemas';

export const userRouter = new Hono();

userRouter.get('/email', async (c) => {
  try {
    const email = getUserEmail();
    return c.json(ApiSchemas.User.Get.Response.parse({ email: email || null }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting email: ${z.prettifyError(error)}`);
    } else {
      logger.error(`Error getting email: ${error}`);
    }
    return c.json({ error: 'Failed to get email' }, 500);
  }
});

userRouter.get('/id', async (c) => {
  try {
    const id = getUserId();
    return c.json(ApiSchemas.User.GetId.Response.parse({ id }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Error getting user ID: ${z.prettifyError(error)}`);
    } else {
      logger.error(`Error getting user ID: ${error}`);
    }
    return c.json({ error: 'Failed to get user ID' }, 500);
  }
});

userRouter.post('/email', async (c) => {
  try {
    const body = await c.req.json();
    const { email } = ApiSchemas.User.Update.Request.parse(body);
    setUserEmail(email);
    const response = ApiSchemas.User.Update.Response.parse({
      success: true,
      message: `Email updated`,
    });
    await telemetry.record('webui_api', {
      event: 'email_set',
      email,
      selfHosted: getEnvBool('PROMPTFOO_SELF_HOSTED'),
    });
    await telemetry.saveConsent(email, {
      source: 'webui_redteam',
    });
    return c.json(response);
  } catch (error) {
    logger.error(`Error setting email: ${error}`);
    if (error instanceof z.ZodError) {
      return c.json({ error: z.prettifyError(error) }, 400);
    } else {
      return c.json({ error: String(error) }, 500);
    }
  }
});

userRouter.put('/email/clear', async (c) => {
  try {
    clearUserEmail();
    return c.json({ success: true, message: 'Email cleared' });
  } catch (error) {
    logger.error(`Error clearing email: ${error}`);
    return c.json({ error: 'Failed to clear email' }, 500);
  }
});

userRouter.get('/email/status', async (c) => {
  try {
    const validate = c.req.query('validate') === 'true';
    const result = await checkEmailStatus({ validate });

    return c.json(
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
      return c.json({ error: z.prettifyError(error) }, 400);
    } else {
      return c.json({ error: 'Failed to check email status' }, 500);
    }
  }
});

// New API key authentication endpoint that mirrors CLI behavior
userRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { apiKey, apiHost } = z
      .object({
        apiKey: z.string().min(1, 'API key is required').max(512, 'API key too long'),
        apiHost: z.url().optional(),
      })
      .parse(body);

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

    return c.json({
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
      return c.json({ error: z.prettifyError(error) }, 400);
    } else {
      return c.json({ error: 'Invalid API key or authentication failed' }, 401);
    }
  }
});

// Logout endpoint - clears local authentication data
userRouter.post('/logout', async (c) => {
  try {
    setUserEmail('');
    cloudConfig.delete();

    logger.info('User logged out successfully');

    return c.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error(
      `Error during logout: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * Returns information about the Promptfoo Cloud config for the current user.
 */
userRouter.get('/cloud-config', async (c) => {
  try {
    const cloudConfigData = {
      appUrl: cloudConfig.getAppUrl(),
      isEnabled: cloudConfig.isEnabled(),
    };

    return c.json({
      appUrl: cloudConfigData.appUrl,
      isEnabled: cloudConfigData.isEnabled,
    });
  } catch (error) {
    logger.error(`Error getting cloud config: ${error}`);
    return c.json({ error: 'Failed to get cloud config' }, 500);
  }
});

export default userRouter;
