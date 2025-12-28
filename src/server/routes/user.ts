import { Router } from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import {
  type ClearUserEmailResponse,
  type GetCloudConfigResponse,
  type GetEmailStatusResponse,
  GetEmailStatusResponseSchema,
  type GetUserEmailResponse,
  type GetUserIdResponse,
  type LoginRequest,
  LoginRequestSchema,
  type LoginResponse,
  type LogoutResponse,
  type UpdateUserEmailRequest,
  UpdateUserEmailRequestSchema,
  type UpdateUserEmailResponse,
} from '../../dtos/user.dto';
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
import { HttpStatus, sendError, type ValidatedRequest, validateRequest } from '../middleware';
import type { Request, Response } from 'express';

export const userRouter = Router();

userRouter.get('/email', async (_req: Request, res: Response): Promise<void> => {
  try {
    const email = getUserEmail();
    // Return 200 with null email instead of 404 to avoid console errors when no email is configured
    const response: GetUserEmailResponse = { email: email || null };
    res.json(response);
  } catch (error) {
    logger.error(`Error getting email: ${error}`);
    res.status(500).json({ error: 'Failed to get email' });
  }
});

userRouter.get('/id', async (_req: Request, res: Response): Promise<void> => {
  try {
    const id = getUserId();
    const response: GetUserIdResponse = { id };
    res.json(response);
  } catch (error) {
    logger.error(`Error getting user ID: ${error}`);
    res.status(500).json({ error: 'Failed to get user ID' });
  }
});

userRouter.post(
  '/email',
  validateRequest({ body: UpdateUserEmailRequestSchema }),
  async (
    req: ValidatedRequest<unknown, unknown, UpdateUserEmailRequest>,
    res: Response,
  ): Promise<void> => {
    try {
      const { email } = req.body;
      setUserEmail(email);
      const response: UpdateUserEmailResponse = {
        success: true,
        message: 'Email updated',
      };
      res.json(response);
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
      sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, String(error));
    }
  },
);

userRouter.put('/email/clear', async (_req: Request, res: Response): Promise<void> => {
  try {
    clearUserEmail();
    const response: ClearUserEmailResponse = { success: true, message: 'Email cleared' };
    res.json(response);
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

    // Parse external data to ensure it matches expected shape
    const response: GetEmailStatusResponse = GetEmailStatusResponseSchema.parse({
      hasEmail: result.hasEmail,
      email: result.email,
      status: result.status,
      message: result.message,
    });
    res.json(response);
  } catch (error) {
    logger.error(`Error checking email status: ${error}`);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
    } else {
      res.status(500).json({ error: 'Failed to check email status' });
    }
  }
});

// New API key authentication endpoint that mirrors CLI behavior
userRouter.post(
  '/login',
  validateRequest({ body: LoginRequestSchema }),
  async (req: ValidatedRequest<unknown, unknown, LoginRequest>, res: Response): Promise<void> => {
    try {
      const { apiKey, apiHost } = req.body;

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

      const response: LoginResponse = {
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
      };
      res.json(response);
    } catch (error) {
      logger.error(
        `Error during API key login: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't expose internal error details to client
      sendError(res, HttpStatus.UNAUTHORIZED, 'Invalid API key or authentication failed');
    }
  },
);

// Logout endpoint - clears local authentication data
userRouter.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Clear stored email and cloud config (same as CLI logout)
    setUserEmail('');
    cloudConfig.delete();

    logger.info('User logged out successfully');

    const response: LogoutResponse = {
      success: true,
      message: 'Logged out successfully',
    };
    res.json(response);
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
    const response: GetCloudConfigResponse = {
      appUrl: cloudConfig.getAppUrl(),
      isEnabled: cloudConfig.isEnabled(),
    };
    res.json(response);
  } catch (error) {
    logger.error(`Error getting cloud config: ${error}`);
    res.status(500).json({ error: 'Failed to get cloud config' });
  }
});
