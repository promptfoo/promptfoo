import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../../database/index';
import { configsTable } from '../../database/tables';
import logger from '../../logger';
import { normalizeTimestamp } from '../../util/time';
import { getParam, getQueryString, HttpStatus, handleRouteError, sendError } from '../middleware';
import type { Request, Response } from 'express';

import {
  CreateConfigRequestSchema,
  type CreateConfigResponse,
  type GetConfigResponse,
  type GetConfigsByTypeResponse,
  type GetConfigsResponse,
} from '../../dtos/configs.dto';
import { fromZodError } from 'zod-validation-error';

/**
 * Normalizes config timestamps to epoch milliseconds.
 * Handles legacy SQLite CURRENT_TIMESTAMP strings.
 */
function normalizeConfigTimestamps<
  T extends { createdAt: string | number; updatedAt: string | number },
>(config: T): T & { createdAt: number; updatedAt: number } {
  return {
    ...config,
    createdAt: normalizeTimestamp(config.createdAt),
    updatedAt: normalizeTimestamp(config.updatedAt),
  };
}

export const configsRouter = Router();

configsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  try {
    const type = getQueryString(req, 'type');
    const query = db
      .select({
        id: configsTable.id,
        name: configsTable.name,
        createdAt: configsTable.createdAt,
        updatedAt: configsTable.updatedAt,
        type: configsTable.type,
      })
      .from(configsTable)
      .orderBy(configsTable.updatedAt);

    if (type) {
      query.where(eq(configsTable.type, type));
    }

    const rawConfigs = await query;
    const configs = rawConfigs.map(normalizeConfigTimestamps);
    logger.info(`Loaded ${configs.length} configs${type ? ` of type ${type}` : ''}`);

    const response: GetConfigsResponse = { configs };
    res.json(response);
  } catch (error) {
    handleRouteError(res, error, 'fetching configs', logger);
  }
});

configsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parseResult = CreateConfigRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    sendError(res, HttpStatus.BAD_REQUEST, 'Invalid request body', fromZodError(parseResult.error).toString());
    return;
  }

  const { name, type, config } = parseResult.data;
  const db = await getDb();
  try {
    const id = crypto.randomUUID();

    const now = Date.now();
    const [result] = await db
      .insert(configsTable)
      .values({
        id,
        name,
        type,
        config,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: configsTable.id,
        createdAt: configsTable.createdAt,
      });

    logger.info(`Saved config ${id} of type ${type}`);

    const response: CreateConfigResponse = result;
    res.json(response);
  } catch (error) {
    handleRouteError(res, error, 'saving config', logger);
  }
});

configsRouter.get('/:type', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  const type = getParam(req, 'type');
  try {
    const rawConfigs = await db
      .select({
        id: configsTable.id,
        name: configsTable.name,
        createdAt: configsTable.createdAt,
        updatedAt: configsTable.updatedAt,
      })
      .from(configsTable)
      .where(eq(configsTable.type, type))
      .orderBy(configsTable.updatedAt);

    const configs = rawConfigs.map(normalizeConfigTimestamps);
    logger.info(`Loaded ${configs.length} configs of type ${type}`);

    const response: GetConfigsByTypeResponse = { configs };
    res.json(response);
  } catch (error) {
    handleRouteError(res, error, 'fetching configs', logger);
  }
});

configsRouter.get('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  const type = getParam(req, 'type');
  const id = getParam(req, 'id');
  try {
    const rawConfig = await db
      .select()
      .from(configsTable)
      .where(and(eq(configsTable.type, type), eq(configsTable.id, id)))
      .limit(1);

    logger.info(`Loaded config ${id} of type ${type}`);

    if (!rawConfig.length) {
      sendError(res, HttpStatus.NOT_FOUND, 'Config not found');
      return;
    }

    const config: GetConfigResponse = normalizeConfigTimestamps(rawConfig[0]);
    res.json(config);
  } catch (error) {
    handleRouteError(res, error, 'fetching config', logger);
  }
});
