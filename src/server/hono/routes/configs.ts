import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDb } from '../../../database/index';
import { configsTable } from '../../../database/tables';
import logger from '../../../logger';

export const configsRouter = new Hono();

configsRouter.get('/', async (c) => {
  const db = await getDb();
  try {
    const type = c.req.query('type');
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

    return c.json({ configs });
  } catch (error) {
    logger.error(`Error fetching configs: ${error}`);
    return c.json({ error: 'Failed to fetch configs' }, 500);
  }
});

configsRouter.post('/', async (c) => {
  const db = await getDb();
  try {
    const { name, type, config } = await c.req.json();
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

    return c.json(result);
  } catch (error) {
    logger.error(`Error saving config: ${error}`);
    return c.json({ error: 'Failed to save config' }, 500);
  }
});

configsRouter.get('/:type', async (c) => {
  const db = await getDb();
  const type = c.req.param('type');
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

    return c.json({ configs });
  } catch (error) {
    logger.error(`Error fetching configs: ${error}`);
    return c.json({ error: 'Failed to fetch configs' }, 500);
  }
});

configsRouter.get('/:type/:id', async (c) => {
  const db = await getDb();
  const type = c.req.param('type');
  const id = c.req.param('id');
  try {
    const config = await db
      .select()
      .from(configsTable)
      .where(and(eq(configsTable.type, type), eq(configsTable.id, id)))
      .limit(1);

    logger.info(`Loaded config ${id} of type ${type}`);

    if (!config.length) {
      return c.json({ error: 'Config not found' }, 404);
    }

    return c.json(config[0]);
  } catch (error) {
    logger.error(`Error fetching config: ${error}`);
    return c.json({ error: 'Failed to fetch config' }, 500);
  }
});

export default configsRouter;
