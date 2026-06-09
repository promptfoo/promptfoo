import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../../database/index';
import { configsTable } from '../../database/tables';
import logger from '../../logger';
import { ConfigSchemas } from '../../types/api/configs';
import { ApiRoutes } from '../../types/api/routes';
import { replyError, replyValidationError } from '../utils/errors';
import type { Request, Response } from 'express';

export const configsRouter = Router();

configsRouter.get(
  ApiRoutes.Configs.List.routerPath,
  async (req: Request, res: Response): Promise<void> => {
    const queryResult = ConfigSchemas.List.Query.safeParse(req.query);
    if (!queryResult.success) {
      replyValidationError(res, queryResult.error);
      return;
    }

    try {
      const { type } = queryResult.data;
      const db = await getDb();
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

      const configs = await query;
      logger.info(`Loaded ${configs.length} configs${type ? ` of type ${type}` : ''}`);

      res.json(ConfigSchemas.List.Response.parse({ configs }));
    } catch (error) {
      logger.error(`Error fetching configs: ${error}`);
      replyError(res, 500, 'Failed to fetch configs');
    }
  },
);

configsRouter.post(
  ApiRoutes.Configs.Create.routerPath,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ConfigSchemas.Create.Request.safeParse(req.body);
    if (!bodyResult.success) {
      replyValidationError(res, bodyResult.error);
      return;
    }

    try {
      const { name, type, config } = bodyResult.data;
      const id = crypto.randomUUID();
      const db = await getDb();

      const [result] = await db.insert(configsTable).values({ id, name, type, config }).returning({
        id: configsTable.id,
        createdAt: configsTable.createdAt,
      });

      logger.info(`Saved config ${id} of type ${type}`);

      res.json(ConfigSchemas.Create.Response.parse(result));
    } catch (error) {
      logger.error(`Error saving config: ${error}`);
      replyError(res, 500, 'Failed to save config');
    }
  },
);

configsRouter.get(
  ApiRoutes.Configs.ListByType.routerPath,
  async (req: Request, res: Response): Promise<void> => {
    const paramsResult = ConfigSchemas.ListByType.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }

    try {
      const { type } = paramsResult.data;
      const db = await getDb();
      const configs = await db
        .select({
          id: configsTable.id,
          name: configsTable.name,
          createdAt: configsTable.createdAt,
          updatedAt: configsTable.updatedAt,
        })
        .from(configsTable)
        .where(eq(configsTable.type, type))
        .orderBy(configsTable.updatedAt);

      logger.info(`Loaded ${configs.length} configs of type ${type}`);

      res.json(ConfigSchemas.ListByType.Response.parse({ configs }));
    } catch (error) {
      logger.error(`Error fetching configs: ${error}`);
      replyError(res, 500, 'Failed to fetch configs');
    }
  },
);

configsRouter.get(
  ApiRoutes.Configs.Get.routerPath,
  async (req: Request, res: Response): Promise<void> => {
    const paramsResult = ConfigSchemas.Get.Params.safeParse(req.params);
    if (!paramsResult.success) {
      replyValidationError(res, paramsResult.error);
      return;
    }

    try {
      const { type, id } = paramsResult.data;
      const db = await getDb();
      const [config] = await db
        .select()
        .from(configsTable)
        .where(and(eq(configsTable.type, type), eq(configsTable.id, id)))
        .limit(1);

      if (!config) {
        replyError(res, 404, 'Config not found');
        return;
      }

      logger.info(`Loaded config ${id} of type ${type}`);
      res.json(ConfigSchemas.Get.Response.parse(config));
    } catch (error) {
      logger.error(`Error fetching config: ${error}`);
      replyError(res, 500, 'Failed to fetch config');
    }
  },
);
