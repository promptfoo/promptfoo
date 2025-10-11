import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { getDb } from '../../database/index';
import { configsTable } from '../../database/tables';
import logger from '../../logger';
import { api } from '../schemas';
import type { Request, Response } from 'express';

export const configsRouter = Router();

configsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  try {
    const { type } = api.configs.list.query.parse(req.query);
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

    res.json({ configs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
      return;
    }
    logger.error(`Error fetching configs: ${error}`);
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  try {
    const { name, type, config } = api.configs.create.post.body.parse(req.body);
    const id = uuidv4();

    const [result] = await db
      .insert(configsTable)
      .values({
        id,
        name,
        type,
        config,
      })
      .returning({
        id: configsTable.id,
        createdAt: configsTable.createdAt,
      });

    logger.info(`Saved config ${id} of type ${type}`);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
      return;
    }
    logger.error(`Error saving config: ${error}`);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

configsRouter.get('/:type', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  try {
    const { type } = api.configs.byType.params.parse(req.params);
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

    res.json({ configs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
      return;
    }
    logger.error(`Error fetching configs: ${error}`);
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.get('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  try {
    const { type, id } = api.configs.byType.byId.params.parse(req.params);
    const config = await db
      .select()
      .from(configsTable)
      .where(and(eq(configsTable.type, type), eq(configsTable.id, id)))
      .limit(1);

    logger.info(`Loaded config ${id} of type ${type}`);

    if (!config.length) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    res.json(config[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromError(error).toString() });
      return;
    }
    logger.error(`Error fetching config: ${error}`);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});
