import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../database/index';
import { configsTable } from '../../database/tables';
import logger from '../../logger';
import type { Request, Response } from 'express';

// Validation schemas for configs routes
const ConfigTypeSchema = z.enum(['redteam', 'eval', 'provider', 'prompt']);
type ConfigType = z.infer<typeof ConfigTypeSchema>;

const CreateConfigSchema = z.object({
  name: z.string().min(1, 'Config name is required'),
  type: ConfigTypeSchema,
  config: z.record(z.string(), z.unknown()),
});

const ConfigQuerySchema = z.object({
  type: ConfigTypeSchema.optional(),
});

const ConfigParamsSchema = z.object({
  type: ConfigTypeSchema,
  id: z.string().uuid(),
});

export const configsRouter = Router();

configsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();

  // Validate query parameters
  const queryResult = ConfigQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    res.status(400).json({ error: z.prettifyError(queryResult.error) });
    return;
  }
  const { type } = queryResult.data;

  try {
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
    logger.error(`Error fetching configs: ${error}`);
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();

  // Validate request body
  const parseResult = CreateConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: z.prettifyError(parseResult.error) });
    return;
  }
  const { name, type, config } = parseResult.data;

  try {
    const id = crypto.randomUUID();

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
    logger.error(`Error saving config: ${error}`);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

configsRouter.get('/:type', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();

  // Validate path parameter
  const typeResult = ConfigTypeSchema.safeParse(req.params.type);
  if (!typeResult.success) {
    res.status(400).json({ error: z.prettifyError(typeResult.error) });
    return;
  }
  const type = typeResult.data;

  try {
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
    logger.error(`Error fetching configs: ${error}`);
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

configsRouter.get('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  const db = await getDb();

  // Validate path parameters
  const paramsResult = ConfigParamsSchema.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }
  const { type, id } = paramsResult.data;

  try {
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
    logger.error(`Error fetching config: ${error}`);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});
