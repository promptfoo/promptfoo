import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../database/index';
import { configsTable } from '../../database/tables';
import logger from '../../logger';
import { ConfigSchemas } from '../../types/api/configs';
import { normalizeConfigDraft, UnifiedConfigDraftSchema } from '../../types/configDraft';
import { DEFAULT_CONFIG_EXTENSIONS } from '../../util/config/extensions';
import { sanitizeConfigForOutput } from '../../util/sanitizer';
import { loadYaml } from '../../util/yamlLoad';
import { sendError } from '../utils/errors';
import type { Request, Response } from 'express';

export const configsRouter = Router();

configsRouter.get('/eval/default/draft', async (_req: Request, res: Response): Promise<void> => {
  res.set('Cache-Control', 'no-store');
  try {
    for (const extension of DEFAULT_CONFIG_EXTENSIONS) {
      if (extension !== 'yaml' && extension !== 'yml') {
        continue;
      }

      let content: string;
      try {
        content = await readFile(path.resolve(`promptfooconfig.${extension}`), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      // Keep environment references intact and sanitize before sending data to the browser.
      const config = normalizeConfigDraft(UnifiedConfigDraftSchema.parse(loadYaml(content)));
      const { basePath: _basePath, env: _env, ...draft } = sanitizeConfigForOutput(config);
      res.json(ConfigSchemas.DefaultEval.Response.parse({ config: draft }));
      return;
    }

    res.json(ConfigSchemas.DefaultEval.Response.parse({ config: null }));
  } catch (error) {
    sendError(res, 500, 'Failed to load the default eval draft', error);
  }
});

configsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const queryResult = ConfigSchemas.List.Query.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
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
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ConfigSchemas.Create.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
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
    res.status(500).json({ error: 'Failed to save config' });
  }
});

configsRouter.get('/:type', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ConfigSchemas.ListByType.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
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
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.get('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = ConfigSchemas.Get.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
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
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    logger.info(`Loaded config ${id} of type ${type}`);
    res.json(ConfigSchemas.Get.Response.parse(config));
  } catch (error) {
    logger.error(`Error fetching config: ${error}`);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});
